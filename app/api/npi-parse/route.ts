import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { parseJson } from "@/lib/api/utils";

const SYSTEM_PROMPT = `You are an NPI schema parser for Palo Alto Networks. When given a plain-English
product concept, extract the structured fields and return ONLY a valid JSON object.
Do not include any explanation, preamble, or markdown code fences. Return raw JSON only.

The JSON must match this structure:
{
  "name": string,
  "pricing_model": "USAGE" | "FLAT" | "TIERED" | "FREEMIUM",
  "price_per_unit": number,
  "price_currency": "USD",
  "unit": "GB" | "SEAT" | "ENDPOINT" | "DEVICE" | "CREDIT" | "MBPS",
  "freemium_limit": number | null,
  "min_commitment_months": number,
  "required_flags": string[],
  "optional_flags": string[],
  "constraint_definitions": [
    { "key": string, "label": string, "type": "NUMERIC" | "STRING" | "BOOLEAN", "unit": string, "required": boolean }
  ],
  "notes": string
}

For required_flags and optional_flags, use only these valid flag_ids:
advanced-heuristics, behavioral-analytics, threat-intel-feed, auto-remediation,
dlp-inline, saas-visibility, policy-enforcement, shadow-ai-detection

If a field cannot be determined from the input, use null or an empty array.
Infer sensible constraint_definitions based on the pricing_model and unit when they are implied by the concept.
For example: USAGE/FREEMIUM usually needs a numeric usage metric (such as usage_gb), FLAT often uses seat/device/endpoint count, and TIERED should include the tier-driving metric.
Do not wrap the JSON in markdown code fences. Return raw JSON only with no backticks.`;

function buildProductPromptSuffix(productId: string): string {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT available_flags, supported_constraints FROM products WHERE product_id = ? AND status = 'ACTIVE'`,
    )
    .get(productId) as { available_flags: string; supported_constraints: string } | undefined;

  if (!row) {
    return "";
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

  return `

The selected product has these available feature flags (use only these flag_ids in required_flags and optional_flags): ${flagList}. The selected product supports these constraints (use only these constraint_keys in constraint_definitions): ${constraintList}. If the user mentions a flag or constraint not in these lists, do not populate it — instead add a note in the notes field explaining it is not available for this product and list what is available.`;
}

type AnthropicResponse = {
  content?: Array<{
    type: string;
    text?: string;
  }>;
};

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 500 });
  }

  const body = (await request.json()) as { concept?: string; product_id?: string };
  if (!body.concept?.trim()) {
    return NextResponse.json({ error: "concept is required" }, { status: 400 });
  }

  const productSuffix =
    typeof body.product_id === "string" && body.product_id.trim().length > 0
      ? buildProductPromptSuffix(body.product_id.trim())
      : "";

  const systemPrompt = SYSTEM_PROMPT + productSuffix;

  const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 1200,
      temperature: 0,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: body.concept,
        },
      ],
    }),
  });

  if (!anthropicResp.ok) {
    const errorText = await anthropicResp.text();
    return NextResponse.json(
      { error: "Anthropic request failed", detail: errorText },
      { status: anthropicResp.status },
    );
  }

  const data = (await anthropicResp.json()) as AnthropicResponse;
  const text = data.content?.find((item) => item.type === "text")?.text ?? "";
  if (!text.trim()) {
    return NextResponse.json({ error: "No parse output from model" }, { status: 502 });
  }

  try {
    const cleaned = text.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned);
    return NextResponse.json({ data: parsed, raw: text });
  } catch {
    return NextResponse.json(
      { error: "Model returned invalid JSON", raw: text },
      { status: 502 },
    );
  }
}
