import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { parseJson } from "@/lib/api/utils";

type Params = { params: { sku_id: string } };

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

type EntitlementRow = {
  entitlement_id: string;
  constraints: string;
};

const SKU_QUERY = `
  SELECT
    s.sku_id, s.product_id, p.name as product_name, s.name, s.status, s.is_bundle,
    s.component_sku_ids, s.pricing_model, s.price_per_unit, s.price_currency, s.unit,
    s.freemium_limit, s.min_commitment_months, s.required_flags, s.optional_flags,
    s.constraint_definitions, s.version, s.created_at
  FROM skus s
  LEFT JOIN products p ON p.product_id = s.product_id
  WHERE s.sku_id = ?
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

export async function GET(_: NextRequest, { params }: Params) {
  const db = getDb();
  const row = db.prepare(SKU_QUERY).get(params.sku_id) as SkuRow | undefined;
  if (!row) {
    return NextResponse.json({ error: "SKU not found" }, { status: 404 });
  }
  return NextResponse.json({ data: mapSkuRow(row) });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const db = getDb();
  const current = db.prepare("SELECT * FROM skus WHERE sku_id = ?").get(params.sku_id) as
    | Record<string, unknown>
    | undefined;

  if (!current) {
    return NextResponse.json({ error: "SKU not found" }, { status: 404 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const pricingChanged =
    Object.hasOwn(body, "pricing_model") && body.pricing_model !== current.pricing_model;
  const freemiumChanged =
    Object.hasOwn(body, "freemium_limit") && body.freemium_limit !== current.freemium_limit;

  const next = {
    product_id: (body.product_id as string | null | undefined) ?? (current.product_id as string | null),
    name: (body.name as string | undefined) ?? (current.name as string),
    status: (body.status as string | undefined) ?? (current.status as string),
    is_bundle:
      typeof body.is_bundle === "boolean" ? (body.is_bundle ? 1 : 0) : (current.is_bundle as number),
    component_sku_ids: JSON.stringify(
      (body.component_sku_ids as string[] | undefined) ??
        parseJson<string[]>(current.component_sku_ids as string, []),
    ),
    pricing_model:
      (body.pricing_model as string | null | undefined) ?? (current.pricing_model as string | null),
    price_per_unit:
      (body.price_per_unit as number | null | undefined) ?? (current.price_per_unit as number | null),
    price_currency:
      (body.price_currency as string | undefined) ?? (current.price_currency as string | null),
    unit: (body.unit as string | null | undefined) ?? (current.unit as string | null),
    freemium_limit:
      (body.freemium_limit as number | null | undefined) ?? (current.freemium_limit as number | null),
    min_commitment_months:
      (body.min_commitment_months as number | undefined) ?? (current.min_commitment_months as number),
    required_flags: JSON.stringify(
      (body.required_flags as string[] | undefined) ??
        parseJson<string[]>(current.required_flags as string, []),
    ),
    optional_flags: JSON.stringify(
      (body.optional_flags as string[] | undefined) ??
        parseJson<string[]>(current.optional_flags as string, []),
    ),
    constraint_definitions: JSON.stringify(
      (body.constraint_definitions as unknown[] | undefined) ??
        parseJson<unknown[]>(current.constraint_definitions as string, []),
    ),
  };

  db.prepare(
    `
    UPDATE skus
    SET product_id = @product_id,
        name = @name,
        status = @status,
        is_bundle = @is_bundle,
        component_sku_ids = @component_sku_ids,
        pricing_model = @pricing_model,
        price_per_unit = @price_per_unit,
        price_currency = @price_currency,
        unit = @unit,
        freemium_limit = @freemium_limit,
        min_commitment_months = @min_commitment_months,
        required_flags = @required_flags,
        optional_flags = @optional_flags,
        constraint_definitions = @constraint_definitions,
        version = version + 1
    WHERE sku_id = @sku_id
    `,
  ).run({ ...next, sku_id: params.sku_id });

  if (pricingChanged || freemiumChanged) {
    const activeEntitlements = db
      .prepare(
        `
        SELECT entitlement_id, constraints
        FROM entitlements
        WHERE sku_id = ? AND status = 'ACTIVE'
        `,
      )
      .all(params.sku_id) as EntitlementRow[];

    const definitions = parseJson<Array<{ key?: string }>>(next.constraint_definitions, []);
    const firstNumericKey = definitions.find((def) => def.key)?.key;

    if (firstNumericKey) {
      const updateEntitlement = db.prepare(
        `
        UPDATE entitlements
        SET constraints = ?
        WHERE entitlement_id = ?
        `,
      );

      for (const entitlement of activeEntitlements) {
        const constraints = parseJson<Record<string, unknown>>(entitlement.constraints, {});
        const value = constraints[firstNumericKey];
        if (value && typeof value === "object") {
          const nextConstraint = {
            ...(value as Record<string, unknown>),
            freemium_limit: next.freemium_limit,
          };
          constraints[firstNumericKey] = nextConstraint;
          updateEntitlement.run(JSON.stringify(constraints), entitlement.entitlement_id);
        }
      }
    }
  }

  const row = db.prepare(SKU_QUERY).get(params.sku_id) as SkuRow | undefined;
  return NextResponse.json({ data: row ? mapSkuRow(row) : null });
}
