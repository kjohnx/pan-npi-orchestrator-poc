type JsonInput = string | null | undefined;

export function parseJson<T>(value: JsonInput, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function toSkuId(name: string): string {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 40);
  return `SKU-${slug || "UNTITLED"}-${Date.now()}`;
}

export function toSubmissionId(): string {
  return `SUB-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

export function toEntitlementId(): string {
  return `ENT-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}
