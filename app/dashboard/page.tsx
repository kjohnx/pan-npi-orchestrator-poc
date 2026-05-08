"use client";

import { useEffect, useMemo, useState } from "react";

const ACCOUNTS = [
  { id: "ACC-001", company: "Acme Financial Services", tier: "ENTERPRISE" },
  { id: "ACC-002", company: "Globex Healthcare", tier: "MID-MARKET" },
  { id: "ACC-003", company: "Initech Manufacturing", tier: "SMB" },
] as const;

type ConstraintDefinition = {
  key: string;
  label: string;
  type: string;
  unit: string;
  required: boolean;
};

type ConstraintValue = {
  limit?: number | null;
  freemium_limit?: number | null;
  current_value?: number | null;
  value?: unknown;
};

type FlagDetail = {
  flag_id: string;
  display_name: string;
  status: string;
};

type Entitlement = {
  entitlement_id: string;
  account_id: string;
  account_name: string;
  account_tier: string;
  sku_name: string;
  is_bundle: number;
  product_name: string | null;
  status: "ACTIVE" | "PENDING" | "SUSPENDED" | "INACTIVE" | string;
  start_date: string | null;
  end_date: string | null;
  constraints: Record<string, ConstraintValue>;
  provisioning_status: string;
  sku_constraint_definitions: ConstraintDefinition[];
  activated_flag_details: FlagDetail[];
  locked_flag_details: FlagDetail[];
};

