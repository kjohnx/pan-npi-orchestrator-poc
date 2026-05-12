# Cursor Context: NPI Orchestrator Project

This file provides context to the Cursor AI coding assistant for building this prototype.
It contains the data model, API spec, and UI behavior for the two demo prototypes.
Built as part of a Principal PM case study for Palo Alto Networks.

Read this before writing any code. This is the full context for what we are building.

---

## What We Are Building

A Next.js application called **npi-orchestrator** with two functional prototypes.
Both prototypes are now complete and demo-ready:

1. **NPI Fast-Track Tool** (`/app/npi`) — internal tool used by the NPI team to define a new
   product in plain English, have AI parse it into a structured SKU schema, review/edit the
   result, and publish it to the system. This creates or updates SKUs and propagates changes
   to affected customer entitlements.

2. **Customer Entitlement Dashboard** (`/app/dashboard`) — customer-facing view showing a
   customer's current product entitlements, usage meters, and feature flags (Active or Locked).

These are demo prototypes for a panel interview, not a production system. The focus is on
working, demonstrable functionality — not polish or scale.

---

## Tech Stack

- **Framework:** Next.js 14 (App Router, TypeScript)
- **Styling:** Tailwind CSS
- **Database:** SQLite via `better-sqlite3`, file at `/data/npi_orchestrator.db`
- **AI parsing:** Anthropic Claude API (`claude-sonnet-4-5`) — called from a Next.js
  API route when the NPI user submits a plain-English product concept
- **Deployment target:** Local — no need to optimize for Vercel serverless

### Local dev server (important)

Run **`npm run dev` from your Mac terminal** (Terminal.app, iTerm, etc.), not from Cursor’s
integrated terminal, when you need outbound network access (Anthropic API, `fetch` to
`api.anthropic.com`, etc.). Cursor’s sandboxed terminal can block or fail DNS/network for
those calls; the Mac host terminal matches how you will demo the panel.

IMPORTANT: `npm run dev` must always be run from Mac terminal or standard terminal, not
Cursor's integrated terminal. Cursor's sandbox blocks outbound network calls to
`api.anthropic.com`.

### `.env.local` requirements

`.env.local` requires two entries:

```bash
ANTHROPIC_API_KEY=your_key
CHOKIDAR_USEPOLLING=false
```

`CHOKIDAR_USEPOLLING=false` prevents EMFILE errors on Mac.

---

## Project File Structure

```
/
├── data/
│   └── npi_orchestrator.db        ← SQLite file, created at runtime, gitignored
├── lib/
│   ├── api/
│   │   └── utils.ts               ← shared helpers (JSON parsing, ID generators, etc.) for API routes
│   └── db/
│       ├── client.ts              ← better-sqlite3 singleton; initializes DB on first run
│       ├── schema.sql             ← CREATE TABLE statements (provided below)
│       └── seed.ts                ← populates tables if empty (provided below)
├── app/
│   ├── api/
│   │   ├── skus/route.ts          ← GET (list), POST (create)
│   │   ├── skus/[sku_id]/route.ts ← GET (one), PATCH (update)
│   │   ├── products/route.ts      ← GET (list)
│   │   ├── entitlements/route.ts  ← GET (by account), POST (create)
│   │   ├── entitlements/[id]/route.ts ← PATCH (update status/flags/constraints)
│   │   └── npi-parse/route.ts     ← POST: calls Claude API, returns parsed SKU schema
│   ├── npi/
│   │   └── page.tsx               ← NPI Fast-Track Tool UI
│   └── dashboard/
│       └── page.tsx               ← Customer Entitlement Dashboard UI
├── components/                    ← Shared React components
├── .gitignore                     ← must include: /data/*.db
├── package.json
└── next.config.ts
```

---

## Database Schema

The schema is in `/lib/db/schema.sql`. Do not deviate from it. Key design decisions:

- **`products`** — the engineering product. Owns the universe of available feature flags
  for that product via `available_flags` (JSON array of flag_ids).

- **`feature_flags`** — toggleable product capabilities. `status: INACTIVE` means deprecated
  — hide from all UIs even if referenced on old entitlements.

- **`skus`** — selling constructs on top of a product (1 product → many SKUs).
  - `is_bundle = 1` means this SKU is a bundle; `product_id` will be NULL and
    `component_sku_ids` lists the member SKUs.
  - `required_flags` — always activated when an entitlement is created for this SKU.
  - `optional_flags` — activated only if customer upgrades; subset of product's
    `available_flags`.
  - `constraint_definitions` — JSON array defining the schema for entitlement constraints.
    Each entry: `{ key, label, type, unit, required }`. This is what drives usage meters
    and limit displays in the customer dashboard.

