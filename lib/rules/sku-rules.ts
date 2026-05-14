import { Engine } from "json-rules-engine";

export type SkuFacts = {
  pricing_model: string;
  freemium_limit: number | null;
  min_commitment_months: number;
  unit: string | null;
  price_per_unit: number | null;
  constraint_definitions_count: number;
};

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

function buildEngine(): Engine {
  const engine = new Engine();

  engine.addRule({
    name: "freemium-requires-limit",
    conditions: {
      all: [
        { fact: "pricing_model", operator: "equal", value: "FREEMIUM" },
        {
          any: [
            { fact: "freemium_limit", operator: "equal", value: null },
            { fact: "freemium_limit", operator: "lessThanInclusive", value: 0 },
          ],
        },
      ],
    },
    event: {
      type: "validation-error",
      params: {
        message: "Freemium pricing model requires a freemium limit greater than 0",
      },
    },
  });

  engine.addRule({
    name: "freemium-no-commitment",
    conditions: {
      all: [
        { fact: "pricing_model", operator: "equal", value: "FREEMIUM" },
        { fact: "min_commitment_months", operator: "greaterThan", value: 0 },
      ],
    },
    event: {
      type: "validation-error",
      params: {
        message: "Freemium pricing model must have a minimum commitment of 0 months",
      },
    },
  });

  engine.addRule({
    name: "usage-tiered-requires-unit",
    conditions: {
      all: [
        { fact: "pricing_model", operator: "in", value: ["USAGE", "TIERED"] },
        {
          any: [
            { fact: "unit", operator: "equal", value: null },
            { fact: "unit", operator: "equal", value: "" },
          ],
        },
      ],
    },
    event: {
      type: "validation-error",
      params: {
        message: "Usage and Tiered pricing models require a unit to be specified",
      },
    },
  });

  engine.addRule({
    name: "price-must-be-positive",
    conditions: {
      any: [
        { fact: "price_per_unit", operator: "equal", value: null },
        { fact: "price_per_unit", operator: "lessThanInclusive", value: 0 },
      ],
    },
    event: {
      type: "validation-error",
      params: {
        message: "Price per unit must be greater than 0",
      },
    },
  });

  engine.addRule({
    name: "metered-requires-constraints",
    conditions: {
      all: [
        {
          fact: "pricing_model",
          operator: "in",
          value: ["USAGE", "TIERED", "FREEMIUM"],
        },
        { fact: "constraint_definitions_count", operator: "equal", value: 0 },
      ],
    },
    event: {
      type: "validation-error",
      params: {
        message:
          "At least one constraint definition is required for Usage, Tiered, or Freemium pricing models",
      },
    },
  });

  return engine;
}

export async function validateSkuDraft(facts: SkuFacts): Promise<ValidationResult> {
  const engine = buildEngine();
  const { events } = await engine.run(facts);
  const messages = events
    .map((e) => (e.params as { message?: string } | undefined)?.message)
    .filter((m): m is string => typeof m === "string" && m.length > 0);
  return {
    valid: messages.length === 0,
    errors: messages,
  };
}
