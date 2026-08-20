import type { RadarCandidate } from "./radar-types";

export type ProductViabilityStatus =
  | "ready_for_manual_validation"
  | "manual_viability_review"
  | "not_viable_for_portfolio"
  | "insufficient_market_data"
  | "ip_or_safety_review";

export interface OperationalProfile {
  maximumProductDimensionsMm: [number, number, number];
  compatibleMaterials: string[];
  maximumComponents: number;
  maximumPurchasedParts: number;
  bulkUnitThreshold: number;
  minimumCommodityUnitPrice: number;
}

export interface ViabilityRuleResult {
  code: string;
  reason: string;
  evidence?: Record<string, string | number | boolean | null>;
}

export interface ProductViabilityAssessment {
  ruleVersion: "product-viability-v1";
  status: ProductViabilityStatus;
  passedRules: ViabilityRuleResult[];
  failedRules: ViabilityRuleResult[];
  warnings: ViabilityRuleResult[];
  normalizedUnitCount: number;
  medianPricePerUnit: number | null;
  dimensionsMm: {
    length: number | null;
    width: number | null;
    depth: number | null;
    height: number | null;
  };
  fitsOperationalProfile: boolean | null;
  observedMaterials: string[];
  manualChecksRequired: string[];
}

export interface ProductViabilityCandidate {
  radarRank: number;
  candidateId: string;
  name: string;
  domainId: string | null;
  brand: string | null;
  catalogUrl: string | null;
  marketSignals: {
    researchPriorityScore: number;
    priorityLabel: RadarCandidate["priorityLabel"];
    medianPrice: number | null;
    reviewCount: number | null;
    ratingAverage: number | null;
    uniqueSellerCount: number | null;
  };
  productViability: ProductViabilityAssessment;
}

export interface ProductViabilityPreview {
  schemaVersion: 1;
  ruleVersion: "product-viability-v1";
  marketplace: "mercado_livre";
  source: "official_api_radar";
  generatedAt: string;
  sourceRadarStartedAt: string;
  sourceRadarFinishedAt: string;
  operationalProfile: OperationalProfile;
  summary: {
    totalCandidates: number;
    readyForManualValidation: number;
    manualViabilityReview: number;
    notViableForPortfolio: number;
    insufficientMarketData: number;
    ipOrSafetyReview: number;
  };
  candidates: ProductViabilityCandidate[];
  notes: string[];
}