- **`customer_accounts`** — customer entity (Salesforce Account equivalent).

- **`entitlements`** — the contract between account and SKU.
  - `constraints` — polymorphic JSON object. Keys match the SKU's `constraint_definitions`.
    Structure varies by product type — do NOT hardcode field names. Always read the SKU's
    `constraint_definitions` to know what keys to expect.
  - `activated_flags` / `locked_flags` — current feature flag state for this customer.

- **`npi_submissions`** — audit log of NPI tool usage. Every AI parse + publish is recorded.

---

## Seed Data Summary

The seed is in `/lib/db/seed.ts`. It populates:

**Feature Flags:** advanced-heuristics, behavioral-analytics, threat-intel-feed,
auto-remediation, dlp-inline, saas-visibility, legacy-sandbox (INACTIVE),
policy-enforcement, shadow-ai-detection

**Products:** Cortex Shield (CORTEX), Prisma Access (PRISMA), Cortex XSIAM (CORTEX),
AI Access Security (PRISMA) — intentionally has NO SKUs; used as the NPI Fast-Track demo target

**SKUs:**
- `SKU-CORTEX-SHIELD-ENT` — usage-based, $10/GB, no freemium, 12-month commit
- `SKU-CORTEX-SHIELD-FRM` — freemium, first 5GB free then $10/GB, no commit (the post-pivot SKU)
- `SKU-PRISMA-ACCESS-BW` — tiered, $25/Mbps, constraints: bandwidth_mbps + mobile_user_count
- `SKU-XSIAM-ENT` — flat, $85/endpoint, constraints: endpoint_count + data_retention_days
- `SKU-AI-SEC-BUNDLE-ENT` — bundle (is_bundle=1), contains SHIELD-ENT + XSIAM-ENT

**Accounts:**
- `ACC-001` Acme Financial Services (ENTERPRISE)
- `ACC-002` Globex Healthcare (MID-MARKET)
- `ACC-003` Initech Manufacturing (SMB)

**Entitlements:** 6 total across the 3 accounts, covering varied constraint shapes and
provisioning states (PROVISIONED and PENDING). ACC-001 has both SHIELD-FRM (at 3.2/5GB,
near freemium cap) and XSIAM-ENT. ACC-003 has a PENDING bundle entitlement.

---

## DB Client Pattern

`/lib/db/client.ts` must:
1. Import `better-sqlite3`
2. Create `/data/` directory if it doesn't exist
3. Open (or create) `/data/npi_orchestrator.db`
4. Run `schema.sql` (idempotent — uses `CREATE TABLE IF NOT EXISTS`)
5. Check if `products` table is empty; if so, run `seedDatabase(db)`
6. Export the db instance as a singleton (use module-level caching)

```typescript
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { readFileSync } from 'fs';
import { seedDatabase } from './seed';

const DB_PATH = path.join(process.cwd(), 'data', 'npi_orchestrator.db');
const SCHEMA_PATH = path.join(process.cwd(), 'lib', 'db', 'schema.sql');

let db: Database.Database;

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  const schema = readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);
  const count = (db.prepare('SELECT COUNT(*) as n FROM products').get() as any).n;
  if (count === 0) seedDatabase(db);
  return db;
}
```

---

## API Routes

### `/api/npi-parse` (POST)
This is the AI parsing endpoint. It receives a plain-English product concept and calls
the Claude API to return a structured SKU draft.

**Request body:**
```json
{ "concept": "We are launching AI Access Security. It governs employee use of generative AI tools across the organization. $15 per user per month, 12-month minimum commitment. Enable the Policy Enforcement flag by default, with Shadow AI Detection as an optional add-on." }
```

**What it does:**
- Calls **`claude-sonnet-4-5`** with a system prompt that instructs it to return ONLY
  valid JSON matching the SKU schema (no prose; no markdown code fences)
- The system prompt includes the full SKU schema structure as a reference and instructs
  Claude to **infer `constraint_definitions` from pricing model and unit** when implied
  by the concept (e.g. usage metric for USAGE/FREEMIUM, seat/endpoint-style metrics for FLAT,
  tier-driving metric for TIERED)
