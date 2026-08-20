import assert from "node:assert/strict";
import test from "node:test";

import { assessProductViability } from "./product-viability";
import type { RadarCandidate } from "./radar-types";

function candidate(overrides: Partial<RadarCandidate> = {}): RadarCandidate {
  return {
    radarRank: 1,
    candidateId: "PRODUCT:TEST",
    entityType: "PRODUCT",
    catalogProductId: "TEST",
    userProductId: null,
    name: "Acessório doméstico compacto",
    domainId: "MLB-SINK_ORGANIZERS_AND_KITCHEN_SPONGE_HOLDERS",
    brand: "Genérica",
    imageUrl: null,
    catalogUrl: "https://www.mercadolivre.com.br/p/TEST",
    listingUrl: "https://www.mercadolivre.com.br/MLBTEST",
    firstOfferItemId: null,
    sources: [],
    matchedTrends: [],
    keyAttributes: [],
    pricing: { offerCount: 1, uniqueSellerCount: 1, minimumPrice: 50, medianPrice: 50, maximumPrice: 50, currencyId: "BRL" },
    reviews: { count: 100, ratingAverage: 4.8 },
    scores: { highlightScore: 30, reviewsScore: 9, ratingScore: 10, trendScore: 0, competitionScore: 15, priceScore: 15, riskPenalty: 0, researchPriorityScore: 79 },
    priorityLabel: "high_research_priority",
    flags: [],
    reasons: [],
    ...overrides,
  };
}

test("calcula preço unitário e exclui kit de commodity", () => {
  const result = assessProductViability(candidate({ name: "Kit 50 Acessórios", keyAttributes: [{ id: "UNITS_PER_PACK", name: "Unidades", value: "50" }] }));

  assert.equal(result.normalizedUnitCount, 50);
  assert.equal(result.medianPricePerUnit, 1);
  assert.equal(result.status, "not_viable_for_portfolio");
  assert.ok(result.failedRules.some((entry) => entry.code === "bulk_commodity_economics"));
});

test("encaminha produto priorizado para validação humana", () => {
  const result = assessProductViability(candidate());

  assert.equal(result.status, "ready_for_manual_validation");
  assert.ok(result.passedRules.some((entry) => entry.code === "prioritized_product_domain"));
});

test("mantém produto sem página pública apenas como diagnóstico", () => {
  const result = assessProductViability(candidate({ listingUrl: null, catalogUrl: null }));

  assert.equal(result.status, "insufficient_market_data");
  assert.ok(result.warnings.some((entry) => entry.code === "insufficient_actionable_market_data"));
});

test("sinaliza identidade conhecida para revisão humana", () => {
  const result = assessProductViability(candidate({ name: "Acessório temático Marvel" }));

  assert.equal(result.status, "manual_viability_review");
  assert.ok(result.warnings.some((entry) => entry.code === "licensed_identity_notice"));
});

test("considera as dimensões no perfil operacional", () => {
  const result = assessProductViability(candidate({ keyAttributes: [{ id: "LENGTH", name: "Comprimento", value: "45 cm" }, { id: "WIDTH", name: "Largura", value: "34,5 cm" }] }));

  assert.equal(result.dimensionsMm.length, 450);
  assert.equal(result.fitsOperationalProfile, false);
  assert.equal(result.status, "manual_viability_review");
  assert.ok(result.warnings.some((entry) => entry.code === "oversize_review"));
});
