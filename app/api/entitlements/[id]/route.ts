import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";

type Params = { params: { id: string } };

type EntitlementPatchBody = {
  status?: string;
  constraints?: Record<string, unknown>;
  activated_flags?: string[];
  locked_flags?: string[];
  provisioning_status?: string;
};

export async function PATCH(request: NextRequest, { params }: Params) {
  const db = getDb();
  const existing = db
    .prepare("SELECT entitlement_id FROM entitlements WHERE entitlement_id = ?")
    .get(params.id) as { entitlement_id: string } | undefined;

  if (!existing) {
    return NextResponse.json({ error: "Entitlement not found" }, { status: 404 });
  }

  const body = (await request.json()) as EntitlementPatchBody;
  db.prepare(
    `
    UPDATE entitlements
    SET status = COALESCE(@status, status),
        constraints = COALESCE(@constraints, constraints),
        activated_flags = COALESCE(@activated_flags, activated_flags),
        locked_flags = COALESCE(@locked_flags, locked_flags),
        provisioning_status = COALESCE(@provisioning_status, provisioning_status)
    WHERE entitlement_id = @entitlement_id
    `,
  ).run({
    entitlement_id: params.id,
    status: body.status ?? null,
    constraints: body.constraints ? JSON.stringify(body.constraints) : null,
    activated_flags: body.activated_flags ? JSON.stringify(body.activated_flags) : null,
    locked_flags: body.locked_flags ? JSON.stringify(body.locked_flags) : null,
    provisioning_status: body.provisioning_status ?? null,
  });

  const row = db
    .prepare(
      `
      SELECT
        entitlement_id, account_id, sku_id, status, start_date, end_date, constraints,
        activated_flags, locked_flags, provisioning_status, created_at
      FROM entitlements
      WHERE entitlement_id = ?
      `,
    )
    .get(params.id) as
    | {
        entitlement_id: string;
        account_id: string;
        sku_id: string;
        status: string;
        start_date: string | null;
        end_date: string | null;
        constraints: string;
        activated_flags: string;
        locked_flags: string;
        provisioning_status: string;
        created_at: string;
      }
    | undefined;

  if (!row) {
    return NextResponse.json({ error: "Entitlement not found" }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      ...row,
      constraints: JSON.parse(row.constraints),
      activated_flags: JSON.parse(row.activated_flags),
      locked_flags: JSON.parse(row.locked_flags),
    },
  });
}
