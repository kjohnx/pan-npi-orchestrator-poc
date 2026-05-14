// =============================================================================
// NPI Orchestrator - Seed Data
// Run once on first startup if tables are empty.
// Covers: 4 products, 6 SKUs (incl. 1 bundle, pre/post freemium Cortex Shield),
//         3 customer accounts, 6 entitlements across varied constraint types.
//
// NOTE: PROD-AI-ACCESS-SEC is intentionally seeded with no SKUs or entitlements.
// It exists as the demo target for the NPI Fast-Track Tool — the default prompt
// creates the first SKU for this product, making the creation clearly new.
// =============================================================================

import Database from 'better-sqlite3';

export function seedDatabase(db: Database.Database) {

  // --------------------------------------------------------------------------
  // CONSTRAINT MASTER
  // Must be seeded before products since products reference constraint_keys.
  // --------------------------------------------------------------------------
  const constraintMasterEntries = [
    {
      constraint_key: 'usage_gb',
      display_name: 'Data Processed',
      unit: 'GB',
      data_type: 'NUMERIC',
      category: 'USAGE',
      description: 'Measures GB of data processed or transferred',
      llm_hint: 'Apply when pricing is per GB of data processed or transferred',
      status: 'ACTIVE',
    },
    {
      constraint_key: 'endpoint_count',
      display_name: 'Licensed Endpoints',
      unit: 'ENDPOINTS',
      data_type: 'NUMERIC',
      category: 'CAPACITY',
      description: 'Measures number of managed devices or endpoints',
      llm_hint: 'Apply when product is licensed per managed device or endpoint',
      status: 'ACTIVE',
    },
    {
      constraint_key: 'bandwidth_mbps',
      display_name: 'Licensed Bandwidth',
      unit: 'Mbps',
      data_type: 'NUMERIC',
      category: 'CAPACITY',
      description: 'Measures network throughput capacity',
      llm_hint: 'Apply when product capacity is measured in network throughput or Mbps',
      status: 'ACTIVE',
    },
    {
      constraint_key: 'seat_count',
      display_name: 'Licensed Seats',
      unit: 'SEATS',
      data_type: 'NUMERIC',
      category: 'CAPACITY',
      description: 'Measures named users or seats',
      llm_hint: 'Apply when product is licensed per named user or seat',
      status: 'ACTIVE',
    },
    {
      constraint_key: 'mobile_user_count',
      display_name: 'Mobile Users',
      unit: 'USERS',
      data_type: 'NUMERIC',
      category: 'CAPACITY',
      description: 'Measures mobile user count separately from total seat count',
      llm_hint: 'Apply when product has a distinct mobile user limit separate from total seat count',
      status: 'ACTIVE',
    },
    {
      constraint_key: 'credit_pool',
      display_name: 'Credits',
      unit: 'CREDITS',
      data_type: 'NUMERIC',
      category: 'USAGE',
      description: 'Measures consumption from a credit pool',
      llm_hint: 'Apply for consumption-based products where customers draw down from a credit balance',
      status: 'ACTIVE',
    },
    {
      constraint_key: 'data_retention_days',
      display_name: 'Log Retention',
      unit: 'DAYS',
      data_type: 'NUMERIC',
      category: 'COMPLIANCE',
      description: 'Measures log retention period in days',
      llm_hint: 'Apply when product includes a configurable log retention period',
      status: 'ACTIVE',
    },
    {
      constraint_key: 'api_calls',
      display_name: 'API Calls',
      unit: 'CALLS',
      data_type: 'NUMERIC',
      category: 'USAGE',
      description: 'Measures number of API calls consumed',
      llm_hint: 'Apply when product is metered by API call volume',
      status: 'ACTIVE',
    },
  ];

  const insertConstraint = db.prepare(`
    INSERT OR IGNORE INTO constraint_master
      (constraint_key, display_name, unit, data_type, category, description, llm_hint, status)
    VALUES
      (@constraint_key, @display_name, @unit, @data_type, @category, @description, @llm_hint, @status)
  `);
  for (const c of constraintMasterEntries) insertConstraint.run(c);


  // --------------------------------------------------------------------------
  // FEATURE FLAGS
  // --------------------------------------------------------------------------
  const flags = [
    {
      flag_id: 'advanced-heuristics',
      display_name: 'Advanced Heuristics',
      description: 'Next-gen behavioral threat modeling using ML pattern detection',
      default_state: 'LOCKED',
      status: 'ACTIVE',
    },
    {
      flag_id: 'behavioral-analytics',
      display_name: 'Behavioral Analytics',
      description: 'User and entity behavior analytics (UEBA) for insider threat detection',
      default_state: 'LOCKED',
      status: 'ACTIVE',
    },
    {
      flag_id: 'threat-intel-feed',
      display_name: 'Threat Intelligence Feed',
      description: 'Real-time global threat intelligence from Unit 42',
      default_state: 'ACTIVE',
      status: 'ACTIVE',
    },
    {
      flag_id: 'auto-remediation',
      display_name: 'Auto Remediation',
      description: 'Automated response playbooks triggered by detected threats',
      default_state: 'LOCKED',
      status: 'ACTIVE',
    },
    {
      flag_id: 'dlp-inline',
      display_name: 'Inline DLP',
      description: 'Real-time data loss prevention on network traffic',
      default_state: 'LOCKED',
      status: 'ACTIVE',
    },
    {
      flag_id: 'saas-visibility',
      display_name: 'SaaS Visibility',
      description: 'Shadow IT discovery and SaaS application risk scoring',
      default_state: 'LOCKED',
      status: 'ACTIVE',
    },
    {
      flag_id: 'legacy-sandbox',
      display_name: 'Legacy Sandbox',
      description: 'Original WildFire sandbox (deprecated - replaced by Advanced WildFire)',
      default_state: 'LOCKED',
      status: 'INACTIVE',  // deprecated flag - hidden from new SKUs and UI
    },
    // -------------------------------------------------------------------------
    // AI Access Security flags (new product - used in NPI demo)
    // -------------------------------------------------------------------------
    {
      flag_id: 'policy-enforcement',
      display_name: 'Policy Enforcement',
      description: 'Enforce acceptable-use policies for generative AI tools in real time',
      default_state: 'ACTIVE',
      status: 'ACTIVE',
    },
    {
      flag_id: 'shadow-ai-detection',
      display_name: 'Shadow AI Detection',
      description: 'Discover and risk-score unsanctioned AI tools used across the organization',
      default_state: 'LOCKED',
      status: 'ACTIVE',
    },
  ];

  const insertFlag = db.prepare(`
    INSERT OR IGNORE INTO feature_flags (flag_id, display_name, description, default_state, status)
    VALUES (@flag_id, @display_name, @description, @default_state, @status)
  `);
  for (const flag of flags) insertFlag.run(flag);


  // --------------------------------------------------------------------------
  // PRODUCTS
  // --------------------------------------------------------------------------
  const products = [
    {
      product_id: 'PROD-CORTEX-SHIELD',
      name: 'Cortex Shield',
      description: 'AI-powered network threat detection and response platform',
      product_line: 'CORTEX',
      status: 'ACTIVE',
      available_flags: JSON.stringify([
        'advanced-heuristics',
        'behavioral-analytics',
        'threat-intel-feed',
        'auto-remediation',
      ]),
      supported_constraints: JSON.stringify(['usage_gb']),
    },
    {
      product_id: 'PROD-PRISMA-ACCESS',
      name: 'Prisma Access',
      description: 'Cloud-delivered SASE platform for secure remote access and branch connectivity',
      product_line: 'PRISMA',
      status: 'ACTIVE',
      available_flags: JSON.stringify([
        'dlp-inline',
        'saas-visibility',
        'threat-intel-feed',
      ]),
      supported_constraints: JSON.stringify(['bandwidth_mbps', 'mobile_user_count']),
    },
    {
      product_id: 'PROD-XSIAM',
      name: 'Cortex XSIAM',
      description: 'AI-driven security operations platform - SOC automation and incident management',
      product_line: 'CORTEX',
      status: 'ACTIVE',
      available_flags: JSON.stringify([
        'advanced-heuristics',
        'behavioral-analytics',
        'auto-remediation',
        'threat-intel-feed',
      ]),
      supported_constraints: JSON.stringify(['endpoint_count', 'data_retention_days']),
    },
    {
      product_id: 'PROD-AI-ACCESS-SEC',
      name: 'AI Access Security',
      description: 'Governs and secures employee use of generative AI tools across the organization',
      product_line: 'PRISMA',
      status: 'ACTIVE',
      available_flags: JSON.stringify([
        'policy-enforcement',
        'shadow-ai-detection',
      ]),
      supported_constraints: JSON.stringify(['seat_count']),
    },
  ];

  const insertProduct = db.prepare(`
    INSERT OR IGNORE INTO products
      (product_id, name, description, product_line, status, available_flags, supported_constraints)
    VALUES
      (@product_id, @name, @description, @product_line, @status, @available_flags, @supported_constraints)
  `);
  for (const p of products) insertProduct.run(p);


  // --------------------------------------------------------------------------
  // SKUs
  // Note: Two Cortex Shield SKUs to demonstrate the live SKU modification demo:
  //   SKU-CORTEX-SHIELD-ENT   = standard usage-based, no freemium (pre-modification)
  //   SKU-CORTEX-SHIELD-FRM   = freemium tier, 5GB free (post-modification)
  //
  // PROD-AI-ACCESS-SEC has NO SKUs — the NPI Fast-Track demo creates the first one.
  // --------------------------------------------------------------------------
  const skus = [
    // -- Cortex Shield: Enterprise Usage --------------------------------------
    {
      sku_id: 'SKU-CORTEX-SHIELD-ENT',
      product_id: 'PROD-CORTEX-SHIELD',
      name: 'Cortex Shield Enterprise',
      status: 'ACTIVE',
      is_bundle: 0,
      component_sku_ids: JSON.stringify([]),
      pricing_model: 'USAGE',
      price_per_unit: 10.00,
      price_currency: 'USD',
      unit: 'GB',
      freemium_limit: null,
      min_commitment_months: 12,
      required_flags: JSON.stringify(['threat-intel-feed']),
      optional_flags: JSON.stringify(['advanced-heuristics', 'behavioral-analytics']),
      constraint_definitions: JSON.stringify([
        {
          key: 'usage_gb',
          label: 'Data Processed (GB)',
          type: 'NUMERIC',
          unit: 'GB',
          required: true,
        },
      ]),
      version: 1,
    },

    // -- Cortex Shield: Freemium ----------------------------------------------
    {
      sku_id: 'SKU-CORTEX-SHIELD-FRM',
      product_id: 'PROD-CORTEX-SHIELD',
      name: 'Cortex Shield Freemium',
      status: 'ACTIVE',
      is_bundle: 0,
      component_sku_ids: JSON.stringify([]),
      pricing_model: 'FREEMIUM',
      price_per_unit: 10.00,
      price_currency: 'USD',
      unit: 'GB',
      freemium_limit: 5,             // first 5GB free
      min_commitment_months: 0,      // no commitment for freemium
      required_flags: JSON.stringify(['threat-intel-feed']),
      optional_flags: JSON.stringify(['advanced-heuristics', 'behavioral-analytics']),
      constraint_definitions: JSON.stringify([
        {
          key: 'usage_gb',
          label: 'Data Processed (GB)',
          type: 'NUMERIC',
          unit: 'GB',
          required: true,
        },
      ]),
      version: 1,
    },

    // -- Prisma Access: Bandwidth-based ----------------------------------------
    {
      sku_id: 'SKU-PRISMA-ACCESS-BW',
      product_id: 'PROD-PRISMA-ACCESS',
      name: 'Prisma Access - Bandwidth',
      status: 'ACTIVE',
      is_bundle: 0,
      component_sku_ids: JSON.stringify([]),
      pricing_model: 'TIERED',
      price_per_unit: 25.00,
      price_currency: 'USD',
      unit: 'MBPS',
      freemium_limit: null,
      min_commitment_months: 12,
      required_flags: JSON.stringify(['threat-intel-feed']),
      optional_flags: JSON.stringify(['dlp-inline', 'saas-visibility']),
      constraint_definitions: JSON.stringify([
        {
          key: 'bandwidth_mbps',
          label: 'Licensed Bandwidth (Mbps)',
          type: 'NUMERIC',
          unit: 'MBPS',
          required: true,
        },
        {
          key: 'mobile_user_count',
          label: 'Mobile Users',
          type: 'NUMERIC',
          unit: 'USERS',
          required: true,
        },
      ]),
      version: 1,
    },

    // -- XSIAM: Endpoint-count based -------------------------------------------
    {
      sku_id: 'SKU-XSIAM-ENT',
      product_id: 'PROD-XSIAM',
      name: 'Cortex XSIAM Enterprise',
      status: 'ACTIVE',
      is_bundle: 0,
      component_sku_ids: JSON.stringify([]),
      pricing_model: 'FLAT',
      price_per_unit: 85.00,
      price_currency: 'USD',
      unit: 'ENDPOINT',
      freemium_limit: null,
      min_commitment_months: 12,
      required_flags: JSON.stringify(['threat-intel-feed', 'behavioral-analytics']),
      optional_flags: JSON.stringify(['advanced-heuristics', 'auto-remediation']),
      constraint_definitions: JSON.stringify([
        {
          key: 'endpoint_count',
          label: 'Licensed Endpoints',
          type: 'NUMERIC',
          unit: 'ENDPOINTS',
          required: true,
        },
        {
          key: 'data_retention_days',
          label: 'Log Retention (Days)',
          type: 'NUMERIC',
          unit: 'DAYS',
          required: false,
        },
      ]),
      version: 1,
    },

    // -- AI Security Bundle (is_bundle=1) -------------------------------------
    {
      sku_id: 'SKU-AI-SEC-BUNDLE-ENT',
      product_id: null,
      name: 'AI Security Bundle - Enterprise',
      status: 'ACTIVE',
      is_bundle: 1,
      component_sku_ids: JSON.stringify([
        'SKU-CORTEX-SHIELD-ENT',
        'SKU-XSIAM-ENT',
      ]),
      pricing_model: 'FLAT',
      price_per_unit: 50000.00,
      price_currency: 'USD',
      unit: 'SEAT',
      freemium_limit: null,
      min_commitment_months: 12,
      required_flags: JSON.stringify([]),
      optional_flags: JSON.stringify([]),
      constraint_definitions: JSON.stringify([
        {
          key: 'seat_count',
          label: 'Licensed Seats',
          type: 'NUMERIC',
          unit: 'SEATS',
          required: true,
        },
      ]),
      version: 1,
    },
  ];

  const insertSku = db.prepare(`
    INSERT OR IGNORE INTO skus (
      sku_id, product_id, name, status, is_bundle, component_sku_ids,
      pricing_model, price_per_unit, price_currency, unit, freemium_limit,
      min_commitment_months, required_flags, optional_flags,
      constraint_definitions, version
    ) VALUES (
      @sku_id, @product_id, @name, @status, @is_bundle, @component_sku_ids,
      @pricing_model, @price_per_unit, @price_currency, @unit, @freemium_limit,
      @min_commitment_months, @required_flags, @optional_flags,
      @constraint_definitions, @version
    )
  `);
  for (const s of skus) insertSku.run(s);


  // --------------------------------------------------------------------------
  // CUSTOMER ACCOUNTS
  // --------------------------------------------------------------------------
  const accounts = [
    {
      account_id: 'ACC-001',
      company_name: 'Acme Financial Services',
      tier: 'ENTERPRISE',
      csm_id: 'CSM-007',
    },
    {
      account_id: 'ACC-002',
      company_name: 'Globex Healthcare',
      tier: 'MID-MARKET',
      csm_id: 'CSM-012',
    },
    {
      account_id: 'ACC-003',
      company_name: 'Initech Manufacturing',
      tier: 'SMB',
      csm_id: 'CSM-019',
    },
  ];

  const insertAccount = db.prepare(`
    INSERT OR IGNORE INTO customer_accounts (account_id, company_name, tier, csm_id)
    VALUES (@account_id, @company_name, @tier, @csm_id)
  `);
  for (const a of accounts) insertAccount.run(a);


  // --------------------------------------------------------------------------
  // ENTITLEMENTS
  // Each entitlement demonstrates a different constraint shape to show the
  // polymorphic model working across product types.
  // NOTE: No entitlements for PROD-AI-ACCESS-SEC — provisioning happens live
  // during the demo after the new SKU is created via the NPI Fast-Track Tool.
  // --------------------------------------------------------------------------
  const entitlements = [
    // ACC-001: Cortex Shield Freemium (usage-based, near freemium cap - amber warning)
    {
      entitlement_id: 'ENT-001-SHIELD',
      account_id: 'ACC-001',
      sku_id: 'SKU-CORTEX-SHIELD-FRM',
      status: 'ACTIVE',
      start_date: '2026-01-01',
      end_date: '2027-01-01',
      constraints: JSON.stringify({
        usage_gb: {
          limit: null,
          freemium_limit: 5,
          current_value: 3.2,   // 3.2GB used of 5GB free - near cap, triggers amber warning
        },
      }),
      activated_flags: JSON.stringify(['threat-intel-feed']),
      locked_flags: JSON.stringify(['advanced-heuristics', 'behavioral-analytics']),
      provisioning_status: 'PROVISIONED',
    },

    // ACC-001: XSIAM (endpoint-count based, large enterprise deployment)
    {
      entitlement_id: 'ENT-001-XSIAM',
      account_id: 'ACC-001',
      sku_id: 'SKU-XSIAM-ENT',
      status: 'ACTIVE',
      start_date: '2026-01-01',
      end_date: '2027-01-01',
      constraints: JSON.stringify({
        endpoint_count: {
          limit: 1000,
          current_value: 847,   // 847 of 1000 endpoints deployed
        },
        data_retention_days: {
          value: 365,
        },
      }),
      activated_flags: JSON.stringify([
        'threat-intel-feed',
        'behavioral-analytics',
        'advanced-heuristics',
      ]),
      locked_flags: JSON.stringify(['auto-remediation']),
      provisioning_status: 'PROVISIONED',
    },

    // ACC-002: Prisma Access (bandwidth-based, mid-market)
    {
      entitlement_id: 'ENT-002-PRISMA',
      account_id: 'ACC-002',
      sku_id: 'SKU-PRISMA-ACCESS-BW',
      status: 'ACTIVE',
      start_date: '2025-07-01',
      end_date: '2026-07-01',
      constraints: JSON.stringify({
        bandwidth_mbps: {
          limit: 500,
          current_value: 320,
        },
        mobile_user_count: {
          limit: 200,
          current_value: 155,
        },
      }),
      activated_flags: JSON.stringify(['threat-intel-feed']),
      locked_flags: JSON.stringify(['dlp-inline', 'saas-visibility']),
      provisioning_status: 'PROVISIONED',
    },

    // ACC-002: Cortex Shield Enterprise (full enterprise, no freemium cap)
    {
      entitlement_id: 'ENT-002-SHIELD',
      account_id: 'ACC-002',
      sku_id: 'SKU-CORTEX-SHIELD-ENT',
      status: 'ACTIVE',
      start_date: '2025-07-01',
      end_date: '2026-07-01',
      constraints: JSON.stringify({
        usage_gb: {
          limit: 500,
          freemium_limit: null,
          current_value: 178,
        },
      }),
      activated_flags: JSON.stringify([
        'threat-intel-feed',
        'advanced-heuristics',
      ]),
      locked_flags: JSON.stringify(['behavioral-analytics']),
      provisioning_status: 'PROVISIONED',
    },

    // ACC-003: Cortex Shield Freemium (SMB, just onboarded, minimal usage)
    {
      entitlement_id: 'ENT-003-SHIELD',
      account_id: 'ACC-003',
      sku_id: 'SKU-CORTEX-SHIELD-FRM',
      status: 'ACTIVE',
      start_date: '2026-04-01',
      end_date: null,            // freemium - no fixed end date
      constraints: JSON.stringify({
        usage_gb: {
          limit: null,
          freemium_limit: 5,
          current_value: 0.8,   // light usage, well under cap
        },
      }),
      activated_flags: JSON.stringify(['threat-intel-feed']),
      locked_flags: JSON.stringify(['advanced-heuristics', 'behavioral-analytics']),
      provisioning_status: 'PROVISIONED',
    },

    // ACC-003: AI Security Bundle (pending provisioning - shows PENDING state)
    {
      entitlement_id: 'ENT-003-BUNDLE',
      account_id: 'ACC-003',
      sku_id: 'SKU-AI-SEC-BUNDLE-ENT',
      status: 'PENDING',
      start_date: '2026-05-01',
      end_date: '2027-05-01',
      constraints: JSON.stringify({
        seat_count: {
          limit: 50,
          current_value: 0,    // not yet provisioned
        },
      }),
      activated_flags: JSON.stringify([]),
      locked_flags: JSON.stringify([]),
      provisioning_status: 'PENDING',
    },
  ];

  const insertEntitlement = db.prepare(`
    INSERT OR IGNORE INTO entitlements (
      entitlement_id, account_id, sku_id, status, start_date, end_date,
      constraints, activated_flags, locked_flags, provisioning_status
    ) VALUES (
      @entitlement_id, @account_id, @sku_id, @status, @start_date, @end_date,
      @constraints, @activated_flags, @locked_flags, @provisioning_status
    )
  `);
  for (const e of entitlements) insertEntitlement.run(e);

  console.log('✅ Database seeded successfully');
}