# NPI Orchestrator (Demo POC)

`npi-orchestrator` is a Next.js demo application for Palo Alto Networks that models a common product operations problem: translating new product packaging ideas into structured SKUs quickly, then reflecting the impact on downstream customer entitlements.

The POC is intentionally lightweight and local-first. It is designed for demoability and clarity, not production scale.

## Business Problem

NPI teams often start from plain-English product concepts, while downstream systems need structured contract and entitlement data. This creates friction between:

- New SKU definition and review
- Entitlement provisioning and feature-flag state
- Customer visibility into usage limits and locked vs active capabilities

This project demonstrates an end-to-end flow that closes that gap with AI-assisted parsing and a simple entitlement model.

## Prototypes

### 1) NPI Fast-Track Tool (`/app/npi`)

Internal workflow for defining and publishing SKUs:

- Accepts a plain-English product concept
- Calls an API route backed by Anthropic Claude to parse it into SKU schema JSON
- Lets NPI users review/edit fields before publishing
- Supports post-publish SKU modification (e.g., freemium pivot) and entitlement impact

### 2) Customer Entitlement Dashboard (`/app/dashboard`)

Customer-facing entitlement view:

- Account-level entitlement cards
- Dynamic usage meters driven by SKU `constraint_definitions`
- Feature flag state shown as Active vs Locked
- Hides deprecated (`INACTIVE`) feature flags

## Tech Stack

- Next.js 14 (App Router, TypeScript)
- Tailwind CSS
- SQLite (`better-sqlite3`) at `data/npi_orchestrator.db`
- Anthropic Claude API (`claude-sonnet-4-20250514`) for NPI schema parsing
- Local development in Cursor

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` in the project root:

```bash
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

The key is required for the NPI parsing flow (`/api/npi-parse`).

3. Start the dev server:

```bash
npm run dev
```

4. Open the app:

- [http://localhost:3000](http://localhost:3000)

On first DB access, the app initializes SQLite schema and seed data automatically via `lib/db/client.ts`.
