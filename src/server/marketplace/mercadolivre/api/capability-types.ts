export type MercadoLivreCapabilityStatus =
  | "supported"
  | "unauthorized"
  | "forbidden"
  | "unavailable"
  | "rate_limited"
  | "failed"
  | "skipped";

export interface MercadoLivreCapabilityCheck {
  id: string;
  endpoint: string;
  status: MercadoLivreCapabilityStatus;
  httpStatus: number | null;
  durationMs: number;
  attempts: number;
  observed: Record<string, unknown>;
  error: string | null;
}

export interface MercadoLivreCapabilityProbeContext {
  requestedCategoryId: string | null;
  selectedCategoryId: string | null;
  selectedCategoryName: string | null;
  selectedCategoryIsLeaf: boolean | null;
  categoryPath: Array<{ id: string; name: string }>;
  selectedQuery: string | null;
  querySource: "category_trends" | "national_trends" | "fallback" | null;
  selectedProductId: string | null;
  selectedItemId: string | null;
  selectedUserProductId: string | null;
}

export interface MercadoLivreCapabilityProbeReport {
  schemaVersion: 1;
  marketplace: "mercado_livre";
  source: "official_api";
  siteId: "MLB";
  status: "success" | "partial" | "failed";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  context: MercadoLivreCapabilityProbeContext;
  summary: {
    total: number;
    supported: number;
    unauthorized: number;
    forbidden: number;
    unavailable: number;
    rateLimited: number;
    failed: number;
    skipped: number;
  };
  capabilities: Record<string, MercadoLivreCapabilityStatus>;
  checks: MercadoLivreCapabilityCheck[];
  notes: string[];
}

export interface MercadoLivreCapabilityProbeOptions {
  categoryId?: string;
  fallbackQuery?: string;
  log?: (message: string) => void;
}
