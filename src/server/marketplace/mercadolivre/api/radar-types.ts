import type { MercadoLivreCapabilityCheck } from "./capability-types";

export interface RadarDimensionSource {
  categoryId: string;
  categoryName: string;
  portfolioPriority: number;
  highlightPosition: number;
  entityId: string;
  entityType: string;
}

export interface RadarScoreComponents {
  highlightScore: number;
  reviewsScore: number;
  ratingScore: number;
  trendScore: number;
  competitionScore: number;
  priceScore: number;
  riskPenalty: number;
  researchPriorityScore: number;
}

export interface RadarCandidate {
  radarRank: number;
  candidateId: string;
  entityType: "PRODUCT" | "USER_PRODUCT";
  catalogProductId: string | null;
  userProductId: string | null;
  name: string;
  domainId: string | null;
  brand: string | null;
  imageUrl: string | null;
  catalogUrl: string | null;
  listingUrl: string | null;
  firstOfferItemId: string | null;
  sources: RadarDimensionSource[];
  matchedTrends: string[];
  keyAttributes: Array<{ id: string; name: string | null; value: string | null }>;
  pricing: {
    offerCount: number | null;
    uniqueSellerCount: number | null;
    minimumPrice: number | null;
    medianPrice: number | null;
    maximumPrice: number | null;
    currencyId: string | null;
  };
  reviews: {
    count: number | null;
    ratingAverage: number | null;
  };
  scores: RadarScoreComponents;
  priorityLabel: "high_research_priority" | "medium_research_priority" | "exploratory";
  flags: string[];
  reasons: string[];
}

export interface RadarDimensionSnapshot {
  categoryId: string;
  categoryName: string;
  portfolioPriority: number;
  rationale: string;
  trends: {
    status: string;
    count: number;
    keywords: string[];
  };
  highlights: {
    status: string;
    count: number;
    entities: Array<{ id: string; type: string; position: number }>;
    selectedForEnrichment: Array<{ id: string; type: string; position: number }>;
  };
}

export interface MercadoLivreRadarReport {
  schemaVersion: 1;
  scoreVersion: "research-priority-v2";
  marketplace: "mercado_livre";
  source: "official_api";
  siteId: "MLB";
  status: "success" | "partial" | "failed";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  configuration: {
    dimensionCount: number;
    highlightLimitPerDimension: number;
    maximumEntitiesBeforeDeduplication: number;
    maximumCandidatesPerDomain: number;
    maximumCandidatesAfterDiversity: number;
    dimensionIds: string[];
  };
  summary: {
    dimensionsSupported: number;
    trendKeywordsCollected: number;
    highlightEntitiesCollected: number;
    entitiesSelectedForEnrichment: number;
    candidatesBeforeDiversity: number;
    candidatesAfterDeduplication: number;
    candidatesAfterDiversity: number;
    unresolvedEntities: number;
    highResearchPriority: number;
    mediumResearchPriority: number;
    exploratory: number;
    failedChecks: number;
    rateLimitedChecks: number;
  };
  dimensions: RadarDimensionSnapshot[];
  candidates: RadarCandidate[];
  unresolvedEntities: Array<{
    categoryId: string;
    categoryName: string;
    entityId: string;
    entityType: string;
    highlightPosition: number;
    reason: string;
  }>;
  checks: MercadoLivreCapabilityCheck[];
  notes: string[];
}

export interface RadarScoreInput {
  highlightPosition: number;
  reviewCount: number | null;
  ratingAverage: number | null;
  trendMatchStrength: number;
  uniqueSellerCount: number | null;
  medianPrice: number | null;
}
