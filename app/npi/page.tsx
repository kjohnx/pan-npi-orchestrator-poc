"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const DEFAULT_CONCEPT =
  "We are launching AI Access Security. It governs employee use of generative AI tools across the organization. $15 per user per month, 12-month minimum commitment. Enable the Policy Enforcement flag by default, with Shadow AI Detection as an optional add-on.";

const ACCOUNT_IDS = ["ACC-001", "ACC-002", "ACC-003"] as const;

const PRICING_MODELS = ["USAGE", "FLAT", "TIERED", "FREEMIUM"] as const;
const UNITS = ["GB", "SEAT", "ENDPOINT", "DEVICE", "CREDIT", "MBPS"] as const;
const CONSTRAINT_TYPES = ["NUMERIC", "STRING", "BOOLEAN"] as const;

const FLAG_OPTIONS = [
  { id: "advanced-heuristics", label: "Advanced Heuristics" },
  { id: "behavioral-analytics", label: "Behavioral Analytics" },
  { id: "threat-intel-feed", label: "Threat Intel Feed" },
  { id: "auto-remediation", label: "Auto Remediation" },
  { id: "dlp-inline", label: "DLP Inline" },
  { id: "saas-visibility", label: "SaaS Visibility" },
  { id: "policy-enforcement", label: "Policy Enforcement" },
  { id: "shadow-ai-detection", label: "Shadow AI Detection" },
] as const;

const ACCOUNT_OPTIONS = [
  { id: "ACC-001", company: "Acme Financial Services", tier: "ENTERPRISE" },
  { id: "ACC-002", company: "Globex Healthcare", tier: "MID-MARKET" },
  { id: "ACC-003", company: "Initech Manufacturing", tier: "SMB" },
] as const;

type ConstraintDefinition = {
  key: string;
  label: string;
  type: (typeof CONSTRAINT_TYPES)[number];
  unit: string;
  required: boolean;
};

type SkuDraft = {
  name: string;
  pricing_model: (typeof PRICING_MODELS)[number] | "";
  price_per_unit: number | null;
  price_currency: "USD";
  unit: (typeof UNITS)[number] | "";
  freemium_limit: number | null;
  min_commitment_months: number | null;
  required_flags: string[];
  optional_flags: string[];
  constraint_definitions: ConstraintDefinition[];
  notes: string;
};

type Product = {
  product_id: string;
  name: string;
  status: string;
};

type PublishedSku = {
  sku_id: string;
  name: string;
  product_name: string | null;
  product_id: string | null;
  pricing_model: string | null;
  price_per_unit: number | null;
  unit: string | null;
  freemium_limit: number | null;
  min_commitment_months: number;
  version: number;
  required_flags: string[];
  optional_flags: string[];
  constraint_definitions: ConstraintDefinition[];
};

type Entitlement = {
  account_id: string;
  account_name: string;
  account_tier: string;
  product_id: string | null;
  sku_id: string;
  status: string;
  sku_pricing_model: string | null;
  sku_freemium_limit: number | null;
};

type ImpactRow = {
  accountId: string;
  companyName: string;
  tier: string;
  skuId: string;
  currentSkuPricingModel: string | null;
  currentSkuFreemiumLimit: number | null;
  impactReason: string;
};

/** Current SKU snapshot for the entitlement row being previewed (new-SKU path). */
type CurrentEntitlementSku = {
  pricing_model: string | null;
  freemium_limit: number | null;
};

