import type {
  MercadoLivreCapabilityCheck,
  MercadoLivreCapabilityStatus,
} from "./capability-types";

export type DimensionReadiness = "radar_ready" | "discovery_only" | "unsupported";

export interface DimensionCoverageResult {
  categoryId: string;
  expectedName: string;
  actualName: string | null;
  rationale: string;
  portfolioPriority: number;
  pathFromRoot: Array<{ id: string; name: string }>;
  isLeaf: boolean | null;
  readiness: DimensionReadiness;
  coverageScore: number;
  reasons: string[];
  selectedProductId: string | null;
  selectedItemId: string | null;
  metrics: {
    trendCount: number | null;
    highlightCount: number | null;
    highlightTypes: Record<string, number>;
    offerCount: number | null;
    uniqueSellerCount: number | null;
    minimumPrice: number | null;
    medianPrice: number | null;
    maximumPrice: number | null;
    currencyId: string | null;
    reviewCount: number | null;
    ratingAverage: number | null;
  };
  statuses: {
    category: MercadoLivreCapabilityStatus;
    trends: MercadoLivreCapabilityStatus;
    highlights: MercadoLivreCapabilityStatus;
    userProductResolution: MercadoLivreCapabilityStatus;
    offers: MercadoLivreCapabilityStatus;
    reviews: MercadoLivreCapabilityStatus;
  };
  checks: MercadoLivreCapabilityCheck[];
}

export interface MercadoLivreDimensionCoverageReport {
  schemaVersion: 1;
  marketplace: "mercado_livre";
  source: "official_api";
  siteId: "MLB";
  status: "success" | "partial" | "failed";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  summary: {
    tested: number;
    radarReady: number;
    discoveryOnly: number;
    unsupported: number;
    rateLimitedChecks: number;
    failedChecks: number;
  };
  recommendedPortfolio: Array<{
    categoryId: string;
    name: string;
    coverageScore: number;
    rationale: string;
    portfolioPriority: number;
  }>;
  authentication: MercadoLivreCapabilityCheck;
  dimensions: DimensionCoverageResult[];
  notes: string[];
}
