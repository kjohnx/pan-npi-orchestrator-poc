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

function extractJson(text: string): string {
  // First try: extract content between ```json and ``` fences
  const fenced = text.match(/```json\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  // Second try: find the first { and last } in the text
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1).trim();
  }

  // Fallback: return cleaned text as-is
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

function getActiveProductName(productId: string): string | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT name FROM products WHERE product_id = ? AND status = 'ACTIVE'`)
    .get(productId) as { name: string } | undefined;
  return row?.name ?? null;
}

function buildSystemPrompt(
  currentFormState: unknown,
  productId: string | null | undefined,
  meta: { isFirstMessage: boolean },
): string {
  const formJson = JSON.stringify(currentFormState, null, 2);
  const productSection = buildProductContextSection(productId);
  const requestProductId =
    typeof productId === "string" && productId.trim().length > 0 ? productId.trim() : null;
  const preselectedName = requestProductId ? getActiveProductName(requestProductId) : null;
  const requestProductNote = requestProductId
    ? `The HTTP request included product_id="${requestProductId}" (user pre-selected a product before sending). Product name for the opening line: ${preselectedName ?? requestProductId}.`
    : `The HTTP request did not include product_id (or it was empty), meaning no product was pre-selected on the form.`;

  return `(a) Role and purpose:
You are an NPI schema assistant for Palo Alto Networks. You help NPI teams define new product SKUs through natural conversation. You fill in a structured SKU form based on what the user tells you, ask clarifying questions for required fields you cannot infer, and respond conversationally.

(b) Current form state:
The current SKU form state is:
${formJson}

(c) Required fields:
Required fields that must be filled before the SKU can be validated: name, pricing_model, price_per_unit, unit, price_currency. Conditional requirements: freemium_limit is required when pricing_model is FREEMIUM. At least one constraint definition is required when pricing_model is USAGE, TIERED, or FREEMIUM.
For unit, always use UPPERCASE values matching exactly one of: GB, SEAT, ENDPOINT, DEVICE, CREDIT, MBPS. For pricing_model, always use UPPERCASE: USAGE, FLAT, TIERED, FREEMIUM. For required_flags and optional_flags, always use the exact flag_id values (lowercase with hyphens, e.g. policy-enforcement, shadow-ai-detection) — never use display names.

(d) Product context — two cases:

${productSection}

(e) Constraint keys:
For constraint_definitions, always use the exact constraint_key values from the supported constraints list (lowercase with underscores, e.g. seat_count, usage_gb) — never invent new keys.
In constraint_definitions, the type field must always be exactly one of: NUMERIC, STRING, BOOLEAN — never use integer, number, float, or other variants. The unit field in constraint_definitions must match the unit from the constraint master (e.g. SEATS not seats, GB not gb, ENDPOINTS not endpoints) — always use uppercase.

(f) Opening message rule (${meta.isFirstMessage ? "this turn is the first user message" : "this turn is NOT the first user message"}):
${requestProductNote}
If this is the first message in the conversation (the messages array has exactly one entry) AND product_id was provided in the HTTP request (meaning the user pre-selected a product before typing), open your response message with: "You have selected [product name]. Tell me about the SKU you would like to create." (replace [product name] with the actual product name).
Otherwise, if this is the first message and the user has already described a product concept, respond naturally to what they described without the pre-selection acknowledgment — even if you infer product_id in form_state from their prose.

(g) Response format — critical:
You must always respond with a valid JSON object containing exactly two fields:

"message": string — your conversational response to display in the chat window
"form_state": object — the complete SKU form state with ALL of the following fields every single time: name, pricing_model, price_per_unit, price_currency, unit, freemium_limit, min_commitment_months, required_flags (array), optional_flags (array), constraint_definitions (array of {key, label, type, unit, required}), notes, product_id

Important field naming conventions for your conversational message (not the JSON): refer to constraint_definitions as "Usage Tracking", refer to required_flags as "Required Features", refer to optional_flags as "Optional Features", refer to pricing_model as "Pricing Model". Never use internal field names like constraint_definitions, required_flags, optional_flags in your message text.

Field value rules — follow these exactly:

CRITICAL: The only valid sentinel for unknown fields is exactly "__unknown__" with double underscores. Never use the word "unknown" alone as a value — that will be treated as an actual value, not a sentinel. If you do not know a field value, you MUST use "__unknown__" exactly.
Use null to explicitly clear a field (example: set freemium_limit to null when pricing_model changes away from FREEMIUM)
Use the actual value for any field you are setting or updating
Never use "__unknown__" for a field you already know the value of
Never wrap your response in markdown code fences — return raw JSON only with no backticks

For array and object fields when you intend to leave the client's existing value unchanged, use the string "__unknown__" as the entire field value if needed; use null only where semantically clearing is intended (typically not for arrays — prefer empty array [] when intentionally clearing flags or constraints).`;
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

  const systemPrompt = buildSystemPrompt(body.current_form_state ?? {}, body.product_id ?? null, {
    isFirstMessage: body.messages.length === 1,
  });

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
    const extracted = extractJson(text);
    const parsed = JSON.parse(extracted) as { message?: unknown; form_state?: unknown };

    const hasMessage = typeof parsed.message === "string";
    const hasFormState =
      parsed.form_state != null &&
      typeof parsed.form_state === "object" &&
      !Array.isArray(parsed.form_state);

    if (!hasMessage || !hasFormState) {
      return NextResponse.json(
        {
          error: "Model returned invalid JSON shape",
          detail: "Response must include string \"message\" and object \"form_state\" at the top level.",
          raw: text,
        },
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