- After the model returns text, the route **strips leading/trailing markdown code fences**
  (e.g. `` ```json `` … `` ``` ``) before `JSON.parse`, so occasional fenced output still parses
- Returns **`{ data: <parsed schema>, raw: <original model text> }`** on success so the NPI
  UI can show a transparent “raw AI” view alongside the parsed form

**System prompt for Claude API (canonical copy in `app/api/npi-parse/route.ts`; keep in sync):**
```
You are an NPI schema parser for Palo Alto Networks. When given a plain-English
product concept, extract the structured fields and return ONLY a valid JSON object.
Do not include any explanation, preamble, or markdown code fences. Return raw JSON only.

The JSON must match this structure:
{
  "name": string,
  "pricing_model": "USAGE" | "FLAT" | "TIERED" | "FREEMIUM",
  "price_per_unit": number,
  "price_currency": "USD",
  "unit": "GB" | "SEAT" | "ENDPOINT" | "DEVICE" | "CREDIT" | "MBPS",
  "freemium_limit": number | null,
  "min_commitment_months": number,
  "required_flags": string[],
  "optional_flags": string[],
  "constraint_definitions": [
    { "key": string, "label": string, "type": "NUMERIC" | "STRING" | "BOOLEAN", "unit": string, "required": boolean }
  ],
  "notes": string
}

For required_flags and optional_flags, use only these valid flag_ids:
advanced-heuristics, behavioral-analytics, threat-intel-feed, auto-remediation,
dlp-inline, saas-visibility, policy-enforcement, shadow-ai-detection

If a field cannot be determined from the input, use null or an empty array.
Infer sensible constraint_definitions based on the pricing_model and unit when they are implied by the concept.
For example: USAGE/FREEMIUM usually needs a numeric usage metric (such as usage_gb), FLAT often uses seat/device/endpoint count, and TIERED should include the tier-driving metric.
Do not wrap the JSON in markdown code fences. Return raw JSON only with no backticks.
```

### `/api/skus` (GET, POST)
- GET: return all SKUs joined with product name. Include `constraint_definitions` in response.
- POST: create a new SKU. Auto-generate `sku_id` as `SKU-{SLUG}-{TIMESTAMP}`.
  Also insert an `npi_submissions` record.

### `/api/skus/[sku_id]` (GET, PATCH)
- GET: single SKU with product details
- PATCH: update SKU fields (used for the freemium pivot in the demo).
  Increment `version`. If `pricing_model` or `freemium_limit` changes, also update all
  ACTIVE entitlements for this SKU to reflect the new constraint values.

### `/api/entitlements` (GET, POST)
- GET: requires `?account_id=ACC-001`. Returns these fields per entitlement:
  - `entitlement_id`
  - `account_id`
  - `sku_id`
  - `sku_name`
  - `product_id`
  - `product_name`
  - `is_bundle`
  - `component_skus` (array of `{ sku_id, name }` — resolved from `component_sku_ids` for
    bundles, empty array for non-bundles)
  - `pricing_model`
  - `status`
  - `start_date`
  - `end_date`
  - `constraints` (parsed JSON)
  - `activated_flags` (parsed JSON)
  - `locked_flags` (parsed JSON)
  - `provisioning_status`
  - `account_tier`
  - `sku_pricing_model`
  - `sku_freemium_limit`
  - `activated_flag_details` (array of `{ flag_id, display_name, status }` — only ACTIVE flags)
  - `locked_flag_details` (array of `{ flag_id, display_name, status }` — only ACTIVE flags)
- POST: create a new entitlement. Auto-set `activated_flags` from SKU's `required_flags`.
  Auto-set `locked_flags` from SKU's `optional_flags`.
  - Supports explicit `activated_flags` / `locked_flags` in request body (used by NPI
    Published-tab provisioning flow).
  - Duplicate protection: if an **ACTIVE** entitlement already exists for the same
    `account_id + sku_id`, return **`409`** with `{ "error": "duplicate" }`.
  - POST handler checks for duplicate ACTIVE entitlements on the same `account_id + sku_id`
    and returns `409 { error: 'duplicate' }` if found.

#### `component_skus` resolver note

In `app/api/entitlements/route.ts`, bundle entitlements resolve `component_sku_ids` to names by
querying the `skus` table once for all bundle component IDs and building an ID→name map.
Non-bundle entitlements return `component_skus: []`.

### `/api/entitlements/[id]` (PATCH)
- Update `status`, `constraints`, `activated_flags`, `locked_flags`, or
  `provisioning_status`.

