-- =============================================================================
-- NPI Orchestrator - Database Schema
-- SQLite with JSON columns for polymorphic/array fields
-- File location in project: /data/npi_orchestrator.db (gitignored)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PRODUCTS
-- The engineering product - owns the feature flag universe for that product.
-- One product can have many SKUs (different packaging/pricing of the same thing).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  product_id      TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  product_line    TEXT,               -- e.g. CORTEX, PRISMA, NGFW, XSIAM
  status          TEXT DEFAULT 'ACTIVE',  -- ACTIVE | DEPRECATED
  available_flags JSON DEFAULT '[]',  -- array of flag_ids available on this product
  supported_constraints JSON DEFAULT '[]',  -- array of constraint_keys from constraint_master
  created_at      TEXT DEFAULT (datetime('now'))
);

-- -----------------------------------------------------------------------------
-- FEATURE FLAGS
-- Toggleable capabilities in the product UI.
-- Products reference these by flag_id in their available_flags array.
-- SKUs specify which subset of a product's flags they include (required/optional).
-- Entitlements track which flags are currently activated vs locked per customer.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feature_flags (
  flag_id       TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  description   TEXT,
  default_state TEXT DEFAULT 'LOCKED',  -- LOCKED | ACTIVE (what new entitlements get)
  status        TEXT DEFAULT 'ACTIVE'   -- ACTIVE | INACTIVE (INACTIVE = deprecated, hide from UI)
);

-- -----------------------------------------------------------------------------
-- CONSTRAINT MASTER
-- Authoritative registry of measurable constraints available across products.
-- Products reference these by constraint_key in their supported_constraints array.
-- SKUs denormalize a subset into constraint_definitions at publish time.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS constraint_master (
  constraint_key  TEXT PRIMARY KEY,
  display_name    TEXT NOT NULL,
  unit            TEXT NOT NULL,
  data_type       TEXT NOT NULL,   -- NUMERIC | STRING | BOOLEAN
  category        TEXT,            -- USAGE | CAPACITY | COMPLIANCE
  description     TEXT,            -- human-readable explanation
  llm_hint        TEXT,            -- guidance for LLM: when to apply this constraint
  status          TEXT DEFAULT 'ACTIVE'  -- ACTIVE | DEPRECATED
);