function formatDate(value: string | null): string {
  if (!value) return "No expiry";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function numericOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function statusBadgeClasses(status: string): string {
  if (status === "ACTIVE") return "bg-green-100 text-green-700 ring-green-200";
  if (status === "PENDING") return "bg-yellow-100 text-yellow-800 ring-yellow-200";
  if (status === "SUSPENDED") return "bg-red-100 text-red-700 ring-red-200";
  return "bg-gray-100 text-gray-700 ring-gray-200";
}

function provisioningClasses(status: string): string {
  if (status === "PROVISIONED") return "bg-green-500";
  if (status === "PENDING") return "bg-yellow-500";
  if (status === "FAILED") return "bg-red-500";
  return "bg-gray-400";
}

export default function DashboardPage() {
  const [selectedAccountId, setSelectedAccountId] = useState<string>("ACC-001");
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const selectedAccount = useMemo(
    () => ACCOUNTS.find((account) => account.id === selectedAccountId) ?? ACCOUNTS[0],
    [selectedAccountId],
  );

  useEffect(() => {
    let cancelled = false;
    async function loadEntitlements() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/entitlements?account_id=${selectedAccountId}`);
        const json = (await response.json()) as { data?: Entitlement[]; error?: string };
        if (!response.ok) {
          throw new Error(json.error ?? "Failed to load entitlements.");
        }
        if (!cancelled) {
          setEntitlements(Array.isArray(json.data) ? json.data : []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load entitlements.");
          setEntitlements([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void loadEntitlements();
    return () => {
      cancelled = true;
    };
  }, [selectedAccountId]);

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Palo Alto Networks</p>
          <h1 className="mt-2 text-3xl font-semibold">Customer Portal</h1>
          <p className="mt-2 text-sm text-gray-600">Your active products and entitlements</p>
        </header>

        <section className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">Account</span>
            <select
              value={selectedAccountId}
              onChange={(event) => setSelectedAccountId(event.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none ring-blue-600 transition focus:ring-2"
            >
              {ACCOUNTS.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.id} - {account.company} ({account.tier})
                </option>
              ))}
            </select>
          </label>
          <p className="mt-2 text-xs text-gray-500">
            Viewing <span className="font-semibold text-gray-700">{selectedAccount.company}</span> (
            {selectedAccount.tier})
          </p>
        </section>

        {loading && (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-sm text-gray-600 shadow-sm">
            Loading entitlements...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">{error}</div>
        )}

        {!loading && !error && entitlements.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-sm text-gray-600 shadow-sm">
            No active entitlements found for this account.
          </div>
        )}

        {!loading && !error && entitlements.length > 0 && (
          <div className="space-y-5">
            {entitlements.map((entitlement) => (
              <article
                key={entitlement.entitlement_id}
                className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    {/** Bundle SKUs have null product_id and should render as "Bundle" in title. */}
                    {(() => {
                      const productLabel =
                        entitlement.is_bundle === 1 || entitlement.product_name === null
                          ? "Bundle"
                          : entitlement.product_name;
                      return (
                        <h2 className="text-xl font-semibold text-gray-900">
                          {productLabel} - {entitlement.sku_name}
                        </h2>
                      );
                    })()}
                    <p className="mt-1 text-sm text-gray-600">
                      Contract: {formatDate(entitlement.start_date)} - {formatDate(entitlement.end_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusBadgeClasses(entitlement.status)}`}
                    >
                      {entitlement.status}
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 ring-1 ring-gray-200">
                      <span className={`h-2 w-2 rounded-full ${provisioningClasses(entitlement.provisioning_status)}`} />
                      Provisioning: {entitlement.provisioning_status}
                    </span>
                  </div>
                </div>

                <section className="mb-6">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700">Usage Meters</h3>
                  <div className="space-y-4">
                    {entitlement.sku_constraint_definitions.length === 0 && (
                      <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                        No usage constraints configured for this SKU.
                      </p>
                    )}
                    {entitlement.sku_constraint_definitions.map((definition) => {
                      const rawMetric = entitlement.constraints?.[definition.key] ?? {};
                      const currentValue = numericOrNull(rawMetric.current_value);
                      const hardLimit = numericOrNull(rawMetric.limit);
                      const freemiumLimit = numericOrNull(rawMetric.freemium_limit);
                      const effectiveLimit = hardLimit ?? freemiumLimit;
                      const utilization =
                        currentValue !== null && effectiveLimit && effectiveLimit > 0
                          ? currentValue / effectiveLimit
                          : null;
                      const isOverCap = utilization !== null && utilization > 1;
                      const isNearCap =
                        utilization !== null && (utilization >= 0.8 || (freemiumLimit !== null && utilization >= 0.6));

                      const barColor = isOverCap
                        ? "bg-red-500"
                        : isNearCap
                          ? "bg-amber-500"
                          : "bg-blue-600";

                      const widthPercent =
                        utilization === null ? 0 : Math.max(0, Math.min(100, Math.round(utilization * 100)));

                      const displayCurrent =
                        currentValue !== null
                          ? currentValue.toLocaleString(undefined, { maximumFractionDigits: 1 })
                          : "-";
                      const displayLimit =
                        effectiveLimit !== null
                          ? effectiveLimit.toLocaleString(undefined, { maximumFractionDigits: 1 })
                          : "No cap";
                      const unit = definition.unit ? ` ${definition.unit}` : "";

                      return (
                        <div
                          key={`${entitlement.entitlement_id}-${definition.key}`}
                          className={`rounded-lg border p-4 ${
                            freemiumLimit !== null && isNearCap
                              ? "border-amber-300 bg-amber-50/60"
                              : "border-gray-200 bg-gray-50/50"
                          }`}
                        >
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium text-gray-800">
                              {definition.label || definition.key}
                              {freemiumLimit !== null && (
                                <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                                  Freemium
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-gray-600">
                              {displayCurrent}
                              {unit} / {displayLimit}
                              {unit}
                            </p>
                          </div>
                          <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
                            <div className={`h-full ${barColor} transition-all`} style={{ width: `${widthPercent}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700">Feature Flags</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {entitlement.activated_flag_details.map((flag) => (
                      <div
                        key={`${entitlement.entitlement_id}-active-${flag.flag_id}`}
                        className="rounded-lg border border-green-200 bg-green-50 px-3 py-2"
                      >
                        <p className="text-sm font-medium text-green-900">{flag.display_name}</p>
                        <p className="text-xs font-semibold uppercase tracking-wide text-green-700">Active</p>
                      </div>
                    ))}
                    {entitlement.locked_flag_details.map((flag) => (
                      <div
                        key={`${entitlement.entitlement_id}-locked-${flag.flag_id}`}
                        className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                      >
                        <p className="text-sm font-medium text-gray-800">{flag.display_name}</p>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Locked 🔒</p>
                      </div>
                    ))}
                  </div>
                </section>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
