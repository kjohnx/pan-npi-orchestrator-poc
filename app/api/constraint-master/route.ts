import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";

export async function GET(request: NextRequest) {
  const db = getDb();
  const keysParam = request.nextUrl.searchParams.get("keys");

  if (keysParam?.trim()) {
    const keys = keysParam
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    if (keys.length === 0) {
      const rows = db
        .prepare(`SELECT * FROM constraint_master WHERE status = 'ACTIVE'`)
        .all();
      return NextResponse.json(rows);
    }
    const placeholders = keys.map(() => "?").join(", ");
    const rows = db
      .prepare(
        `SELECT * FROM constraint_master WHERE status = 'ACTIVE' AND constraint_key IN (${placeholders})`,
      )
      .all(...keys);
    return NextResponse.json(rows);
  }

  const rows = db.prepare(`SELECT * FROM constraint_master WHERE status = 'ACTIVE'`).all();
  return NextResponse.json(rows);
}