-- -----------------------------------------------------------------------------
-- SKUs
-- Selling constructs on top of a product. One product → many SKUs.
-- Bundles are also SKUs (is_bundle = 1), with component_sku_ids listing
-- what they contain. Bundle SKUs have product_id = NULL.
-- constraint_definitions defines the schema for entitlement constraints -
-- this drives what fields/meters appear in the customer dashboard per product.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS skus (
  sku_id                  TEXT PRIMARY KEY,
  product_id              TEXT REFERENCES products(product_id),  -- NULL if is_bundle
  name                    TEXT NOT NULL,
  status                  TEXT DEFAULT 'DRAFT',  -- DRAFT | ACTIVE | DEPRECATED
  is_bundle               INTEGER DEFAULT 0,     -- 0=false, 1=true (SQLite boolean)
  component_sku_ids       JSON DEFAULT '[]',     -- only populated when is_bundle=1

  -- Pricing
  pricing_model           TEXT,                  -- USAGE | FLAT | TIERED | FREEMIUM
  price_per_unit          REAL,
  price_currency          TEXT DEFAULT 'USD',
  unit                    TEXT,                  -- GB | SEAT | ENDPOINT | DEVICE | CREDIT | MBPS
  freemium_limit          REAL,                  -- numeric limit for freemium tier (NULL if not freemium)
  min_commitment_months   INTEGER DEFAULT 12,

  -- Feature flags (subset of product's available_flags)
  required_flags          JSON DEFAULT '[]',     -- array of flag_ids, always activated on entitlement
  optional_flags          JSON DEFAULT '[]',     -- array of flag_ids, locked until customer upgrades

  -- Constraint schema - defines what entitlement constraints mean for this SKU.
  -- Each entry: { key, label, type, unit, required }
  -- Types: NUMERIC | STRING | BOOLEAN | DATE
  -- The 'key' maps to the constraints JSON object on entitlements.
  -- Example: [{ "key": "usage_gb", "label": "Data Processed", "type": "NUMERIC", "unit": "GB", "required": true }]
  constraint_definitions  JSON DEFAULT '[]',

  created_at              TEXT DEFAULT (datetime('now')),
  version                 INTEGER DEFAULT 1
);

-- -----------------------------------------------------------------------------
-- CUSTOMER ACCOUNTS
-- The customer entity. In production this would be the Salesforce Account.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_accounts (
  account_id    TEXT PRIMARY KEY,
  company_name  TEXT NOT NULL,
  tier          TEXT DEFAULT 'ENTERPRISE',  -- ENTERPRISE | MID-MARKET | SMB
  csm_id        TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

-- -----------------------------------------------------------------------------
-- ENTITLEMENTS
-- The contract between a customer account and a SKU.
-- constraints is a polymorphic JSON object - its keys and structure are
-- defined by the SKU's constraint_definitions. This means the entitlement
-- schema does not need to change when new product types are introduced.
--
-- Example constraints for a usage-based product:
--   { "usage_gb": { "limit": null, "freemium_limit": 5, "current_value": 3.2 } }
--
-- Example constraints for a hardware NGFW:
--   { "device_serial": { "value": "PA12345678" },
--     "subscription_term_months": { "value": 12 } }
--
-- Example constraints for a credit-pool product (Prisma Cloud):
--   { "credit_pool": { "limit": 5000, "current_value": 1230 } }
--
-- Example constraints for an endpoint-count product (Cortex XDR):
--   { "endpoint_count": { "limit": 500, "current_value": 312 } }
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS entitlements (
  entitlement_id       TEXT PRIMARY KEY,
  account_id           TEXT NOT NULL REFERENCES customer_accounts(account_id),
  sku_id               TEXT NOT NULL REFERENCES skus(sku_id),
  status               TEXT DEFAULT 'ACTIVE',    -- ACTIVE | INACTIVE | PENDING | SUSPENDED
  start_date           TEXT,
  end_date             TEXT,

  -- Polymorphic constraints - keyed by constraint_definitions on the SKU
  constraints          JSON DEFAULT '{}',

  -- Feature flag state for this specific entitlement
  activated_flags      JSON DEFAULT '[]',        -- array of flag_ids currently active
  locked_flags         JSON DEFAULT '[]',        -- array of flag_ids currently locked

  provisioning_status  TEXT DEFAULT 'PENDING',   -- PENDING | PROVISIONED | FAILED
  created_at           TEXT DEFAULT (datetime('now'))
);

-- -----------------------------------------------------------------------------
-- NPI SUBMISSIONS (audit log)
-- Records each time the NPI Fast-Track tool was used to create or modify a SKU.
-- Captures the raw plain-text input and the AI-generated schema for traceability.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS npi_submissions (
  submission_id     TEXT PRIMARY KEY,
  submitted_by      TEXT,                  -- user/team who submitted
  raw_input         TEXT,                  -- the plain-English product concept pasted in
  generated_schema  JSON,                  -- the AI-parsed SKU schema before review
  final_schema      JSON,                  -- the schema after human review/edits
  resulting_sku_id  TEXT REFERENCES skus(sku_id),
  status            TEXT DEFAULT 'DRAFT',  -- DRAFT | PUBLISHED | REJECTED
  created_at        TEXT DEFAULT (datetime('now'))
);

-- -----------------------------------------------------------------------------
-- Indexes for common query patterns
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_entitlements_account     ON entitlements(account_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_sku         ON entitlements(sku_id);
CREATE INDEX IF NOT EXISTS idx_skus_product             ON skus(product_id);
CREATE INDEX IF NOT EXISTS idx_skus_status              ON skus(status);
CREATE INDEX IF NOT EXISTS idx_constraint_master_status ON constraint_master(status);