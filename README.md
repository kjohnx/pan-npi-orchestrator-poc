# NPI Orchestrator — Demo POC

A Next.js proof-of-concept for Palo Alto Networks demonstrating an
AI-assisted NPI-to-provisioning pipeline. Built as part of a
Principal PM case study.

This POC shows how plain-English product concepts can be automatically
parsed into structured SKU schemas, published to a licensing system,
provisioned to customer accounts, and immediately reflected on a
customer-facing entitlement dashboard — end to end.

---

## Business Problem

NPI teams define products in plain English. Downstream systems need
structured SKU definitions, entitlement rules, and feature flag states.
The manual translation between these two worlds takes 6+ weeks and
creates launch delays.

This POC demonstrates the automation layer that closes that gap.

---

## What's Covered

### Use Case 1 — AI-Assisted SKU Creation
Define a new product in plain English. The system uses Claude AI to
parse it into a structured SKU schema including pricing model, unit,
feature flags, and constraint definitions. The NPI team refines the SKU through
a multi-turn conversation — the form updates automatically as the AI understands intent.

### Use Case 2 — Business Rules Validation
Before publishing, the system validates the SKU draft against a set of 
business rules — for example, freemium SKUs must have a free tier limit set, 
usage-based SKUs must specify a unit, and metered pricing models require at least 
one usage constraint. Errors are surfaced clearly before the SKU can be published.

### Use Case 3 — Customer Impact Analysis
Before publishing, preview which customer accounts are affected by the
new SKU and why — with per-account specific impact reasons based on
their current entitlement state.

### Use Case 4 — Live SKU Modification
After publishing, modify the SKU using the chat interface by describing the change 
you want — eg, switching from usage-based to freemium pricing - and the AI automatically 
updates the form. The system revalidates the form and also shows how the change 
propagates to existing entitlements.

### Use Case 5 — Customer Entitlement Provisioning
After publishing a SKU, provision it directly to a customer account.
Constraints, flags, and contract dates are auto-populated from the
SKU definition.

### Use Case 6 — Customer Dashboard
Customers see their active entitlements with dynamic usage meters,
feature flag states (Active vs Locked), freemium caps, and contract
dates — all driven by the SKU's constraint definitions without
hardcoded field names.

---

## Two Prototypes

### NPI Fast-Track Tool (`/npi`)
Internal tool for the NPI/Ops team. Dark theme. Describe your product concept through a multi-turn conversation — the form updates automatically as the AI understands your intent. **Two-pane layout:** chat on the right
(`POST /api/npi-chat`), SKU form, validation, impact preview, and publish on the left.
After publish, **Published Summary** (provision to account, **Edit SKU** for PATCH mode)
appears on the left below the form.

### Customer Entitlement Dashboard (`/dashboard`)
Customer-facing portal. Light theme. Shows:

- Entitlement cards per product with status badges
- Dynamic usage meters from SKU constraint definitions
- Feature flag tiles (Active green / Locked gray)
- Freemium usage bars with near-cap warning colors
- Bundle entitlements showing component product names

---

## Tech Stack

- Next.js 14 (App Router, TypeScript)
- Tailwind CSS
- SQLite via `better-sqlite3` — file at `data/npi_orchestrator.db`
- Anthropic Claude API (`claude-sonnet-4-5`) for NPI schema parsing
- `json-rules-engine` for SKU business rules validation (BRMS layer)
- No external database required — fully local

---

## Run Locally

### Prerequisites
- Node.js 18+
- An Anthropic API key (required for the AI parsing feature)
  Get one at: https://console.anthropic.com

### Setup

1. Clone the repository:

```bash
git clone https://github.com/kjohnx/pan-npi-orchestrator-poc.git
cd pan-npi-orchestrator-poc
```

2. Install dependencies:

```bash
npm install
```

3. Create `.env.local` in the project root:

```
ANTHROPIC_API_KEY=your_anthropic_api_key_here
CHOKIDAR_USEPOLLING=false
```

4. Start the dev server from your terminal:

```bash
npm run dev
```

> **Important:** Run `npm run dev` from a standard terminal
> (Terminal.app, iTerm, etc.), not from within a sandboxed IDE
> terminal. Some IDE terminals restrict outbound network calls
> which will prevent the Anthropic API from working.

5. Open the app:

- NPI Fast-Track Tool: http://localhost:3000/npi
- Customer Dashboard: http://localhost:3000/dashboard

The SQLite database is created automatically on first run and
seeded with demo data (3 accounts, 5 SKUs (plus 1 bundle), 6 entitlements).

### Reset Demo Data

To restore the database to its original seed state before a demo:

```bash
rm -f data/npi_orchestrator.db data/npi_orchestrator.db-shm data/npi_orchestrator.db-wal
```

Then restart the dev server. The database will be recreated
automatically from the seed.

---

## Demo Accounts

| Account ID | Company | Tier |
|------------|---------|------|
| ACC-001 | Acme Financial Services | ENTERPRISE |
| ACC-002 | Globex Healthcare | MID-MARKET |
| ACC-003 | Initech Manufacturing | SMB |

ACC-001 is the primary demo account — it has a Cortex Shield
freemium entitlement near its usage cap (3.2/5 GB) which renders
as an amber warning meter on the dashboard.

---

## Notes

- This is a demo POC — not production code
- The Anthropic API key is required only for the NPI tool’s
  conversational assistant (`/api/npi-chat`). All other features work without it
- New SKUs and entitlements created during a session are stored in
  the local SQLite database and persist until reset
- Built using Cursor AI-assisted development as part of demonstrating
  AI pragmatism in PM practice