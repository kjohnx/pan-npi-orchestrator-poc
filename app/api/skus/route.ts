import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { parseJson, toSkuId, toSubmissionId } from "@/lib/api/utils";

type SkuRow = {
  sku_id: string;
  product_id: string | null;
  product_name: string | null;
  name: string;
  status: string;
  is_bundle: number;
  component_sku_ids: string;
  pricing_model: string | null;
  price_per_unit: number | null;
  price_currency: string | null;
  unit: string | null;
  freemium_limit: number | null;
  min_commitment_months: number;
  required_flags: string;
  optional_flags: string;
  constraint_definitions: string;
  version: number;
  created_at: string;
};

type CreateSkuBody = {
  product_id?: string | null;
  name?: string;
  status?: string;
  is_bundle?: boolean;
  component_sku_ids?: string[];
  pricing_model?: string | null;
  price_per_unit?: number | null;
  price_currency?: string;
  unit?: string | null;
  freemium_limit?: number | null;
  min_commitment_months?: number;
  required_flags?: string[];
  optional_flags?: string[];
  constraint_definitions?: unknown[];
  submitted_by?: string;
  raw_input?: string;
};

const SKU_QUERY = `
  SELECT
    s.sku_id, s.product_id, p.name as product_name, s.name, s.status, s.is_bundle,
    s.component_sku_ids, s.pricing_model, s.price_per_unit, s.price_currency, s.unit,
    s.freemium_limit, s.min_commitment_months, s.required_flags, s.optional_flags,
    s.constraint_definitions, s.version, s.created_at
  FROM skus s
  LEFT JOIN products p ON p.product_id = s.product_id
`;

function mapSkuRow(row: SkuRow) {
  return {
    ...row,
    is_bundle: row.is_bundle === 1,
    component_sku_ids: parseJson<string[]>(row.component_sku_ids, []),
    required_flags: parseJson<string[]>(row.required_flags, []),
    optional_flags: parseJson<string[]>(row.optional_flags, []),
    constraint_definitions: parseJson<unknown[]>(row.constraint_definitions, []),
  };
}

export async function GET() {
  const db = getDb();
  const rows = db.prepare(`${SKU_QUERY} ORDER BY s.name ASC`).all() as SkuRow[];
  return NextResponse.json({ data: rows.map(mapSkuRow) });
}

export async function POST(request: NextRequest) {
  const db = getDb();
  const body = (await request.json()) as CreateSkuBody;

  if (!body.name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const skuId = toSkuId(body.name);
  const payload = {
    sku_id: skuId,
    product_id: body.product_id ?? null,
    name: body.name,
    status: body.status ?? "DRAFT",
    is_bundle: body.is_bundle ? 1 : 0,
    component_sku_ids: JSON.stringify(body.component_sku_ids ?? []),
    pricing_model: body.pricing_model ?? null,
    price_per_unit: body.price_per_unit ?? null,
    price_currency: body.price_currency ?? "USD",
    unit: body.unit ?? null,
    freemium_limit: body.freemium_limit ?? null,
    min_commitment_months: body.min_commitment_months ?? 12,
    required_flags: JSON.stringify(body.required_flags ?? []),
    optional_flags: JSON.stringify(body.optional_flags ?? []),
    constraint_definitions: JSON.stringify(body.constraint_definitions ?? []),
  };

  db.prepare(
    `
    INSERT INTO skus (
      sku_id, product_id, name, status, is_bundle, component_sku_ids, pricing_model,
      price_per_unit, price_currency, unit, freemium_limit, min_commitment_months,
      required_flags, optional_flags, constraint_definitions
    ) VALUES (
      @sku_id, @product_id, @name, @status, @is_bundle, @component_sku_ids, @pricing_model,
      @price_per_unit, @price_currency, @unit, @freemium_limit, @min_commitment_months,
      @required_flags, @optional_flags, @constraint_definitions
    )
    `,
  ).run(payload);

  db.prepare(
    `
    INSERT INTO npi_submissions (
      submission_id, submitted_by, raw_input, generated_schema, final_schema, resulting_sku_id, status
    ) VALUES (
      @submission_id, @submitted_by, @raw_input, @generated_schema, @final_schema, @resulting_sku_id, 'PUBLISHED'
    )
    `,
  ).run({
    submission_id: toSubmissionId(),
    submitted_by: body.submitted_by ?? "npi-team",
    raw_input: body.raw_input ?? "",
    generated_schema: JSON.stringify(body),
    final_schema: JSON.stringify(body),
    resulting_sku_id: skuId,
  });

  const row = db
    .prepare(`${SKU_QUERY} WHERE s.sku_id = ?`)
    .get(skuId) as SkuRow | undefined;

  return NextResponse.json({ data: row ? mapSkuRow(row) : null }, { status: 201 });
}
