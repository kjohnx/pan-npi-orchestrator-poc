# Cursor Context: NPI Orchestrator Project

This file provides context to the Cursor AI coding assistant for building this prototype.
It contains the data model, API spec, and UI behavior for the two demo prototypes.
Built as part of a Principal PM case study for Palo Alto Networks.

Read this before writing any code. This is the full context for what we are building.

---

## What We Are Building

A Next.js application called **npi-orchestrator** with two functional prototypes:

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
auto-remediation, dlp-inline, saas-visibility, legacy-sandbox (INACTIVE)

**Products:** Cortex Shield (CORTEX), Prisma Access (PRISMA), Cortex XSIAM (CORTEX)

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
{ "concept": "We are launching Cortex Shield. It costs $10/GB, requires a 1-year minimum,
   and needs to toggle the Advanced-Heuristics flag in the firewall." }
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
dlp-inline, saas-visibility

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
- GET: requires `?account_id=ACC-001`. Returns entitlements joined with SKU and product name,
  **`account_tier`** from `customer_accounts.tier`, and including all JSON fields parsed
  (not raw strings).
- POST: create a new entitlement. Auto-set `activated_flags` from SKU's `required_flags`.
  Auto-set `locked_flags` from SKU's `optional_flags`.

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
- Pre-fill with: *"We are launching 'Cortex Shield.' It costs $10/GB, requires a 1-year
  minimum, and needs to toggle the 'Advanced-Heuristics' flag in the firewall."*
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
- **Impact reason copy:** strings such as *"New SKU for selected product …"* are built in
  **`deriveImpactReason`** in **`app/npi/page.tsx`** (module-level function; search
  **`New SKU for selected product`** in the repo to find the exact line). Confirm with
  stakeholders if this logic should remain client-only or move to an API for consistency.
- **Publish SKU** → `POST /api/skus` (or **Re-publish** → `PATCH /api/skus/[sku_id]` in modify
  mode) → Published tab with full summary

**Tab 3 — Published**
- Published SKU summary (ids, pricing, flags, version, etc.) and **constraint_definitions**
  rendered as a readable table (key, label, type, unit, required)
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

## Demo Flow (for reference — do not build UI for this, just keep it in mind)

1. Panel opens dashboard → ACC-001 → sees Cortex Shield at 3.2/5GB (near freemium cap)
2. Switch to NPI tool → **Input** tab → product concept → **Generate Schema** → **Review** tab
3. AI fills form → review → Publish
4. Panel says: "Make it Freemium — first 5GB free"
5. Modify SKU → change to FREEMIUM, set freemium_limit=5 → re-publish
6. Switch back to dashboard → ACC-001 → usage bar and freemium badge now reflect the change

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
