import { NextRequest, NextResponse } from "next/server";
import { validateSkuDraft, type SkuFacts } from "@/lib/rules/sku-rules";

type ConstraintDefInput = {
  key?: string;
  label?: string;
  type?: string;
  unit?: string;
  required?: boolean;
};

type SkuDraftInput = {
  pricing_model?: string;
  freemium_limit?: number | null;
  min_commitment_months?: number | null;
  unit?: string | null;
  price_per_unit?: number | null;
  constraint_definitions?: ConstraintDefInput[];
  name?: string;
  notes?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    draft?: SkuDraftInput;
    product_id?: string;
  };

  if (!body.draft || typeof body.draft !== "object") {
    return NextResponse.json({ error: "draft is required" }, { status: 400 });
  }

  const draft = body.draft;
  const defs = Array.isArray(draft.constraint_definitions) ? draft.constraint_definitions : [];

  const facts: SkuFacts = {
    pricing_model: typeof draft.pricing_model === "string" ? draft.pricing_model : "",
    freemium_limit:
      typeof draft.freemium_limit === "number" && Number.isFinite(draft.freemium_limit)
        ? draft.freemium_limit
        : draft.freemium_limit === null
          ? null
          : null,
    min_commitment_months:
      typeof draft.min_commitment_months === "number" && Number.isFinite(draft.min_commitment_months)
        ? draft.min_commitment_months
        : 0,
    unit:
      draft.unit === undefined || draft.unit === null
        ? null
        : String(draft.unit).trim() === ""
          ? ""
          : String(draft.unit),
    price_per_unit:
      typeof draft.price_per_unit === "number" && Number.isFinite(draft.price_per_unit)
        ? draft.price_per_unit
        : draft.price_per_unit === null
          ? null
          : null,
    constraint_definitions_count: defs.length,
  };

  const result = await validateSkuDraft(facts);
  return NextResponse.json({ valid: result.valid, errors: result.errors });
}
