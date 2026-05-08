import { NextRequest, NextResponse } from "next/server";

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
dlp-inline, saas-visibility

If a field cannot be determined from the input, use null or an empty array.`;

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

  const body = (await request.json()) as { concept?: string };
  if (!body.concept?.trim()) {
    return NextResponse.json({ error: "concept is required" }, { status: 400 });
  }

  const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1200,
      temperature: 0,
      system: SYSTEM_PROMPT,
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
  const text = data.content?.find((item) => item.type === "text")?.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "No parse output from model" }, { status: 502 });
  }

  try {
    const parsed = JSON.parse(text);
    return NextResponse.json({ data: parsed });
  } catch {
    return NextResponse.json({ error: "Model returned invalid JSON", raw: text }, { status: 502 });
  }
}
