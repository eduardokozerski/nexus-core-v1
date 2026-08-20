import assert from "node:assert/strict";
import test from "node:test";

import type { RadarCandidate } from "./radar-types";
import {
  calculateRadarScore,
  matchTrendKeywords,
  selectHighlightsForEnrichment,
  selectDiverseCandidates,
} from "./radar";

function rankedCandidate(
  candidateId: string,
  domainId: string,
  score: number,
): RadarCandidate {
  return {
    radarRank: 0,
    candidateId,
    entityType: "PRODUCT",
    catalogProductId: candidateId,
    userProductId: null,
    name: candidateId,
    domainId,
    brand: null,
    imageUrl: null,
    catalogUrl: null,
    listingUrl: null,
    firstOfferItemId: null,
    sources: [{
      categoryId: "CATEGORY",
      categoryName: "Categoria",
      portfolioPriority: 1,
      highlightPosition: 1,
      entityId: candidateId,
      entityType: "PRODUCT",
    }],
    matchedTrends: [],
    keyAttributes: [],
    pricing: {
      offerCount: null,
      uniqueSellerCount: null,
      minimumPrice: null,
      medianPrice: null,
      maximumPrice: null,
      currencyId: null,
    },
    reviews: { count: null, ratingAverage: null },
    scores: {
      highlightScore: 0,
      reviewsScore: 0,
      ratingScore: 0,
      trendScore: 0,
      competitionScore: 0,
      priceScore: 0,
      riskPenalty: 0,
      researchPriorityScore: score,
    },
    priorityLabel: "medium_research_priority",
    flags: [],
    reasons: [],
  };
}

test("identifica correspondência determinística entre produto e tendência", () => {
  const result = matchTrendKeywords("Organizador de Talheres Modular", [
    "organizador de talheres",
    "pote hermético",
  ]);

  assert.deepEqual(result.keywords, ["organizador de talheres"]);
  assert.equal(result.strength, 1);
});

test("não confunde uma palavra genérica com uma tendência composta", () => {
  const result = matchTrendKeywords("Papel Fotográfico A4", [
    "papel celofane",
    "caixa cartonada",
  ]);

  assert.deepEqual(result.keywords, []);
  assert.equal(result.strength, 0);
});

test("score privilegia sinais fortes sem ultrapassar 100", () => {
  const score = calculateRadarScore({
    highlightPosition: 1,
    reviewCount: 12_000,
    ratingAverage: 4.9,
    trendMatchStrength: 1,
    uniqueSellerCount: 2,
    medianPrice: 100,
  });

  assert.equal(score.researchPriorityScore, 100);
  assert.equal(score.riskPenalty, 0);
});

test("marca comum não reduz a prioridade do radar", () => {
  const base = {
    highlightPosition: 5,
    reviewCount: 100,
    ratingAverage: 4.5,
    trendMatchStrength: 0.5,
    uniqueSellerCount: 8,
    medianPrice: 80,
  };
  const generic = calculateRadarScore(base);
  const branded = calculateRadarScore(base);

  assert.equal(branded.riskPenalty, 0);
  assert.equal(generic.researchPriorityScore, branded.researchPriorityScore);
});

test("diversifica a saída sem deixar um domínio dominar o radar", () => {
  const selected = selectDiverseCandidates(
    [
      rankedCandidate("A1", "DOMAIN_A", 90),
      rankedCandidate("A2", "DOMAIN_A", 89),
      rankedCandidate("A3", "DOMAIN_A", 88),
      rankedCandidate("B1", "DOMAIN_B", 80),
      rankedCandidate("C1", "DOMAIN_C", 70),
    ],
    1,
    4,
  );

  assert.deepEqual(selected.map((candidate) => candidate.candidateId), ["A1", "B1", "C1"]);
});

test("prefere representante do domínio com preço e página pública acionáveis", () => {
  const incomplete = rankedCandidate("A1", "DOMAIN_A", 95);
  const actionable = rankedCandidate("A2", "DOMAIN_A", 80);
  actionable.catalogUrl = "https://www.mercadolivre.com.br/p/A2";
  actionable.pricing.medianPrice = 39.9;

  const selected = selectDiverseCandidates([incomplete, actionable], 1, 1);

  assert.deepEqual(selected.map((candidate) => candidate.candidateId), ["A2"]);
});

test("substitui destaque decidido pelo proximo produto da categoria", () => {
  const selected = selectHighlightsForEnrichment(
    [
      { id: "A", type: "PRODUCT", position: 1 },
      { id: "B", type: "PRODUCT", position: 2 },
      { id: "C", type: "PRODUCT", position: 3 },
    ],
    new Set(["PRODUCT:A", "PRODUCT:B"]),
    1,
  );

  assert.deepEqual(selected, [{ id: "C", type: "PRODUCT", position: 3 }]);
});
