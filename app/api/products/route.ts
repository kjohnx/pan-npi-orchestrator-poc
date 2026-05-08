import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { parseJson } from "@/lib/api/utils";

type ProductRow = {
  product_id: string;
  name: string;
  description: string | null;
  product_line: string | null;
  status: string;
  available_flags: string;
  created_at: string;
};

type FlagRow = {
  flag_id: string;
  display_name: string;
  description: string | null;
  default_state: string;
  status: string;
};

export async function GET() {
  const db = getDb();
  const products = db
    .prepare(
      `
      SELECT product_id, name, description, product_line, status, available_flags, created_at
      FROM products
      ORDER BY name ASC
      `,
    )
    .all() as ProductRow[];

  const getFlags = db.prepare(
    `
    SELECT flag_id, display_name, description, default_state, status
    FROM feature_flags
    WHERE flag_id IN (SELECT value FROM json_each(?))
      AND status = 'ACTIVE'
    ORDER BY display_name ASC
    `,
  );

  const payload = products.map((product) => {
    const availableFlags = parseJson<string[]>(product.available_flags, []);
    const flagDetails = getFlags.all(JSON.stringify(availableFlags)) as FlagRow[];
    return {
      ...product,
      available_flags: availableFlags,
      flag_details: flagDetails,
    };
  });

  return NextResponse.json({ data: payload });
}