function normalizePricingModel(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

function sortedFlagKey(flags: string[]) {
  return [...flags].sort().join("\0");
}

function deriveImpactReason(
  isModify: boolean,
  published: PublishedSku | null,
  currentEntitlementSku: CurrentEntitlementSku | null,
  draft: SkuDraft,
): string {
  if (isModify && published) {
    const reasons: string[] = [];
    if ((draft.pricing_model || null) !== (published.pricing_model || null)) {
      reasons.push("Pricing model change would propagate to active entitlements for this SKU.");
    }
    if (draft.freemium_limit !== published.freemium_limit) {
      reasons.push("Freemium limit change would adjust usage metering for active entitlements.");
    }
    if (sortedFlagKey(draft.required_flags) !== sortedFlagKey(published.required_flags)) {
      reasons.push("Required feature flags changed on the SKU.");
    }
    if (sortedFlagKey(draft.optional_flags) !== sortedFlagKey(published.optional_flags)) {
      reasons.push("Optional feature flags changed on the SKU.");
    }
    if (JSON.stringify(draft.constraint_definitions) !== JSON.stringify(published.constraint_definitions)) {
      reasons.push("Constraint definitions changed on the SKU.");
    }
    if (reasons.length === 0) {
      return "SKU update would apply to active entitlements for this SKU.";
    }
    return reasons.join(" ");
  }

  if (!currentEntitlementSku) {
    return "New product offering — no existing entitlement to migrate";
  }

  const currentModel = normalizePricingModel(currentEntitlementSku.pricing_model);
  const draftModel = normalizePricingModel(draft.pricing_model);

  if (!currentModel) {
    return "New SKU version for this product — existing entitlement SKU has no pricing model on file.";
  }

  if (currentModel === "FREEMIUM" && draftModel === "USAGE") {
    return "Currently on Freemium tier — new SKU switches to usage-based pricing";
  }

  if (currentModel === "USAGE" && draftModel === "FREEMIUM") {
    const x = draft.freemium_limit;
    const unit = draft.unit || "units";
    if (x != null && Number.isFinite(x)) {
      return `Currently on paid usage — new SKU adds freemium tier with ${x} ${unit} free`;
    }
    return "Currently on paid usage — new SKU adds freemium tier with configured free allowance";
  }

  if (currentModel === draftModel && draftModel !== "") {
    return "New SKU version available — pricing model unchanged";
  }

  return `Offering change for this account: current entitlement is ${currentModel}; draft new SKU is ${draftModel || "unspecified"}.`;
}

type Tab = "input" | "review" | "published";

function getEmptyDraft(): SkuDraft {
  return {
    name: "",
    pricing_model: "USAGE",
    price_per_unit: null,
    price_currency: "USD",
    unit: "GB",
    freemium_limit: null,
    min_commitment_months: 12,
    required_flags: [],
    optional_flags: [],
    constraint_definitions: [],
    notes: "",
  };
}

function safeNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function NpiPage() {
  const [activeTab, setActiveTab] = useState<Tab>("input");
  const [concept, setConcept] = useState(DEFAULT_CONCEPT);
  const [draft, setDraft] = useState<SkuDraft>(getEmptyDraft());
  const [productId, setProductId] = useState<string>("");
  const [products, setProducts] = useState<Product[]>([]);
  const [publishedSku, setPublishedSku] = useState<PublishedSku | null>(null);
  const [isModifyMode, setIsModifyMode] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPreviewingImpact, setIsPreviewingImpact] = useState(false);
  const [impactCount, setImpactCount] = useState<number | null>(null);
  const [impactRows, setImpactRows] = useState<ImpactRow[]>([]);
  const [impactDrilldownOpen, setImpactDrilldownOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [rawAiOutput, setRawAiOutput] = useState<string | null>(null);
  const [isRawOpen, setIsRawOpen] = useState(false);
  const [hasGeneratedSchema, setHasGeneratedSchema] = useState(false);
  const [provisionAccountId, setProvisionAccountId] = useState<string>("ACC-001");
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [provisionSuccessCompany, setProvisionSuccessCompany] = useState<string | null>(null);
  const [provisionWarning, setProvisionWarning] = useState<string>("");

  const selectedProductName = useMemo(() => {
    return products.find((product) => product.product_id === productId)?.name ?? null;
  }, [productId, products]);

  async function fetchProducts() {
    const response = await fetch("/api/products");
    if (!response.ok) {
      throw new Error("Failed to load products.");
    }
    const json = (await response.json()) as { data: Product[] };
    setProducts(json.data ?? []);
    if (!productId && json.data?.length) {
      setProductId(json.data[0].product_id);
    }
  }

  async function handleGenerateSchema() {
    setError("");
    setStatusMessage("");
    setImpactCount(null);
    setImpactRows([]);
    setImpactDrilldownOpen(false);
    setIsModifyMode(false);
    setIsParsing(true);
    setRawAiOutput(null);
    setIsRawOpen(false);

    try {
      if (!concept.trim()) {
        throw new Error("Please describe a product concept.");
      }

      if (!products.length) {
        await fetchProducts();
      }

      const response = await fetch("/api/npi-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept }),
      });

      const json = (await response.json()) as {
        data?: Partial<SkuDraft>;
        raw?: string;
        error?: string;
        detail?: string;
      };

      if (typeof json.raw === "string") {
        setRawAiOutput(json.raw);
      }

      if (!response.ok || !json.data) {
        throw new Error(json.error ?? json.detail ?? "Schema generation failed.");
      }

      const ai = json.data;
      const normalized: SkuDraft = {
        name: ai.name ?? "",
        pricing_model:
          (ai.pricing_model as SkuDraft["pricing_model"]) && PRICING_MODELS.includes(ai.pricing_model as any)
            ? (ai.pricing_model as SkuDraft["pricing_model"])
            : "USAGE",
        price_per_unit: typeof ai.price_per_unit === "number" ? ai.price_per_unit : null,
        price_currency: "USD",
        unit:
          (ai.unit as SkuDraft["unit"]) && UNITS.includes(ai.unit as any)
            ? (ai.unit as SkuDraft["unit"])
            : "GB",
        freemium_limit: typeof ai.freemium_limit === "number" ? ai.freemium_limit : null,
        min_commitment_months:
          typeof ai.min_commitment_months === "number" ? ai.min_commitment_months : 12,
        required_flags: Array.isArray(ai.required_flags) ? ai.required_flags.filter(Boolean) : [],
        optional_flags: Array.isArray(ai.optional_flags) ? ai.optional_flags.filter(Boolean) : [],
        constraint_definitions: Array.isArray(ai.constraint_definitions)
          ? ai.constraint_definitions.map((item) => ({
              key: typeof item?.key === "string" ? item.key : "",
              label: typeof item?.label === "string" ? item.label : "",
              type:
                item?.type && CONSTRAINT_TYPES.includes(item.type as any)
                  ? (item.type as ConstraintDefinition["type"])
                  : "NUMERIC",
              unit: typeof item?.unit === "string" ? item.unit : "",
              required: Boolean(item?.required),
            }))
          : [],
        notes: typeof ai.notes === "string" ? ai.notes : "",
      };

      setDraft(normalized);
      setHasGeneratedSchema(true);
      setActiveTab("review");
      setStatusMessage("Schema generated. Review and publish when ready.");
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Unexpected parsing error.");
    } finally {
      setIsParsing(false);
    }
  }

  async function handlePreviewImpact() {
    setError("");
    setStatusMessage("");
    setIsPreviewingImpact(true);
    setImpactDrilldownOpen(false);

    try {
      const responses = await Promise.all(
        ACCOUNT_IDS.map(async (accountId) => {
          const response = await fetch(`/api/entitlements?account_id=${accountId}`);
          if (!response.ok) {
            throw new Error("Unable to preview impact.");
          }
          const json = (await response.json()) as { data: Entitlement[] };
          return json.data ?? [];
        }),
      );

      const rows: ImpactRow[] = [];

      for (const list of responses) {
        for (const entitlement of list) {
          if (!productId || entitlement.product_id !== productId) continue;
          if (entitlement.status !== "ACTIVE") continue;

          if (isModifyMode && publishedSku) {
            if (entitlement.sku_id !== publishedSku.sku_id) continue;
          }

          const currentSku: CurrentEntitlementSku | null =
            isModifyMode && publishedSku
              ? null
              : {
                  pricing_model: entitlement.sku_pricing_model,
                  freemium_limit: entitlement.sku_freemium_limit,
                };

          rows.push({
            accountId: entitlement.account_id,
            companyName: entitlement.account_name,
            tier: entitlement.account_tier,
            skuId: entitlement.sku_id,
            currentSkuPricingModel: entitlement.sku_pricing_model,
            currentSkuFreemiumLimit: entitlement.sku_freemium_limit,
            impactReason: deriveImpactReason(isModifyMode, publishedSku, currentSku, draft),
          });
        }
      }

      const uniqueAccountIds = new Set(rows.map((r) => r.accountId));
      setImpactRows(rows);
      setImpactCount(uniqueAccountIds.size);
      setImpactDrilldownOpen(false);
      setStatusMessage(`Impact preview complete: ${uniqueAccountIds.size} affected account(s).`);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Impact preview failed.");
    } finally {
      setIsPreviewingImpact(false);
    }
  }

  async function publishSku() {
    setError("");
    setStatusMessage("");
    setIsPublishing(true);

    try {
      if (!draft.name.trim()) {
        throw new Error("SKU name is required.");
      }

      if (!productId) {
        throw new Error("Select a product before publishing.");
      }

      const payload = {
        product_id: productId,
        name: draft.name,
        status: "ACTIVE",
        pricing_model: draft.pricing_model || null,
        price_per_unit: draft.price_per_unit,
        price_currency: draft.price_currency,
        unit: draft.unit || null,
        freemium_limit: draft.freemium_limit,
        min_commitment_months: draft.min_commitment_months ?? 0,
        required_flags: draft.required_flags,
        optional_flags: draft.optional_flags,
        constraint_definitions: draft.constraint_definitions,
        raw_input: concept,
        submitted_by: "npi-panel-demo",
      };

      const endpoint = isModifyMode && publishedSku ? `/api/skus/${publishedSku.sku_id}` : "/api/skus";
      const method = isModifyMode && publishedSku ? "PATCH" : "POST";

      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = (await response.json()) as { data?: PublishedSku; error?: string };
      if (!response.ok || !json.data) {
        throw new Error(json.error ?? "Publish failed.");
      }

      setPublishedSku(json.data);
      setActiveTab("published");
      setIsModifyMode(false);
      setStatusMessage(method === "POST" ? "SKU published successfully." : "SKU updated successfully.");
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Unexpected publish error.");
    } finally {
      setIsPublishing(false);
    }
  }

  function formatYyyyMmDd(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  async function handleProvisionToAccount() {
    if (!publishedSku) return;

    setError("");
    setProvisionWarning("");
    setProvisionSuccessCompany(null);
    setIsProvisioning(true);

    try {
      const today = new Date();
      const oneYearFromToday = new Date(today);
      oneYearFromToday.setFullYear(oneYearFromToday.getFullYear() + 1);

      const isFreemium = normalizePricingModel(publishedSku.pricing_model) === "FREEMIUM";
      const constraints = Object.fromEntries(
        publishedSku.constraint_definitions.map((definition) => [
          definition.key,
          {
            limit: null,
            freemium_limit: publishedSku.freemium_limit ?? null,
            current_value: 0,
          },
        ]),
      );

      const response = await fetch("/api/entitlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: provisionAccountId,
          sku_id: publishedSku.sku_id,
          status: "ACTIVE",
          start_date: formatYyyyMmDd(today),
          end_date: isFreemium ? null : formatYyyyMmDd(oneYearFromToday),
          constraints,
          activated_flags: publishedSku.required_flags,
          locked_flags: publishedSku.optional_flags,
        }),
      });

      const json = (await response.json()) as { error?: string };
      if (response.status === 409 && json.error === "duplicate") {
        setProvisionWarning("This account already has an active entitlement for this SKU.");
        return;
      }
      if (!response.ok) {
        throw new Error(json.error ?? "Provisioning failed.");
      }

      const companyName =
        ACCOUNT_OPTIONS.find((account) => account.id === provisionAccountId)?.company ?? provisionAccountId;
      setProvisionSuccessCompany(companyName);
      setProvisionAccountId("ACC-001");
    } catch (provisionError) {
      setError(provisionError instanceof Error ? provisionError.message : "Provisioning failed.");
    } finally {
      setIsProvisioning(false);
    }
  }

  function toggleFlag(flagId: string, field: "required_flags" | "optional_flags") {
    setDraft((current) => {
      const set = new Set(current[field]);
      if (set.has(flagId)) set.delete(flagId);
      else set.add(flagId);
      return { ...current, [field]: Array.from(set) };
    });
  }

  function updateConstraint(index: number, next: Partial<ConstraintDefinition>) {
    setDraft((current) => {
      const copy = [...current.constraint_definitions];
      copy[index] = { ...copy[index], ...next };
      return { ...current, constraint_definitions: copy };
    });
  }

  function addConstraint() {
    setDraft((current) => ({
      ...current,
      constraint_definitions: [
        ...current.constraint_definitions,
        { key: "", label: "", type: "NUMERIC", unit: "", required: false },
      ],
    }));
  }

  function removeConstraint(index: number) {
    setDraft((current) => ({
      ...current,
      constraint_definitions: current.constraint_definitions.filter((_, i) => i !== index),
    }));
  }

  const tabs: Array<{ id: Tab; label: string; enabled: boolean }> = [
    { id: "input", label: "Input", enabled: true },
    { id: "review", label: "Review", enabled: hasGeneratedSchema },
    { id: "published", label: "Published", enabled: Boolean(publishedSku) },
  ];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl shadow-blue-950/30">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Palo Alto Networks</p>
              <h1 className="mt-2 text-3xl font-semibold text-white">NPI Fast-Track Tool</h1>
              <p className="mt-2 text-sm text-slate-300">
                AI-assisted SKU publishing workflow for rapid product launch decisions.
              </p>
            </div>
            <span className="rounded-full bg-slate-800 px-4 py-2 text-xs font-semibold tracking-wide text-slate-200">
              3-Tab Workflow
            </span>
          </div>

          <div className="mb-8 grid gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-2 md:grid-cols-3">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  disabled={!tab.enabled}
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    "rounded-lg px-4 py-3 text-sm font-semibold transition",
                    isActive
                      ? "bg-blue-600 text-white"
                      : tab.enabled
                        ? "bg-slate-900 text-slate-200 hover:bg-slate-800"
                        : "cursor-not-allowed bg-slate-900/40 text-slate-500",
                  ].join(" ")}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {statusMessage && (
            <div className="mb-5 rounded-lg border border-emerald-700/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
              {statusMessage}
            </div>
          )}
          {error && (
            <div className="mb-5 rounded-lg border border-rose-700/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          )}

          {activeTab === "input" && (
            <section className="space-y-6">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-200">
                  Describe your new product concept
                </span>
                <textarea
                  value={concept}
                  onChange={(event) => setConcept(event.target.value)}
                  className="h-44 w-full rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm text-slate-100 outline-none ring-blue-500 transition focus:ring-2"
                />
              </label>

              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleGenerateSchema}
                  disabled={isParsing}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isParsing ? "Generating Schema..." : "Generate Schema"}
                </button>
              </div>
            </section>
          )}

          {activeTab === "review" && (
            <section className="space-y-7">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-200">Name</span>
                  <input
                    value={draft.name}
                    onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-200">Product</span>
                  <select
                    value={productId}
                    onChange={(event) => setProductId(event.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
                  >
                    <option value="">Select product</option>
                    {products.map((product) => (
                      <option key={product.product_id} value={product.product_id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-200">Pricing Model</span>
                  <select
                    value={draft.pricing_model}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        pricing_model: event.target.value as SkuDraft["pricing_model"],
                      }))
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
                  >
                    {PRICING_MODELS.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-200">Price per Unit</span>
                  <input
                    value={draft.price_per_unit ?? ""}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, price_per_unit: safeNumber(event.target.value) }))
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-200">Currency</span>
                  <input
                    value={draft.price_currency}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        price_currency: event.target.value.toUpperCase() as "USD",
                      }))
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-200">Unit</span>
                  <select
                    value={draft.unit}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, unit: event.target.value as SkuDraft["unit"] }))
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
                  >
                    {UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-200">Freemium Limit</span>
                  <input
                    value={draft.freemium_limit ?? ""}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, freemium_limit: safeNumber(event.target.value) }))
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-200">Min Commitment (months)</span>
                  <input
                    value={draft.min_commitment_months ?? ""}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        min_commitment_months: safeNumber(event.target.value),
                      }))
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                  <p className="mb-3 text-sm font-medium text-slate-200">Required Flags</p>
                  <div className="space-y-2">
                    {FLAG_OPTIONS.map((flag) => (
                      <label key={flag.id} className="flex items-center gap-2 text-sm text-slate-300">
                        <input
                          type="checkbox"
                          checked={draft.required_flags.includes(flag.id)}
                          onChange={() => toggleFlag(flag.id, "required_flags")}
                        />
                        {flag.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                  <p className="mb-3 text-sm font-medium text-slate-200">Optional Flags</p>
                  <div className="space-y-2">
                    {FLAG_OPTIONS.map((flag) => (
                      <label key={flag.id} className="flex items-center gap-2 text-sm text-slate-300">
                        <input
                          type="checkbox"
                          checked={draft.optional_flags.includes(flag.id)}
                          onChange={() => toggleFlag(flag.id, "optional_flags")}
                        />
                        {flag.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-200">Constraint Definitions</p>
                  <button
                    type="button"
                    onClick={addConstraint}
                    className="rounded-md border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-blue-400 hover:text-white"
                  >
                    Add Row
                  </button>
                </div>
                <p className="mb-3 text-xs text-slate-400">
                  Define the usage and limit schema for this SKU. AI should infer these based on pricing model
                  (for example usage volume for USAGE/FREEMIUM, seat count for FLAT, and tier metric for TIERED).
                </p>

                <div className="space-y-3">
                  {draft.constraint_definitions.length === 0 && (
                    <p className="text-sm text-slate-400">No constraints added yet.</p>
                  )}
                  {draft.constraint_definitions.length > 0 && (
                    <div className="hidden gap-2 px-3 py-1 md:grid md:grid-cols-12">
                      <span
                        className="md:col-span-2 cursor-help text-xs font-semibold uppercase tracking-wide text-slate-400"
                        title="Internal identifier used in the system, e.g. usage_gb"
                      >
                        Key
                      </span>
                      <span
                        className="md:col-span-3 cursor-help text-xs font-semibold uppercase tracking-wide text-slate-400"
                        title="Human-readable name shown on customer dashboard, e.g. Data Processed (GB)"
                      >
                        Label
                      </span>
                      <span
                        className="md:col-span-2 cursor-help text-xs font-semibold uppercase tracking-wide text-slate-400"
                        title="Data type of the constraint value"
                      >
                        Type
                      </span>
                      <span
                        className="md:col-span-2 cursor-help text-xs font-semibold uppercase tracking-wide text-slate-400"
                        title="Unit of measurement displayed to customers, e.g. GB, Mbps, Endpoints"
                      >
                        Unit
                      </span>
                      <span
                        className="md:col-span-2 cursor-help text-xs font-semibold uppercase tracking-wide text-slate-400"
                        title="Whether this constraint must be set when provisioning a customer entitlement"
                      >
                        Required
                      </span>
                      <span className="md:col-span-1" aria-hidden="true" />
                    </div>
                  )}
                  {draft.constraint_definitions.map((constraint, index) => (
                    <div key={`${constraint.key}-${index}`} className="grid gap-2 rounded-lg border border-slate-800 p-3 md:grid-cols-12">
                      <input
                        placeholder="key (e.g. usage_gb)"
                        value={constraint.key}
                        onChange={(event) => updateConstraint(index, { key: event.target.value })}
                        className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm md:col-span-2"
                      />
                      <input
                        placeholder="label (e.g. Usage Volume)"
                        value={constraint.label}
                        onChange={(event) => updateConstraint(index, { label: event.target.value })}
                        className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm md:col-span-3"
                      />
                      <select
                        value={constraint.type}
                        onChange={(event) =>
                          updateConstraint(index, {
                            type: event.target.value as ConstraintDefinition["type"],
                          })
                        }
                        className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm md:col-span-2"
                      >
                        {CONSTRAINT_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                      <input
                        placeholder="unit (e.g. GB)"
                        value={constraint.unit}
                        onChange={(event) => updateConstraint(index, { unit: event.target.value })}
                        className="rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm md:col-span-2"
                      />
                      <label className="flex items-center gap-2 text-sm text-slate-300 md:col-span-2">
                        <input
                          type="checkbox"
                          checked={constraint.required}
                          onChange={(event) => updateConstraint(index, { required: event.target.checked })}
                        />
                        Required
                      </label>
                      <button
                        type="button"
                        onClick={() => removeConstraint(index)}
                        className="rounded border border-rose-600/60 px-2 py-1.5 text-xs text-rose-300 transition hover:bg-rose-950/40 md:col-span-1"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-200">Notes</span>
                <textarea
                  value={draft.notes}
                  onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                  className="h-24 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
                />
              </label>

              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                <p className="mb-3 text-sm font-medium text-slate-200">Raw AI Response</p>
                <button
                  type="button"
                  onClick={() => setIsRawOpen((v) => !v)}
                  className="mb-3 flex w-full items-center justify-between rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-left text-sm font-semibold text-slate-100 transition hover:border-blue-400"
                  aria-expanded={isRawOpen}
                >
                  <span>Show Raw AI Output</span>
                  <span className="text-xs text-slate-400">{isRawOpen ? "−" : "+"}</span>
                </button>

                {isRawOpen && (
                  <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950 px-3 py-3 font-mono text-xs text-slate-200 ring-1 ring-slate-800">
                    {rawAiOutput ?? ""}
                  </pre>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={handlePreviewImpact}
                    disabled={isPreviewingImpact}
                    className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-blue-400 disabled:opacity-50"
                  >
                    {isPreviewingImpact ? "Previewing..." : "Preview Impact"}
                  </button>
                  <button
                    type="button"
                    onClick={publishSku}
                    disabled={isPublishing}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {isPublishing
                      ? isModifyMode
                        ? "Re-publishing..."
                        : "Publishing..."
                      : isModifyMode
                        ? "Re-publish SKU"
                        : "Publish SKU"}
                  </button>
                </div>

                <div className="space-y-2">
                  {impactCount !== null && (
                    <>
                      <button
                        type="button"
                        onClick={() => setImpactDrilldownOpen((open) => !open)}
                        className="rounded-full border border-amber-500/40 bg-amber-950/40 px-3 py-1 text-left text-sm font-medium text-amber-200 transition hover:border-amber-400 hover:bg-amber-950/60"
                        aria-expanded={impactDrilldownOpen}
                      >
                        {impactCount} account(s) affected
                        <span className="ml-2 text-xs text-amber-300/90">
                          {impactDrilldownOpen ? "Hide details" : "Show details"}
                        </span>
                      </button>
                      {impactCount > 0 && !impactDrilldownOpen && (
                        <p className="text-xs text-slate-500">Click the summary badge to view affected accounts and SKUs.</p>
                      )}
                      {impactDrilldownOpen && (
                        <div className="max-h-96 overflow-auto rounded-xl border border-slate-800 bg-slate-950/80 shadow-inner shadow-black/20">
                          <table className="min-w-full text-left text-sm text-slate-200">
                            <thead className="sticky top-0 z-10 bg-slate-900 text-xs font-semibold uppercase tracking-wide text-slate-400">
                              <tr>
                                <th className="px-3 py-2">Account ID</th>
                                <th className="px-3 py-2">Company Name</th>
                                <th className="px-3 py-2">Tier</th>
                                <th className="px-3 py-2">Affected SKU ID</th>
                                <th className="px-3 py-2">Impact Reason</th>
                              </tr>
                            </thead>
                            <tbody>
                              {impactRows.length === 0 ? (
                                <tr>
                                  <td colSpan={5} className="px-3 py-4 text-slate-400">
                                    No matching active entitlements for this preview.
                                  </td>
                                </tr>
                              ) : (
                                impactRows.map((row, index) => (
                                  <tr key={`${row.accountId}-${row.skuId}-${index}`} className="border-t border-slate-800">
                                    <td className="px-3 py-2 font-mono text-xs">{row.accountId}</td>
                                    <td className="px-3 py-2">{row.companyName}</td>
                                    <td className="px-3 py-2">{row.tier}</td>
                                    <td className="px-3 py-2 font-mono text-xs">{row.skuId}</td>
                                    <td className="max-w-md px-3 py-2 text-slate-300">{row.impactReason}</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </section>
          )}

          {activeTab === "published" && publishedSku && !isModifyMode && (
            <section className="space-y-6">
              <div className="rounded-xl border border-emerald-600/30 bg-emerald-950/30 p-5">
                <h2 className="text-xl font-semibold text-emerald-200">SKU Published</h2>
                <p className="mt-2 text-sm text-slate-200">
                  <span className="font-semibold">{publishedSku.name}</span> is now live as{" "}
                  <span className="font-mono">{publishedSku.sku_id}</span>.
                </p>
              </div>

              <div className="grid gap-4 rounded-xl border border-slate-800 bg-slate-950/70 p-5 md:grid-cols-2">
                <p className="text-sm text-slate-300">
                  <span className="text-slate-500">SKU ID:</span> {publishedSku.sku_id}
                </p>
                <p className="text-sm text-slate-300">
                  <span className="text-slate-500">SKU Name:</span> {publishedSku.name}
                </p>
                <p className="text-sm text-slate-300">
                  <span className="text-slate-500">Product:</span> {selectedProductName ?? publishedSku.product_name ?? "N/A"}
                </p>
                <p className="text-sm text-slate-300">
                  <span className="text-slate-500">Product ID:</span> {publishedSku.product_id ?? "N/A"}
                </p>
                <p className="text-sm text-slate-300">
                  <span className="text-slate-500">Pricing Model:</span> {publishedSku.pricing_model ?? "N/A"}
                </p>
                <p className="text-sm text-slate-300">
                  <span className="text-slate-500">Price:</span>{" "}
                  {publishedSku.price_per_unit !== null ? `${publishedSku.price_per_unit}/${publishedSku.unit ?? "-"}` : "N/A"}
                </p>
                <p className="text-sm text-slate-300">
                  <span className="text-slate-500">Freemium Limit:</span>{" "}
                  {publishedSku.freemium_limit !== null ? publishedSku.freemium_limit : "None"}
                </p>
                <p className="text-sm text-slate-300">
                  <span className="text-slate-500">Min Commitment:</span> {publishedSku.min_commitment_months} months
                </p>
                <p className="text-sm text-slate-300">
                  <span className="text-slate-500">Version:</span> {publishedSku.version}
                </p>
                <p className="text-sm text-slate-300">
                  <span className="text-slate-500">Required Flags:</span>{" "}
                  {publishedSku.required_flags.length ? publishedSku.required_flags.join(", ") : "None"}
                </p>
                <p className="text-sm text-slate-300">
                  <span className="text-slate-500">Optional Flags:</span>{" "}
                  {publishedSku.optional_flags.length ? publishedSku.optional_flags.join(", ") : "None"}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-5">
                <p className="mb-3 text-sm font-medium text-slate-200">Constraint Definitions</p>
                <div className="overflow-x-auto rounded-lg border border-slate-800">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-900 text-slate-300">
                      <tr>
                        <th className="px-3 py-2 font-medium">Key</th>
                        <th className="px-3 py-2 font-medium">Label</th>
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">Unit</th>
                        <th className="px-3 py-2 font-medium">Required</th>
                      </tr>
                    </thead>
                    <tbody>
                      {publishedSku.constraint_definitions.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-3 text-slate-400">
                            No constraint definitions on this SKU.
                          </td>
                        </tr>
                      ) : (
                        publishedSku.constraint_definitions.map((constraint, index) => (
                          <tr key={`${constraint.key}-${index}`} className="border-t border-slate-800 text-slate-200">
                            <td className="px-3 py-2 font-mono text-xs">{constraint.key}</td>
                            <td className="px-3 py-2">{constraint.label}</td>
                            <td className="px-3 py-2">{constraint.type}</td>
                            <td className="px-3 py-2">{constraint.unit || "-"}</td>
                            <td className="px-3 py-2">{constraint.required ? "Yes" : "No"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-5">
                <p className="mb-3 text-sm font-medium text-slate-200">Provision this SKU to a customer account</p>
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <select
                    value={provisionAccountId}
                    onChange={(event) => setProvisionAccountId(event.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none ring-blue-500 focus:ring-2 md:max-w-lg"
                  >
                    {ACCOUNT_OPTIONS.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.id} {account.company} ({account.tier})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleProvisionToAccount}
                    disabled={isProvisioning}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isProvisioning ? "Provisioning..." : "Provision"}
                  </button>
                </div>

                {provisionSuccessCompany && (
                  <div className="mt-4 rounded-lg border border-emerald-700/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
                    SKU successfully provisioned to {provisionSuccessCompany}. View it on the{" "}
                    <Link href="/dashboard" className="font-semibold text-emerald-100 underline underline-offset-2">
                      Customer Dashboard
                    </Link>
                    .
                  </div>
                )}
                {provisionWarning && (
                  <div className="mt-4 rounded-lg border border-amber-700/40 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
                    {provisionWarning}
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setRawAiOutput(null);
                    setIsRawOpen(false);
                    setDraft((current) => ({
                      ...current,
                      pricing_model: (publishedSku.pricing_model as SkuDraft["pricing_model"]) ?? current.pricing_model,
                      freemium_limit: publishedSku.freemium_limit,
                      min_commitment_months: publishedSku.min_commitment_months,
                      required_flags: publishedSku.required_flags ?? current.required_flags,
                      optional_flags: publishedSku.optional_flags ?? current.optional_flags,
                      constraint_definitions:
                        (publishedSku.constraint_definitions as ConstraintDefinition[]) ?? current.constraint_definitions,
                    }));
                    if (publishedSku.product_id) setProductId(publishedSku.product_id);
                    setIsModifyMode(true);
                    setActiveTab("review");
                    setStatusMessage("Modify SKU mode enabled. Update pricing model and republish.");
                  }}
                  className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"
                >
                  Modify SKU
                </button>
              </div>
            </section>
          )}

          {activeTab === "published" && isModifyMode && (
            <div className="rounded-xl border border-amber-600/40 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
              Modify mode is active. Continue editing in the Review tab and re-publish when ready.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