### `/api/products` (GET)
- Return all products with `available_flags` array parsed, joined with their flag details.

### Shared API helpers (`/lib/api/utils.ts`)

API routes import shared helpers from **`lib/api/utils.ts`** (for example JSON parsing
helpers and ID generators used by SKU and entitlement routes). Prefer extending this module
for cross-route utilities rather than duplicating logic.

---

## NPI Fast-Track Tool — UI Behavior

The NPI tool uses a **3-tab navigation** pattern (not a linear 3-screen wizard). **State is
preserved** when switching tabs so users can move back to Input or Review without losing
work. **Gated progression:** Review and Published tabs are visually disabled and non-clickable
until prerequisites are met — **Review** unlocks after a successful **Generate Schema**;
**Published** unlocks after **Publish SKU** (first publish). **Modify SKU** (live pivot) lives
on the Published tab and returns the user to the Review tab in PATCH mode.

**Tab 1 — Input**
- Large textarea: "Describe your new product concept"
- Pre-fill with: *"We are launching AI Access Security. It governs employee use of generative AI tools across the organization. $15 per user per month, 12-month minimum commitment. Enable the Policy Enforcement flag by default, with Shadow AI Detection as an optional add-on."*
- "Generate Schema" button → calls `POST /api/npi-parse` → loading state → switches to Review
  tab with form populated

**Tab 2 — Review**
- Form pre-filled from AI output. All fields editable.
- Fields: Name, Product (from `GET /api/products`), Pricing Model (dropdown), Price per Unit,
  Currency, Unit, Freemium Limit, Min Commitment, Required Flags (multi-select), Optional
  Flags (multi-select), Constraint Definitions (add/remove rows), Notes
- **Constraint definitions:** column headers **Key**, **Label**, **Type**, **Unit**,
  **Required** appear above the row inputs (aligned on md+ layouts). Each header uses a
  native **`title` tooltip** with this copy:
  - **Key:** `Internal identifier used in the system, e.g. usage_gb`
  - **Label:** `Human-readable name shown on customer dashboard, e.g. Data Processed (GB)`
  - **Type:** `Data type of the constraint value`
  - **Unit:** `Unit of measurement displayed to customers, e.g. GB, Mbps, Endpoints`
  - **Required:** `Whether this constraint must be set when provisioning a customer entitlement`
- **Raw AI Response:** collapsible section (collapsed by default) with toggle **"Show Raw AI
  Output"**; when expanded, shows the **raw model text** (`raw` from the parse response) in a
  monospace block before JSON parsing in the route
- **Preview Impact:** `GET /api/entitlements` for demo accounts (`ACC-001` … `ACC-003`).
  Shows a summary pill **"N account(s) affected"**; clicking it expands a **scrollable
  drill-down table** (max-height) with **Account ID**, **Company Name**, **Tier**
  (`account_tier`), **Affected SKU ID**, and **Impact Reason** text. Only **ACTIVE**
  entitlements are included; new-SKU preview matches selected **product**; modify-SKU preview
  matches entitlements for the **published SKU id**.

#### Impact reason implementation (`deriveImpactReason`)

- **Location:** `deriveImpactReason` is a **module-level** function in **`app/npi/page.tsx`**
  (not inside the default page component). Search for `function deriveImpactReason` in that
  file to open it.

- **Signature (four parameters):**
  1. **`isModify`** — whether the Review tab is in **Modify SKU** (PATCH) mode.
  2. **`published`** — the last **`PublishedSku`** from the Published tab, or `null` before
     first publish / when not modifying.
  3. **`currentEntitlementSku`** — snapshot `{ pricing_model, freemium_limit }` from the
     **joined SKU row** for the entitlement row being evaluated (`null` when the modify branch
     runs so the function does not use it for new-SKU copy).
  4. **`draft`** — the editable **`SkuDraft`** on the Review tab (the proposed new or updated
     SKU).

- **`GET /api/entitlements` data used:** each entitlement row includes **`sku_pricing_model`**
  and **`sku_freemium_limit`** selected from **`skus`** (same values as the entitlement’s
  current SKU). The UI’s **`ImpactRow`** type mirrors these on each preview row as
  **`currentSkuPricingModel`** and **`currentSkuFreemiumLimit`** (along with account, tier,
  `skuId`, and **`impactReason`**).

