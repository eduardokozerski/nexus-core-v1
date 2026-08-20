import {
  executeCapabilityCheck,
  skippedCapabilityCheck,
} from "./capability-request";
import type { MercadoLivreCapabilityStatus } from "./capability-types";
import { MERCADO_LIVRE_DIMENSION_SEEDS } from "./dimension-seeds";
import type {
  DimensionCoverageResult,
  DimensionReadiness,
  MercadoLivreDimensionCoverageReport,
} from "./dimension-coverage-types";

const SITE_ID = "MLB" as const;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function categoryPath(body: unknown): Array<{ id: string; name: string }> {
  return asArray(asRecord(body).path_from_root)
    .map((entry) => {
      const record = asRecord(entry);
      const id = asId(record.id);
      const name = asString(record.name);
      return id && name ? { id, name } : null;
    })
    .filter((entry): entry is { id: string; name: string } => entry !== null);
}

function summarizeAuthentication(body: unknown): Record<string, unknown> {
  return {
    authenticated: true,
    siteId: asString(asRecord(body).site_id),
  };
}

function summarizeCategory(body: unknown): Record<string, unknown> {
  const record = asRecord(body);
  const children = asArray(record.children_categories);
  return {
    id: asId(record.id),
    name: asString(record.name),
    isLeaf: children.length === 0,
    childrenCount: children.length,
    pathFromRoot: categoryPath(body),
  };
}

function trendCount(body: unknown): number {
  return asArray(body).filter((entry) => asString(asRecord(entry).keyword)).length;
}

function summarizeTrends(body: unknown): Record<string, unknown> {
  const keywords = asArray(body)
    .map((entry) => asString(asRecord(entry).keyword))
    .filter((keyword): keyword is string => keyword !== null);
  return { count: keywords.length, sample: keywords.slice(0, 5) };
}

interface HighlightEntry {
  id: string;
  type: string;
  position: number | null;
}

function highlightEntries(body: unknown): HighlightEntry[] {
  return asArray(asRecord(body).content)
    .map((entry) => {
      const record = asRecord(entry);
      const id = asId(record.id);
      const type = asString(record.type);
      if (!id || !type) return null;
      return { id, type, position: asNumber(record.position) };
    })
    .filter((entry): entry is HighlightEntry => entry !== null);
}

function highlightTypeCounts(body: unknown): Record<string, number> {
  return highlightEntries(body).reduce<Record<string, number>>((counts, entry) => {
    counts[entry.type] = (counts[entry.type] ?? 0) + 1;
    return counts;
  }, {});
}

function summarizeHighlights(body: unknown): Record<string, unknown> {
  const entries = highlightEntries(body);
  return {
    count: entries.length,
    types: highlightTypeCounts(body),
    sample: entries.slice(0, 5),
  };
}

function summarizeUserProduct(body: unknown): Record<string, unknown> {
  const record = asRecord(body);
  return {
    id: asId(record.id),
    name: asString(record.name),
    catalogProductId: asId(record.catalog_product_id),
    domainId: asString(record.domain_id),
  };
}

