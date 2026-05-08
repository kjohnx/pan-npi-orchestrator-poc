import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { parseJson, toEntitlementId } from "@/lib/api/utils";

type EntitlementRow = {
  entitlement_id: string;
  account_id: string;
  account_name: string;
  account_tier: string;
  sku_id: string;
  sku_name: string;
  is_bundle: number;
  sku_pricing_model: string | null;
  sku_freemium_limit: number | null;
  product_id: string | null;
  product_name: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  constraints: string;
  activated_flags: string;
  locked_flags: string;
  provisioning_status: string;
  created_at: string;
  sku_constraint_definitions: string;
  component_sku_ids: string;
};

type FeatureFlagRow = {
  flag_id: string;
  display_name: string;
  status: string;
};

type CreateEntitlementBody = {
  account_id?: string;
  sku_id?: string;
  status?: string;
  start_date?: string | null;
  end_date?: string | null;
  constraints?: Record<string, unknown>;
  activated_flags?: string[];
  locked_flags?: string[];
  provisioning_status?: string;
};

const ENTITLEMENT_QUERY = `
  SELECT
    e.entitlement_id, e.account_id, a.company_name as account_name, a.tier as account_tier, e.sku_id,
    s.name as sku_name, s.is_bundle, s.pricing_model as sku_pricing_model, s.freemium_limit as sku_freemium_limit,
    s.component_sku_ids,
    s.product_id, p.name as product_name,
    e.status, e.start_date, e.end_date, e.constraints, e.activated_flags,
    e.locked_flags, e.provisioning_status, e.created_at,
    s.constraint_definitions as sku_constraint_definitions
  FROM entitlements e
  JOIN customer_accounts a ON a.account_id = e.account_id
  JOIN skus s ON s.sku_id = e.sku_id
  LEFT JOIN products p ON p.product_id = s.product_id
`;

function mapEntitlement(
  row: EntitlementRow,
  getFlags: (flagIdsJson: string) => FeatureFlagRow[],
) {
  const activatedFlags = parseJson<string[]>(row.activated_flags, []);
  const lockedFlags = parseJson<string[]>(row.locked_flags, []);
  return {
    ...row,
    constraints: parseJson<Record<string, unknown>>(row.constraints, {}),
    activated_flags: activatedFlags,
    locked_flags: lockedFlags,
    sku_constraint_definitions: parseJson<unknown[]>(row.sku_constraint_definitions, []),
    component_sku_ids: parseJson<string[]>(row.component_sku_ids, []),
    activated_flag_details: getFlags(JSON.stringify(activatedFlags)),
    locked_flag_details: getFlags(JSON.stringify(lockedFlags)),
  };
}

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account_id");
  if (!accountId) {
    return NextResponse.json({ error: "account_id query param is required" }, { status: 400 });
  }

  const db = getDb();
  const rows = db
    .prepare(`${ENTITLEMENT_QUERY} WHERE e.account_id = ? ORDER BY e.created_at DESC`)
    .all(accountId) as EntitlementRow[];

  const getFlagsQuery = db.prepare(
    `
    SELECT flag_id, display_name, status
    FROM feature_flags
    WHERE status = 'ACTIVE' AND flag_id IN (SELECT value FROM json_each(?))
    ORDER BY display_name ASC
    `,
  );
  const getFlags = (flagIdsJson: string) => getFlagsQuery.all(flagIdsJson) as FeatureFlagRow[];

  return NextResponse.json({ data: rows.map((row) => mapEntitlement(row, getFlags)) });
}

export async function POST(request: NextRequest) {
  const db = getDb();
  const body = (await request.json()) as CreateEntitlementBody;
  if (!body.account_id || !body.sku_id) {
    return NextResponse.json({ error: "account_id and sku_id are required" }, { status: 400 });
  }

  const sku = db
    .prepare("SELECT required_flags, optional_flags FROM skus WHERE sku_id = ?")
    .get(body.sku_id) as { required_flags: string; optional_flags: string } | undefined;

  if (!sku) {
    return NextResponse.json({ error: "SKU not found" }, { status: 404 });
  }

  const duplicate = db
    .prepare(
      `
      SELECT entitlement_id
      FROM entitlements
      WHERE account_id = ? AND sku_id = ? AND status = 'ACTIVE'
      LIMIT 1
      `,
    )
    .get(body.account_id, body.sku_id) as { entitlement_id: string } | undefined;
  if (duplicate) {
    return NextResponse.json({ error: "duplicate" }, { status: 409 });
  }

  const entitlementId = toEntitlementId();
  db.prepare(
    `
    INSERT INTO entitlements (
      entitlement_id, account_id, sku_id, status, start_date, end_date, constraints,
      activated_flags, locked_flags, provisioning_status
    ) VALUES (
      @entitlement_id, @account_id, @sku_id, @status, @start_date, @end_date, @constraints,
      @activated_flags, @locked_flags, @provisioning_status
    )
    `,
  ).run({
    entitlement_id: entitlementId,
    account_id: body.account_id,
    sku_id: body.sku_id,
    status: body.status ?? "ACTIVE",
    start_date: body.start_date ?? null,
    end_date: body.end_date ?? null,
    constraints: JSON.stringify(body.constraints ?? {}),
    activated_flags: JSON.stringify(body.activated_flags ?? parseJson<string[]>(sku.required_flags, [])),
    locked_flags: JSON.stringify(body.locked_flags ?? parseJson<string[]>(sku.optional_flags, [])),
    provisioning_status: body.provisioning_status ?? "PENDING",
  });

  const row = db
    .prepare(`${ENTITLEMENT_QUERY} WHERE e.entitlement_id = ?`)
    .get(entitlementId) as EntitlementRow | undefined;
  const getFlagsQuery = db.prepare(
    `
    SELECT flag_id, display_name, status
    FROM feature_flags
    WHERE status = 'ACTIVE' AND flag_id IN (SELECT value FROM json_each(?))
    ORDER BY display_name ASC
    `,
  );
  const getFlags = (flagIdsJson: string) => getFlagsQuery.all(flagIdsJson) as FeatureFlagRow[];
  return NextResponse.json({ data: row ? mapEntitlement(row, getFlags) : null }, { status: 201 });
}