- **Modify-SKU path** (`isModify === true` and `published` is set): **`currentEntitlementSku`**
  is ignored. The function returns a **single concatenated message** built from diffs between
  **`draft`** and **`published`** (pricing model, freemium limit, required/optional flags,
  constraint definitions), or a generic line if nothing changed.

- **New-SKU path** (otherwise): compares **normalized** current SKU `pricing_model` vs
  **`draft.pricing_model`** (case-insensitive). It handles these **five** cases:

  1. **FREEMIUM → USAGE** — *Currently on Freemium tier — new SKU switches to usage-based pricing*
  2. **USAGE → FREEMIUM** — *Currently on paid usage — new SKU adds freemium tier with … free*
     (uses **`draft.freemium_limit`** and **`draft.unit`** when the limit is numeric; otherwise
     a fallback line without a numeric cap).
  3. **Same pricing model** (non-empty, equal after normalization) — *New SKU version
     available — pricing model unchanged*
  4. **`currentEntitlementSku` is `null`** — *New product offering — no existing entitlement to
     migrate* (defensive; normal new-SKU preview rows pass a non-null snapshot from the API).
  5. **Other model changes** (any remaining mismatch, e.g. FLAT ↔ TIERED) — a short generic line
     naming **current** vs **draft** pricing models.

  If the current SKU’s `pricing_model` **normalizes to empty** (missing / unusable), the code
  returns a **separate one-line fallback** (*no pricing model on file*) before falling through
  to case 5.
- **Publish SKU** → `POST /api/skus` (or **Re-publish** → `PATCH /api/skus/[sku_id]` in modify
  mode) → Published tab with full summary

**Tab 3 — Published**
- Published SKU summary (ids, pricing, flags, version, etc.) and **constraint_definitions**
  rendered as a readable table (key, label, type, unit, required)
- **Provision to Account** section appears below the published summary:
  - Label: **Provision this SKU to a customer account**
  - Account dropdown with known accounts (`ACC-001`, `ACC-002`, `ACC-003`), defaulting to
    `ACC-001`
  - **Provision** button posts to `POST /api/entitlements` with selected account + published SKU
  - Request payload includes:
    - `status: "ACTIVE"`
    - `start_date`: today (`YYYY-MM-DD`)
    - `end_date`: one year from today (`YYYY-MM-DD`) or `null` if `pricing_model` is `FREEMIUM`
    - `constraints`: auto-built from SKU `constraint_definitions`
    - `activated_flags`: copied from `required_flags`
    - `locked_flags`: copied from `optional_flags`
  - On success: green confirmation with clickable link to **Customer Dashboard** (`/dashboard`)
  - On duplicate (`409 { error: "duplicate" }`): yellow warning that account already has
    an active entitlement for that SKU
  - Section remains usable after success for provisioning to additional accounts
- **Modify SKU** → Review tab in PATCH mode for the freemium pivot demo (`FREEMIUM`,
  `freemium_limit`, etc.)

---

## Customer Dashboard — UI Behavior

- Account selector dropdown at top (ACC-001, ACC-002, ACC-003 with company names)
- Default to ACC-001 (most interesting entitlement set for demo)
- For each entitlement, show a card with:
  - Product name and SKU name
  - Status badge (ACTIVE green, PENDING yellow, SUSPENDED red)
  - Contract dates
  - Usage meters: for each constraint in `constraint_definitions`, render a progress bar
    showing `current_value` vs `limit` (or `freemium_limit` if freemium). Label from
    `constraint_definitions[n].label`. Show "Freemium" badge if freemium_limit is set.
  - Feature flags section: grid of tiles. Green "Active" for activated_flags.
    Gray "Locked 🔒" for locked_flags. Include flag display_name from feature_flags table.
    Do not show flags with status=INACTIVE.
- When ACC-001 is selected and the freemium Cortex Shield entitlement is shown,
  the usage bar should visually show 3.2/5 GB with a warning color (near cap).

---

## Customer Entitlement Dashboard

### Theme and Purpose

Light theme customer-facing portal.
- `bg-gray-50` page background
- white cards
- dark text
- `blue-600` accents matching NPI tool buttons

The dashboard should be visually distinct from the dark internal NPI tool to represent
two different personas: internal ops vs external customer.

### Route

`app/dashboard/page.tsx`

### Header

- Title: `Customer Portal`
- Subtitle: `Your active products and entitlements`
- PAN branding in light styling

### Account Selector