function offerEntries(body: unknown): JsonRecord[] {
  return asArray(asRecord(body).results).map(asRecord);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function offerMetrics(body: unknown) {
  const record = asRecord(body);
  const paging = asRecord(record.paging);
  const offers = offerEntries(body);
  const prices = offers
    .map((offer) => asNumber(offer.price))
    .filter((price): price is number => price !== null);
  const sellerIds = new Set(
    offers.map((offer) => asId(offer.seller_id)).filter((id): id is string => id !== null),
  );

  return {
    offerCount: asNumber(paging.total) ?? offers.length,
    uniqueSellerCount: sellerIds.size,
    minimumPrice: prices.length > 0 ? Math.min(...prices) : null,
    medianPrice: median(prices),
    maximumPrice: prices.length > 0 ? Math.max(...prices) : null,
    currencyId: offers.map((offer) => asString(offer.currency_id)).find(Boolean) ?? null,
  };
}

function summarizeOffers(body: unknown): Record<string, unknown> {
  return {
    ...offerMetrics(body),
    sample: offerEntries(body).slice(0, 5).map((offer) => ({
      itemId: asId(offer.item_id),
      sellerId: asId(offer.seller_id),
      price: asNumber(offer.price),
      currencyId: asString(offer.currency_id),
    })),
  };
}

function reviewMetrics(body: unknown) {
  const record = asRecord(body);
  const paging = asRecord(record.paging);
  return {
    reviewCount: asNumber(paging.total) ?? asArray(record.reviews).length,
    ratingAverage: asNumber(record.rating_average),
  };
}

function summarizeReviews(body: unknown): Record<string, unknown> {
  return { ...reviewMetrics(body), reviewTextsPersisted: false };
}

export function calculateCoverageScore(statuses: {
  category: MercadoLivreCapabilityStatus;
  trends: MercadoLivreCapabilityStatus;
  highlights: MercadoLivreCapabilityStatus;
  offers: MercadoLivreCapabilityStatus;
  reviews: MercadoLivreCapabilityStatus;
}): number {
  return (
    (statuses.category === "supported" ? 10 : 0) +
    (statuses.trends === "supported" ? 25 : 0) +
    (statuses.highlights === "supported" ? 30 : 0) +
    (statuses.offers === "supported" ? 25 : 0) +
    (statuses.reviews === "supported" ? 10 : 0)
  );
}

export function classifyDimensionReadiness(statuses: {
  trends: MercadoLivreCapabilityStatus;
  highlights: MercadoLivreCapabilityStatus;
  offers: MercadoLivreCapabilityStatus;
}): DimensionReadiness {
  if (
    statuses.trends === "supported" &&
    statuses.highlights === "supported" &&
    statuses.offers === "supported"
  ) {
    return "radar_ready";
  }
  if (statuses.trends === "supported" || statuses.highlights === "supported") {
    return "discovery_only";
  }
  return "unsupported";
}

function readinessReasons(
  statuses: DimensionCoverageResult["statuses"],
  metrics: DimensionCoverageResult["metrics"],
): string[] {
  const reasons: string[] = [];
  if (statuses.trends !== "supported") reasons.push("Tendências não disponíveis.");
  if (statuses.highlights !== "supported") reasons.push("Ranking de mais vendidos não disponível.");
  if (statuses.offers !== "supported") reasons.push("Ofertas concorrentes não resolvidas.");
  if (statuses.reviews !== "supported") reasons.push("Avaliações não disponíveis na amostra.");
  if (metrics.highlightCount === 0) reasons.push("Ranking retornou zero entidades.");
  if (metrics.offerCount === 0) reasons.push("Produto líder retornou zero ofertas.");
  if (reasons.length === 0) reasons.push("Cobertura completa para descoberta e enriquecimento inicial.");
  return reasons;
}

async function pauseBetweenDimensions(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 250));
}

