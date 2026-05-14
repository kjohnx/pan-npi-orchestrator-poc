import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { parseJson } from "@/lib/api/utils";

type ChatMessage = { role: "user" | "assistant"; content: string };

type AnthropicResponse = {
  content?: Array<{
    type: string;
    text?: string;
  }>;
};

function stripMarkdownFences(text: string): string {
  return text.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
}

function buildProductContextSection(productId: string | null | undefined): string {
  const db = getDb();

  if (typeof productId === "string" && productId.trim().length > 0) {
    const id = productId.trim();
    const row = db
      .prepare(
        `SELECT name, available_flags, supported_constraints FROM products WHERE product_id = ? AND status = 'ACTIVE'`,
      )
      .get(id) as { name: string; available_flags: string; supported_constraints: string } | undefined;

    if (!row) {
      return `Product context: product_id "${id}" was not found as an ACTIVE product. Ask the user to pick a valid product from the catalog.`;
    }

    const flagIds = parseJson<string[]>(row.available_flags, []);
    const constraintKeys = parseJson<string[]>(row.supported_constraints, []);

    const placeholders = constraintKeys.map(() => "?").join(", ");
    const constraintRows =
      constraintKeys.length > 0
        ? (db
            .prepare(
              `SELECT constraint_key, display_name, unit, llm_hint FROM constraint_master WHERE status = 'ACTIVE' AND constraint_key IN (${placeholders})`,
            )
            .all(...constraintKeys) as Array<{
            constraint_key: string;
            display_name: string;
            unit: string;
            llm_hint: string | null;
          }>)
        : [];

    const flagList = flagIds.length ? flagIds.join(", ") : "(none)";
    const constraintList =
      constraintRows.length > 0
        ? constraintRows
            .map(
              (c) =>
                `{ constraint_key: ${c.constraint_key}, display_name: ${JSON.stringify(c.display_name)}, unit: ${JSON.stringify(c.unit)}, llm_hint: ${JSON.stringify(c.llm_hint ?? "")} }`,
            )
            .join(", ")
        : "(none)";

    return `The selected product is ${row.name}. Available feature flags for this product — use only these flag_ids in required_flags and optional_flags: ${flagList}. Supported constraints for this product — use only these constraint_keys: ${constraintList}. If the user mentions a flag or constraint not in these lists, say so in your message and list what is available for this product.`;
  }

  const products = db
    .prepare(`SELECT product_id, name FROM products WHERE status = 'ACTIVE' ORDER BY name ASC`)
    .all() as Array<{ product_id: string; name: string }>;

  const list =
    products.length > 0
      ? products.map((p) => `{ "product_id": ${JSON.stringify(p.product_id)}, "name": ${JSON.stringify(p.name)} }`).join(", ")
      : "(none — database has no ACTIVE products)";

  return `No product has been selected yet. Infer the most appropriate product from the user's description. Available products: ${list}. Set product_id in your form_state response when you can confidently infer it. If you cannot infer the product, ask the user to clarify or suggest they select it manually on the form.`;
}

function buildSystemPrompt(currentFormState: unknown, productId: string | null | undefined): string {
  const formJson = JSON.stringify(currentFormState, null, 2);
  const productSection = buildProductContextSection(productId);

  return `(a) Role and purpose:
You are an NPI schema assistant for Palo Alto Networks. You help NPI teams define new product SKUs through natural conversation. You fill in a structured SKU form based on what the user tells you, ask clarifying questions for required fields you cannot infer, and respond conversationally.

(b) Current form state:
The current SKU form state is:
${formJson}

(c) Required fields:
Required fields that must be filled before the SKU can be validated: name, pricing_model, price_per_unit, unit, price_currency. Conditional requirements: freemium_limit is required when pricing_model is FREEMIUM. At least one constraint definition is required when pricing_model is USAGE, TIERED, or FREEMIUM.

(d) Product context — two cases:

${productSection}

(e) Opening message rule:
If this is the first message in the conversation (the messages array has exactly one entry) and the current_form_state already has a product_id set (not null and not "__unknown__"), open your response message with exactly: "You have selected [product name]. Tell me about the SKU you would like to create." (replace [product name] with the actual product name). Otherwise respond naturally to the user's input.

(f) Response format — critical:
You must always respond with a valid JSON object containing exactly two fields:

"message": string — your conversational response to display in the chat window
"form_state": object — the complete SKU form state with ALL of the following fields every single time: name, pricing_model, price_per_unit, price_currency, unit, freemium_limit, min_commitment_months, required_flags (array), optional_flags (array), constraint_definitions (array of {key, label, type, unit, required}), notes, product_id

Field value rules — follow these exactly:

Use "unknown" for any field you do not yet have enough information to fill — the frontend will leave the existing form value unchanged for those fields
Use null to explicitly clear a field (example: set freemium_limit to null when pricing_model changes away from FREEMIUM)
Use the actual value for any field you are setting or updating
Never use "unknown" for a field you already know the value of
Never wrap your response in markdown code fences — return raw JSON only with no backticks

For array and object fields (required_flags, optional_flags, constraint_definitions), you may use the string "unknown" to mean leave the existing client value unchanged; use null only where semantically clearing is intended (typically not for arrays — prefer empty array [] when intentionally clearing flags or constraints).`;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 500 });
  }

  const body = (await request.json()) as {
    messages?: ChatMessage[];
    current_form_state?: object;
    product_id?: string | null;
  };

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages is required and must be a non-empty array" }, { status: 400 });
  }

  const systemPrompt = buildSystemPrompt(body.current_form_state ?? {}, body.product_id ?? null);

  const anthropicMessages = body.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      temperature: 0,
      system: systemPrompt,
      messages: anthropicMessages,
    }),
  });

  if (!anthropicResp.ok) {
    const errorText = await anthropicResp.text();
    return NextResponse.json(
      { error: "Anthropic request failed", detail: errorText },
      { status: anthropicResp.status >= 400 && anthropicResp.status < 600 ? anthropicResp.status : 502 },
    );
  }

  const data = (await anthropicResp.json()) as AnthropicResponse;
  const text = data.content?.find((item) => item.type === "text")?.text ?? "";
  if (!text.trim()) {
    return NextResponse.json({ error: "No output from model" }, { status: 502 });
  }

  try {
    const cleaned = stripMarkdownFences(text);
    const parsed = JSON.parse(cleaned) as { message?: unknown; form_state?: unknown };

    if (typeof parsed.message !== "string") {
      return NextResponse.json(
        { error: "Model returned invalid JSON shape", detail: "message must be a string", raw: text },
        { status: 502 },
      );
    }

    if (!parsed.form_state || typeof parsed.form_state !== "object" || Array.isArray(parsed.form_state)) {
      return NextResponse.json(
        { error: "Model returned invalid JSON shape", detail: "form_state must be an object", raw: text },
        { status: 502 },
      );
    }

    return NextResponse.json({
      message: parsed.message,
      form_state: parsed.form_state as object,
    });
  } catch {
    return NextResponse.json({ error: "Model returned invalid JSON", raw: text }, { status: 502 });
  }
}