- Dropdown at top defaulting to `ACC-001`
- Hardcoded to three known accounts:
  - `ACC-001` Acme Financial Services (`ENTERPRISE`)
  - `ACC-002` Globex Healthcare (`MID-MARKET`)
  - `ACC-003` Initech Manufacturing (`SMB`)
- On change, fetches: `GET /api/entitlements?account_id={id}`

### Entitlement Cards

One card per entitlement showing:
- product name and SKU name as card title
  - for bundle SKUs (`is_bundle = 1` / `product_id = null`), use `Bundle` as the product label
    instead of `Unknown Product`
  - bundle cards show `Bundle - <SKU Name>` title format
- status badge:
  - `ACTIVE` green
  - `PENDING` yellow
  - `SUSPENDED` red
  - `INACTIVE` gray
- contract start and end dates formatted as readable dates
  - show `No expiry` if `end_date` is `null`
- provisioning status indicator

### Usage Meters

Dynamically rendered from the SKU's `constraint_definitions` array — never hardcode
field names like `usage_gb`.

For each constraint definition:
- render a labeled progress bar showing `current_value` vs `limit`
- use `freemium_limit` if `limit` is `null` and `freemium_limit` exists
- label comes from `constraint_definitions[n].label`
- unit comes from `constraint_definitions[n].unit`

Color rules:
- normal = blue
- near cap (`>= 80%`) = amber
- over cap = red

Show `Freemium` badge next to meter label if `freemium_limit` is set.

Key demo moment: `ACC-001` Cortex Shield Freemium shows `3.2/5 GB` (`64%`) in amber —
must be visually prominent.

### Feature Flags

Non-bundle cards render a Feature Flags grid:
- green `Active` for `activated_flag_details`
- gray `Locked 🔒` for `locked_flag_details`

Show `display_name` from the `feature_flags` table.
Never show flags with `status=INACTIVE`.

Bundle-card behavior:
- hide Feature Flags section entirely (flags are product-level)
- show an **Includes** section with resolved component SKU names as pill badges
- INCLUDES pills display `component.name` sourced from the resolved `component_skus` array

### API Requirement

`GET /api/entitlements` must return flag details (`display_name`, `status`) for both
activated and locked flags.

Current implementation: `app/api/entitlements/route.ts` returns
`activated_flag_details` and `locked_flag_details` by joining `feature_flags`.
It also returns `is_bundle` and resolved `component_skus` from the SKU row.

### Empty State

Show: `No active entitlements found for this account.` if no entitlements returned.

### Demo Flow

Switch account selector from `ACC-001` to `ACC-002` to `ACC-003` to show different
entitlement states.

`ACC-001` is the primary demo account — it has both:
- a near-cap freemium Cortex Shield entitlement
- a large XSIAM deployment

---

## Demo Flow (end-to-end)

1. Open dashboard → select `ACC-001` → note Cortex Shield Freemium at `3.2/5 GB` amber warning meter
2. Switch to NPI tool → Input tab → pre-filled AI Access Security concept text → click **Generate Schema**
3. Review tab → verify AI-parsed form fields → click **Preview Impact** → expand drill-down table showing per-account impact reasons
4. Click **Publish SKU** → Published tab shows SKU summary
5. Select `ACC-003` from account dropdown → click **Provision** → success message with Customer Dashboard link
6. Click Customer Dashboard link → switch to `ACC-003` → new entitlement card appears
7. Return to NPI tool → click **Modify SKU** → make a live configuration change (e.g. change pricing model or add a freemium tier) → click **Re-publish** → provision updated SKU → dashboard reflects change

---

## Demo Reset

To restore the database to clean seed state before a demo, delete the SQLite file and restart:

```bash
rm data/npi_orchestrator.db
npm run dev
```

Schema and seed data are recreated automatically.

---

## Important Constraints

- Do not hardcode constraint field names (usage_gb, endpoint_count, etc.) anywhere in the
  UI. Always read `constraint_definitions` from the SKU to render meters dynamically.
- Do not show feature flags with `status = 'INACTIVE'` anywhere in the UI.
- The `constraints` JSON shape on entitlements varies by product — treat it generically.
- Keep API routes simple — no auth, no middleware complexity. This is a demo.
- Use `better-sqlite3` (synchronous) not `sqlite3` (callback-based). All DB calls are sync.
- For local development that hits Anthropic or other external APIs, run **`npm run dev` from
  the Mac host terminal**, not Cursor’s integrated terminal (see **Local dev server** above).