export async function probeMercadoLivreDimensionCoverage(
  log: (message: string) => void = () => undefined,
): Promise<MercadoLivreDimensionCoverageReport> {
  const startedAt = new Date();
  const authentication = await executeCapabilityCheck(
    "coverage_authentication",
    "/users/me",
    summarizeAuthentication,
  );

  if (authentication.check.status !== "supported") {
    const finishedAt = new Date();
    return {
      schemaVersion: 1,
      marketplace: "mercado_livre",
      source: "official_api",
      siteId: SITE_ID,
      status: "failed",
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      summary: {
        tested: 0,
        radarReady: 0,
        discoveryOnly: 0,
        unsupported: 0,
        rateLimitedChecks: authentication.check.status === "rate_limited" ? 1 : 0,
        failedChecks: 1,
      },
      recommendedPortfolio: [],
      authentication: authentication.check,
      dimensions: [],
      notes: ["A execução foi interrompida porque a autenticação não está válida."],
    };
  }

  const dimensions: DimensionCoverageResult[] = [];

  for (const [index, seed] of MERCADO_LIVRE_DIMENSION_SEEDS.entries()) {
    log(
      `[meli-coverage] ${index + 1}/${MERCADO_LIVRE_DIMENSION_SEEDS.length}: ${seed.categoryId} (${seed.expectedName}).`,
    );
    const checks = [];
    const categoryId = encodeURIComponent(seed.categoryId);

    const category = await executeCapabilityCheck(
      `${seed.categoryId}_category`,
      `/categories/${categoryId}`,
      summarizeCategory,
    );
    checks.push(category.check);

    const trends = await executeCapabilityCheck(
      `${seed.categoryId}_trends`,
      `/trends/${SITE_ID}/${categoryId}`,
      summarizeTrends,
    );
    checks.push(trends.check);

    const highlights = await executeCapabilityCheck(
      `${seed.categoryId}_highlights`,
      `/highlights/${SITE_ID}/category/${categoryId}`,
      summarizeHighlights,
    );
    checks.push(highlights.check);

    const entries = highlightEntries(highlights.body);
    let selectedProductId = entries.find((entry) => entry.type === "PRODUCT")?.id ?? null;
    let userProductStatus: MercadoLivreCapabilityStatus = "skipped";

    if (!selectedProductId) {
      const userProduct = entries.find((entry) => entry.type === "USER_PRODUCT");
      if (userProduct) {
        const resolution = await executeCapabilityCheck(
          `${seed.categoryId}_user_product`,
          `/user-products/${encodeURIComponent(userProduct.id)}`,
          summarizeUserProduct,
        );
        checks.push(resolution.check);
        userProductStatus = resolution.check.status;
        selectedProductId = asId(asRecord(resolution.body).catalog_product_id);
      } else {
        checks.push(
          skippedCapabilityCheck(
            `${seed.categoryId}_user_product`,
            "/user-products/{user_product_id}",
            "Ranking sem PRODUCT e sem USER_PRODUCT para resolver.",
          ),
        );
      }
    } else {
      checks.push(
        skippedCapabilityCheck(
          `${seed.categoryId}_user_product`,
          "/user-products/{user_product_id}",
          "Ranking já forneceu PRODUCT diretamente.",
        ),
      );
    }

    let offersBody: unknown = null;
    let offersStatus: MercadoLivreCapabilityStatus = "skipped";
    if (selectedProductId) {
      const offers = await executeCapabilityCheck(
        `${seed.categoryId}_offers`,
        `/products/${encodeURIComponent(selectedProductId)}/items`,
        summarizeOffers,
      );
      checks.push(offers.check);
      offersBody = offers.body;
      offersStatus = offers.check.status;
    } else {
      checks.push(
        skippedCapabilityCheck(
          `${seed.categoryId}_offers`,
          "/products/{product_id}/items",
          "Nenhum PRODUCT foi resolvido a partir do ranking.",
        ),
      );
    }

    const firstOffer = offerEntries(offersBody)[0];
    const selectedItemId = asId(firstOffer?.item_id);
    let reviewsBody: unknown = null;
    let reviewsStatus: MercadoLivreCapabilityStatus = "skipped";
    if (selectedItemId && selectedProductId) {
      const query = new URLSearchParams({ catalog_product_id: selectedProductId });
      const reviews = await executeCapabilityCheck(
        `${seed.categoryId}_reviews`,
        `/reviews/item/${encodeURIComponent(selectedItemId)}?${query.toString()}`,
        summarizeReviews,
      );
      checks.push(reviews.check);
      reviewsBody = reviews.body;
      reviewsStatus = reviews.check.status;
    } else {
      checks.push(
        skippedCapabilityCheck(
          `${seed.categoryId}_reviews`,
          "/reviews/item/{item_id}",
          "Nenhum item_id e product_id foram resolvidos simultaneamente.",
        ),
      );
    }

    const categoryRecord = asRecord(category.body);
    const trendTotal = trends.check.status === "supported" ? trendCount(trends.body) : null;
    const highlightTotal =
      highlights.check.status === "supported" ? highlightEntries(highlights.body).length : null;
    const offersMetrics = offerMetrics(offersBody);
    const reviewsMetrics = reviewMetrics(reviewsBody);
    const statuses: DimensionCoverageResult["statuses"] = {
      category: category.check.status,
      trends: trends.check.status,
      highlights: highlights.check.status,
      userProductResolution: userProductStatus,
      offers: offersStatus,
      reviews: reviewsStatus,
    };
    const metrics: DimensionCoverageResult["metrics"] = {
      trendCount: trendTotal,
      highlightCount: highlightTotal,
      highlightTypes: highlightTypeCounts(highlights.body),
      ...offersMetrics,
      ...reviewsMetrics,
    };

    dimensions.push({
      categoryId: seed.categoryId,
      expectedName: seed.expectedName,
      actualName: asString(categoryRecord.name),
      rationale: seed.rationale,
      portfolioPriority: seed.portfolioPriority,
      pathFromRoot: categoryPath(category.body),
      isLeaf:
        category.check.status === "supported"
          ? asArray(categoryRecord.children_categories).length === 0
          : null,
      readiness: classifyDimensionReadiness(statuses),
      coverageScore: calculateCoverageScore(statuses),
      reasons: readinessReasons(statuses, metrics),
      selectedProductId,
      selectedItemId,
      metrics,
      statuses,
      checks,
    });

    await pauseBetweenDimensions();
  }

  const recommendedPortfolio = dimensions
    .filter((dimension) => dimension.readiness === "radar_ready")
    .sort(
      (left, right) =>
        right.coverageScore - left.coverageScore ||
        left.portfolioPriority - right.portfolioPriority,
    )
    .slice(0, 5)
    .map((dimension) => ({
      categoryId: dimension.categoryId,
      name: dimension.actualName ?? dimension.expectedName,
      coverageScore: dimension.coverageScore,
      rationale: dimension.rationale,
      portfolioPriority: dimension.portfolioPriority,
    }));
  const allChecks = dimensions.flatMap((dimension) => dimension.checks);
  const finishedAt = new Date();
  const radarReady = dimensions.filter(
    (dimension) => dimension.readiness === "radar_ready",
  ).length;
  const discoveryOnly = dimensions.filter(
    (dimension) => dimension.readiness === "discovery_only",
  ).length;
  const unsupported = dimensions.filter(
    (dimension) => dimension.readiness === "unsupported",
  ).length;

  return {
    schemaVersion: 1,
    marketplace: "mercado_livre",
    source: "official_api",
    siteId: SITE_ID,
    status: radarReady >= 5 ? "success" : radarReady > 0 ? "partial" : "failed",
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    summary: {
      tested: dimensions.length,
      radarReady,
      discoveryOnly,
      unsupported,
      rateLimitedChecks: allChecks.filter((check) => check.status === "rate_limited").length,
      failedChecks: allChecks.filter((check) => check.status === "failed").length,
    },
    recommendedPortfolio,
    authentication: authentication.check,
    dimensions,
    notes: [
      "O score mede cobertura técnica da API; não é score de oportunidade de produto.",
      "Uma dimensão radar_ready possui trends, highlights e ofertas de catálogo confirmados.",
      "Reviews aumentam a cobertura, mas sua ausência não elimina uma dimensão do radar.",
      "Preços, ofertas, sellers e reviews são da amostra do primeiro PRODUCT resolvido no ranking, não agregados da categoria inteira.",
      "Empates de cobertura são ordenados pela prioridade de portfólio explícita nas sementes.",
      "Nenhum sold_quantity de anúncio de terceiro é coletado ou utilizado.",
    ],
  };
}
