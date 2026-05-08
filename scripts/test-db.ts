import { getDb } from "../lib/db/client";

function main() {
  const db = getDb();
  const products = db.prepare("SELECT * FROM products").all();
  console.log(products);
}

main();
