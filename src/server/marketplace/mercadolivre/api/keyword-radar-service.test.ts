import assert from "node:assert/strict";
import test from "node:test";

import type { MercadoLivreRadarReport, RadarCandidate } from "./radar-types";
import { filterOfficialRadarByKeyword, maximumUnitsFromNotes } from "./keyword-radar-service";

function candidate(name: string, units: number): RadarCandidate {
  return {
    radarRank: 1,
    candidateId: `PRODUCT:${name}`,
    entityType: "PRODUCT",
    catalogProductId: name,
    userProductId: null,
    name,
    domainId: "MLB-KITCHEN_CABINET_ORGANIZERS",
    brand: null,
    imageUrl: null,
    catalogUrl: null,
    listingUrl: null,
    firstOfferItemId: null,
    sources: [{ categoryId: "MLB1", categoryName: "Organização", portfolioPriority: 1, highlightPosition: 1, entityId: name, entityType: "PRODUCT" }],
    matchedTrends: [],
    keyAttributes: [{ id: "UNITS_PER_PACK", name: "Unidades", value: String(units) }],
    pricing: { offerCount: 2, uniqueSellerCount: 2, minimumPrice: 30, medianPrice: 30, maximumPrice: 30, currencyId: "BRL" },
    reviews: { count: 1_000, ratingAverage: 4.8 },
    scores: { highlightScore: 30, reviewsScore: 12, ratingScore: 10, trendScore: 0, competitionScore: 15, priceScore: 10, riskPenalty: 0, researchPriorityScore: 77 },
    priorityLabel: "high_research_priority",
    flags: [],
    reasons: [],
  };
}

function report(candidates: RadarCandidate[]): MercadoLivreRadarReport {
  return {
    schemaVersion: 1, scoreVersion: "research-priority-v2", marketplace: "mercado_livre", source: "official_api", siteId: "MLB", status: "success", startedAt: "2026-07-23T00:00:00.000Z", finishedAt: "2026-07-23T00:00:01.000Z", durationMs: 1,
    configuration: { dimensionCount: 2, highlightLimitPerDimension: 10, maximumEntitiesBeforeDeduplication: 20, maximumCandidatesPerDomain: 1, maximumCandidatesAfterDiversity: 12, dimensionIds: ["MLB1"] },
    summary: { dimensionsSupported: 2, trendKeywordsCollected: 0, highlightEntitiesCollected: 20, entitiesSelectedForEnrichment: 20, candidatesBeforeDiversity: candidates.length, candidatesAfterDeduplication: candidates.length, candidatesAfterDiversity: candidates.length, unresolvedEntities: 0, highResearchPriority: candidates.length, mediumResearchPriority: 0, exploratory: 0, failedChecks: 0, rateLimitedChecks: 0 },
    dimensions: [], candidates, unresolvedEntities: [], checks: [], notes: [],
  };
}

test("interpreta limite de unidades explicitamente informado", () => {
  assert.equal(maximumUnitsFromNotes("ofertas com no máximo 6 unidades"), 6);
  assert.equal(maximumUnitsFromNotes("somente contexto"), null);
});

test("mantém apenas destaque oficial que corresponde ao termo e ao kit", () => {
  const filtered = filterOfficialRadarByKeyword(
    report([candidate("Organizador de Cabos", 6), candidate("Organizador de Cabos Kit 50", 50), candidate("Organizador de Pia", 1)]),
    { keyword: "organizador de cabo", maximumUnitsPerListing: 6 },
  );

  assert.deepEqual(filtered.candidates.map((item) => item.name), ["Organizador de Cabos"]);
  assert.match(filtered.candidates[0].reasons.at(-1) ?? "", /limite de 6/);
});
