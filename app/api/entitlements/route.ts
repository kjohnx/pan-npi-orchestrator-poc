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
};

type CreateEntitlementBody = {
  account_id?: string;
  sku_id?: string;
  status?: string;
  start_date?: string | null;
  end_date?: string | null;
  constraints?: Record<string, unknown>;
  provisioning_status?: string;
};

const ENTITLEMENT_QUERY = `
  SELECT
    e.entitlement_id, e.account_id, a.company_name as account_name, a.tier as account_tier, e.sku_id,
    s.name as sku_name, s.product_id, p.name as product_name,
    e.status, e.start_date, e.end_date, e.constraints, e.activated_flags,
    e.locked_flags, e.provisioning_status, e.created_at,
    s.constraint_definitions as sku_constraint_definitions
  FROM entitlements e
  JOIN customer_accounts a ON a.account_id = e.account_id
  JOIN skus s ON s.sku_id = e.sku_id
  LEFT JOIN products p ON p.product_id = s.product_id
`;

function mapEntitlement(row: EntitlementRow) {
  return {
    ...row,
    constraints: parseJson<Record<string, unknown>>(row.constraints, {}),
    activated_flags: parseJson<string[]>(row.activated_flags, []),
    locked_flags: parseJson<string[]>(row.locked_flags, []),
    sku_constraint_definitions: parseJson<unknown[]>(row.sku_constraint_definitions, []),
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

  return NextResponse.json({ data: rows.map(mapEntitlement) });
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
    activated_flags: JSON.stringify(parseJson<string[]>(sku.required_flags, [])),
    locked_flags: JSON.stringify(parseJson<string[]>(sku.optional_flags, [])),
    provisioning_status: body.provisioning_status ?? "PENDING",
  });

  const row = db
    .prepare(`${ENTITLEMENT_QUERY} WHERE e.entitlement_id = ?`)
    .get(entitlementId) as EntitlementRow | undefined;
  return NextResponse.json({ data: row ? mapEntitlement(row) : null }, { status: 201 });
}
