import {
  executeCapabilityCheck,
  type ExecutedCapabilityCheck,
} from "./capability-request";
import type { MercadoLivreCapabilityCheck } from "./capability-types";
import {
  RADAR_DIMENSIONS,
  RADAR_HIGHLIGHT_LIMIT_PER_DIMENSION,
  RADAR_MAX_CANDIDATES_AFTER_DIVERSITY,
  RADAR_MAX_CANDIDATES_PER_DOMAIN,
} from "./radar-config";
import type { MercadoLivreDimensionSeed } from "./dimension-seeds";
import type {
  MercadoLivreRadarReport,
  RadarCandidate,
  RadarDimensionSnapshot,
  RadarScoreComponents,
  RadarScoreInput,
} from "./radar-types";
import {
  EMPTY_RADAR_PREFERENCES,
  findTitleExclusion,
  normalizeRadarText,
  type RadarPreferenceRules,
} from "./radar-preferences";

const SITE_ID = "MLB" as const;

type JsonRecord = Record<string, unknown>;

interface HighlightEntry {
  id: string;
  type: string;
  position: number;
}

export interface RadarBuildOptions {
  excludedCandidateIds?: ReadonlySet<string>;
  excludedCandidateNames?: ReadonlySet<string>;
  preferences?: RadarPreferenceRules;
}

interface TrendMatchResult {
  keywords: string[];
  strength: number;
}

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

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STOP_WORDS = new Set([
  "a",
  "as",
  "com",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "o",
  "os",
  "para",
  "por",
  "um",
  "uma",
]);

function tokens(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

export function matchTrendKeywords(
  candidateName: string,
  trendKeywords: string[],
): TrendMatchResult {
  const normalizedCandidate = normalizeText(candidateName);
  const candidateTokens = new Set(tokens(candidateName));
  const matches = trendKeywords
    .map((keyword) => {
      const normalizedKeyword = normalizeText(keyword);
      const keywordTokens = tokens(keyword);
      const exact =
        normalizedKeyword.length >= 4 &&
        normalizedCandidate.includes(normalizedKeyword);
      const matchedTokenCount = keywordTokens.filter((token) =>
        candidateTokens.has(token),
      ).length;
      const overlap =
        keywordTokens.length === 0
          ? 0
          : matchedTokenCount / keywordTokens.length;
      const hasEnoughEvidence =
        keywordTokens.length === 1 ? matchedTokenCount === 1 : matchedTokenCount >= 2;
      const strength = exact
        ? 1
        : hasEnoughEvidence && overlap >= 0.75
          ? 0.75
          : hasEnoughEvidence && overlap >= 0.5
            ? 0.5
            : 0;
      return { keyword, strength };
    })
    .filter((match) => match.strength > 0)
    .sort((left, right) => right.strength - left.strength || left.keyword.localeCompare(right.keyword));

  return {
    keywords: matches.slice(0, 5).map((match) => match.keyword),
    strength: matches[0]?.strength ?? 0,
  };
}

export function calculateRadarScore(input: RadarScoreInput): RadarScoreComponents {
  const position = Math.min(Math.max(input.highlightPosition, 1), 20);
  const highlightScore = Math.round(((21 - position) / 20) * 30);

  const reviewsScore =
    input.reviewCount === null
      ? 0
      : input.reviewCount >= 10_000
        ? 15
        : input.reviewCount >= 1_000
          ? 12
          : input.reviewCount >= 100
            ? 9
            : input.reviewCount >= 20
              ? 6
              : input.reviewCount > 0
                ? 3
                : 0;

  const ratingScore =
    input.ratingAverage === null
      ? 0
      : input.ratingAverage >= 4.8
        ? 10
        : input.ratingAverage >= 4.5
          ? 8
          : input.ratingAverage >= 4
            ? 5
            : input.ratingAverage > 0
              ? 2
              : 0;

  const trendScore =
    input.trendMatchStrength >= 1
      ? 15
      : input.trendMatchStrength >= 0.75
        ? 11
        : input.trendMatchStrength >= 0.5
          ? 7
          : 0;

  const competitionScore =
    input.uniqueSellerCount === null
      ? 0
      : input.uniqueSellerCount <= 3
        ? 15
        : input.uniqueSellerCount <= 10
          ? 12
          : input.uniqueSellerCount <= 25
            ? 8
            : input.uniqueSellerCount <= 50
              ? 4
              : 2;

  const priceScore =
    input.medianPrice === null
      ? 0
      : input.medianPrice >= 40 && input.medianPrice <= 250
        ? 15
        : input.medianPrice >= 25 && input.medianPrice <= 400
          ? 10
          : input.medianPrice < 25
            ? 2
            : 5;

  const riskPenalty = 0;
  const researchPriorityScore = Math.max(
    0,
    Math.min(
      100,
      highlightScore +
        reviewsScore +
        ratingScore +
        trendScore +
        competitionScore +
        priceScore -
        riskPenalty,
    ),
  );

  return {
    highlightScore,
    reviewsScore,
    ratingScore,
    trendScore,
    competitionScore,
    priceScore,
    riskPenalty,
    researchPriorityScore,
  };
}

function trendKeywords(body: unknown): string[] {
  return asArray(body)
    .map((entry) => asString(asRecord(entry).keyword))
    .filter((keyword): keyword is string => keyword !== null);
}

function highlightEntries(body: unknown): HighlightEntry[] {
  return asArray(asRecord(body).content)
    .map((entry) => {
      const record = asRecord(entry);
      const id = asId(record.id);
      const type = asString(record.type);
      const position = asNumber(record.position);
      if (!id || !type || position === null) return null;
      return { id, type, position };
    })
    .filter((entry): entry is HighlightEntry => entry !== null)
    .sort((left, right) => left.position - right.position);
}

export function selectHighlightsForEnrichment(
  entries: Array<{ id: string; type: string; position: number }>,
  excludedCandidateIds: ReadonlySet<string> = new Set(),
  limit = RADAR_HIGHLIGHT_LIMIT_PER_DIMENSION,
) {
  return entries
    .filter((entry) => !excludedCandidateIds.has(`${entry.type}:${entry.id}`))
    .slice(0, limit);
}

function attributeValue(attribute: JsonRecord): string | null {
  const direct = asString(attribute.value_name);
  if (direct) return direct;
  const firstValue = asRecord(asArray(attribute.values)[0]);
  return asString(firstValue.name) ?? asString(firstValue.value_name);
}

function keyAttributes(body: unknown) {
  const attributes = asArray(asRecord(body).attributes)
    .map((entry) => {
      const attribute = asRecord(entry);
      const id = asId(attribute.id);
      if (!id) return null;
      return {
        id,
        name: asString(attribute.name),
        value: attributeValue(attribute),
      };
    })
    .filter(
      (
        attribute,
      ): attribute is { id: string; name: string | null; value: string | null } =>
        attribute !== null,
    );
  const priorityIds = new Set(["UNITS_PER_PACK", "UNITS_PER_PACKAGE"]);
  return attributes
    .sort((left, right) =>
      Number(priorityIds.has(right.id)) - Number(priorityIds.has(left.id)),
    )
    .slice(0, 10);
}

function brandFromBody(body: unknown): string | null {
  return keyAttributes(body).find((attribute) => attribute.id === "BRAND")?.value ?? null;
}

function firstImageUrl(body: unknown): string | null {
  const picture = asRecord(asArray(asRecord(body).pictures)[0]);
  return asString(picture.secure_url) ?? asString(picture.url);
}

function summarizeAuthentication(body: unknown): Record<string, unknown> {
  return { authenticated: true, siteId: asString(asRecord(body).site_id) };
}

function summarizeTrends(body: unknown): Record<string, unknown> {
  const keywords = trendKeywords(body);
  return { count: keywords.length, keywords };
}

function summarizeHighlights(body: unknown): Record<string, unknown> {
  const entries = highlightEntries(body);
  return { count: entries.length, entities: entries };
}

function summarizeProduct(body: unknown): Record<string, unknown> {
  const record = asRecord(body);
  return {
    id: asId(record.id),
    name: asString(record.name),
    domainId: asString(record.domain_id),
    brand: brandFromBody(body),
    imageUrl: firstImageUrl(body),
    permalink: asString(record.permalink),
    attributesCount: asArray(record.attributes).length,
  };
}

function summarizeUserProduct(body: unknown): Record<string, unknown> {
  const record = asRecord(body);
  return {
    id: asId(record.id),
    name: asString(record.name),
    catalogProductId: asId(record.catalog_product_id),
    domainId: asString(record.domain_id),
    brand: brandFromBody(body),
    imageUrl: firstImageUrl(body),
    attributesCount: asArray(record.attributes).length,
  };
}

function offerEntries(body: unknown): JsonRecord[] {
  return asArray(asRecord(body).results).map(asRecord);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
  return Math.round(value * 100) / 100;
}

function pricingFromOffers(body: unknown): RadarCandidate["pricing"] {
  const record = asRecord(body);
  const paging = asRecord(record.paging);
  const offers = offerEntries(body);
  const prices = offers
    .map((offer) => asNumber(offer.price))
    .filter((price): price is number => price !== null);
  const sellers = new Set(
    offers.map((offer) => asId(offer.seller_id)).filter((id): id is string => id !== null),
  );

  return {
    offerCount: asNumber(paging.total) ?? (offers.length > 0 ? offers.length : null),
    uniqueSellerCount: offers.length > 0 ? sellers.size : null,
    minimumPrice: prices.length > 0 ? Math.min(...prices) : null,
    medianPrice: median(prices),
    maximumPrice: prices.length > 0 ? Math.max(...prices) : null,
    currencyId: offers.map((offer) => asString(offer.currency_id)).find(Boolean) ?? null,
  };
}

function summarizeOffers(body: unknown): Record<string, unknown> {
  const firstOffer = offerEntries(body)[0];
  return {
    ...pricingFromOffers(body),
    firstOffer: firstOffer
      ? {
          itemId: asId(firstOffer.item_id),
          sellerId: asId(firstOffer.seller_id),
          permalink: asString(firstOffer.permalink),
        }
      : null,
  };
}

function reviewsFromBody(body: unknown): RadarCandidate["reviews"] {
  const record = asRecord(body);
  const paging = asRecord(record.paging);
  return {
    count: asNumber(paging.total) ?? (Array.isArray(record.reviews) ? record.reviews.length : null),
    ratingAverage: asNumber(record.rating_average),
  };
}

function summarizeReviews(body: unknown): Record<string, unknown> {
  return { ...reviewsFromBody(body), reviewTextsPersisted: false };
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function annotateCandidate(
  candidate: Omit<
    RadarCandidate,
    "scores" | "priorityLabel" | "flags" | "reasons" | "radarRank"
  >,
  trendMatchStrength: number,
): RadarCandidate {
  const bestPosition = Math.min(...candidate.sources.map((source) => source.highlightPosition));
  const scores = calculateRadarScore({
    highlightPosition: bestPosition,
    reviewCount: candidate.reviews.count,
    ratingAverage: candidate.reviews.ratingAverage,
    trendMatchStrength,
    uniqueSellerCount: candidate.pricing.uniqueSellerCount,
    medianPrice: candidate.pricing.medianPrice,
  });
  const flags: string[] = [];
  const reasons = [`Posição ${bestPosition} em ranking oficial de mais vendidos.`];
  if (candidate.matchedTrends.length > 0) {
    reasons.push(`Correspondência determinística com tendência: ${candidate.matchedTrends[0]}.`);
  } else {
    flags.push("no_direct_trend_match");
    reasons.push("Sem correspondência textual direta com os termos em tendência da dimensão.");
  }

  if (candidate.reviews.count !== null) {
    reasons.push(
      `${candidate.reviews.count} opiniões públicas; média ${candidate.reviews.ratingAverage ?? "indisponível"}.`,
    );
  } else {
    flags.push("reviews_unavailable");
  }

  if (candidate.pricing.uniqueSellerCount !== null) {
    reasons.push(
      `${candidate.pricing.offerCount ?? "Quantidade desconhecida de"} ofertas e ${candidate.pricing.uniqueSellerCount} sellers na amostra do produto.`,
    );
    if (candidate.pricing.uniqueSellerCount > 50) flags.push("high_competition");
    if (candidate.pricing.uniqueSellerCount <= 3) flags.push("low_competition_sample");
  } else {
    flags.push("competition_data_unavailable");
  }

  if (candidate.pricing.medianPrice !== null) {
    reasons.push(`Preço mediano observado: ${candidate.pricing.medianPrice} ${candidate.pricing.currencyId ?? ""}.`);
    if (candidate.pricing.medianPrice < 25) flags.push("price_may_be_difficult_to_compete");
  }

  const priorityLabel =
    scores.researchPriorityScore >= 70
      ? "high_research_priority"
      : scores.researchPriorityScore >= 50
        ? "medium_research_priority"
        : "exploratory";

  return {
    ...candidate,
    radarRank: 0,
    scores,
    priorityLabel,
    flags: uniqueStrings(flags),
    reasons,
  };
}

function compareCandidates(left: RadarCandidate, right: RadarCandidate): number {
  const leftHasActionableMarketData =
    (left.listingUrl !== null || left.catalogUrl !== null) &&
    left.pricing.medianPrice !== null;
  const rightHasActionableMarketData =
    (right.listingUrl !== null || right.catalogUrl !== null) &&
    right.pricing.medianPrice !== null;

  return (
    Number(rightHasActionableMarketData) - Number(leftHasActionableMarketData) ||
    right.scores.researchPriorityScore - left.scores.researchPriorityScore ||
    Math.min(...left.sources.map((source) => source.highlightPosition)) -
      Math.min(...right.sources.map((source) => source.highlightPosition)) ||
    left.candidateId.localeCompare(right.candidateId)
  );
}

export function selectDiverseCandidates(
  candidates: RadarCandidate[],
  maximumPerDomain = RADAR_MAX_CANDIDATES_PER_DOMAIN,
  maximumTotal = RADAR_MAX_CANDIDATES_AFTER_DIVERSITY,
): RadarCandidate[] {
  const domainCounts = new Map<string, number>();
  const selected: RadarCandidate[] = [];

  for (const candidate of [...candidates].sort(compareCandidates)) {
    const domainKey = candidate.domainId ?? `unknown:${candidate.candidateId}`;
    const domainCount = domainCounts.get(domainKey) ?? 0;
    if (domainCount >= maximumPerDomain) continue;
    selected.push(candidate);
    domainCounts.set(domainKey, domainCount + 1);
    if (selected.length >= maximumTotal) break;
  }

  return selected;
}

function cachedCheck(
  cache: Map<string, Promise<ExecutedCapabilityCheck>>,
  key: string,
  factory: () => Promise<ExecutedCapabilityCheck>,
  checks: MercadoLivreCapabilityCheck[],
): Promise<ExecutedCapabilityCheck> {
  const cached = cache.get(key);
  if (cached) return cached;
  const request = factory().then((result) => {
    checks.push(result.check);
    return result;
  });
  cache.set(key, request);
  return request;
}

export async function buildMercadoLivreRadar(
  log: (message: string) => void = () => undefined,
  dimensionsToScan: MercadoLivreDimensionSeed[] = RADAR_DIMENSIONS,
  options: RadarBuildOptions = {},
): Promise<MercadoLivreRadarReport> {
  const startedAt = new Date();
  const checks: MercadoLivreCapabilityCheck[] = [];
  const dimensions: RadarDimensionSnapshot[] = [];
  const unresolvedEntities: MercadoLivreRadarReport["unresolvedEntities"] = [];
  const candidates = new Map<string, RadarCandidate>();
  const candidateTrendStrength = new Map<string, number>();
  const productCache = new Map<string, Promise<ExecutedCapabilityCheck>>();
  const userProductCache = new Map<string, Promise<ExecutedCapabilityCheck>>();
  const offersCache = new Map<string, Promise<ExecutedCapabilityCheck>>();
  const reviewsCache = new Map<string, Promise<ExecutedCapabilityCheck>>();
  const excludedCandidateIds = options.excludedCandidateIds ?? new Set<string>();
  const excludedCandidateNames =
    options.excludedCandidateNames ?? new Set<string>();
  const preferences = options.preferences ?? EMPTY_RADAR_PREFERENCES;
  let stoppedByRateLimit = false;

  const authentication = await executeCapabilityCheck(
    "radar_authentication",
    "/users/me",
    summarizeAuthentication,
  );
  checks.push(authentication.check);

  if (authentication.check.status !== "supported") {
    const finishedAt = new Date();
    return {
      schemaVersion: 1,
      scoreVersion: "research-priority-v2",
      marketplace: "mercado_livre",
      source: "official_api",
      siteId: SITE_ID,
      status: "failed",
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      configuration: {
        dimensionCount: dimensionsToScan.length,
        highlightLimitPerDimension: RADAR_HIGHLIGHT_LIMIT_PER_DIMENSION,
        maximumEntitiesBeforeDeduplication:
          dimensionsToScan.length * RADAR_HIGHLIGHT_LIMIT_PER_DIMENSION,
        maximumCandidatesPerDomain: RADAR_MAX_CANDIDATES_PER_DOMAIN,
        maximumCandidatesAfterDiversity: RADAR_MAX_CANDIDATES_AFTER_DIVERSITY,
        dimensionIds: dimensionsToScan.map((dimension) => dimension.categoryId),
      },
      summary: {
        dimensionsSupported: 0,
        trendKeywordsCollected: 0,
        highlightEntitiesCollected: 0,
        entitiesSelectedForEnrichment: 0,
        candidatesBeforeDiversity: 0,
        candidatesAfterDeduplication: 0,
        candidatesAfterDiversity: 0,
        unresolvedEntities: 0,
        highResearchPriority: 0,
        mediumResearchPriority: 0,
        exploratory: 0,
        failedChecks: 1,
        rateLimitedChecks: authentication.check.status === "rate_limited" ? 1 : 0,
      },
      dimensions: [],
      candidates: [],
      unresolvedEntities: [],
      checks,
      notes: ["Execução interrompida por autenticação inválida."],
    };
  }

  for (const dimension of dimensionsToScan) {
    if (stoppedByRateLimit) break;
    log(`[meli-radar] Coletando ${dimension.categoryId} (${dimension.expectedName}).`);
    const categoryId = encodeURIComponent(dimension.categoryId);
    const trends = await executeCapabilityCheck(
      `${dimension.categoryId}_radar_trends`,
      `/trends/${SITE_ID}/${categoryId}`,
      summarizeTrends,
    );
    checks.push(trends.check);
    if (trends.check.status === "rate_limited") {
      stoppedByRateLimit = true;
      break;
    }
    const highlights = await executeCapabilityCheck(
      `${dimension.categoryId}_radar_highlights`,
      `/highlights/${SITE_ID}/category/${categoryId}`,
      summarizeHighlights,
    );
    checks.push(highlights.check);
    if (highlights.check.status === "rate_limited") {
      stoppedByRateLimit = true;
      break;
    }

    const keywords = trendKeywords(trends.body);
    const entities = highlightEntries(highlights.body);
    const selected = selectHighlightsForEnrichment(entities, excludedCandidateIds);

    dimensions.push({
      categoryId: dimension.categoryId,
      categoryName: dimension.expectedName,
      portfolioPriority: dimension.portfolioPriority,
      rationale: dimension.rationale,
      trends: {
        status: trends.check.status,
        count: keywords.length,
        keywords,
      },
      highlights: {
        status: highlights.check.status,
        count: entities.length,
        entities,
        selectedForEnrichment: selected,
      },
    });

    for (const entity of selected) {
      if (entity.type === "ITEM") {
        unresolvedEntities.push({
          categoryId: dimension.categoryId,
          categoryName: dimension.expectedName,
          entityId: entity.id,
          entityType: entity.type,
          highlightPosition: entity.position,
          reason: "Detalhe público de item concorrente retornou 403 no capability probe.",
        });
        continue;
      }

      let catalogProductId: string | null = entity.type === "PRODUCT" ? entity.id : null;
      let userProductId: string | null = null;
      let userProductBody: unknown = null;

      if (entity.type === "USER_PRODUCT") {
        userProductId = entity.id;
        const userProduct = await cachedCheck(
          userProductCache,
          entity.id,
          () =>
            executeCapabilityCheck(
              `${entity.id}_radar_user_product`,
              `/user-products/${encodeURIComponent(entity.id)}`,
              summarizeUserProduct,
            ),
          checks,
        );
        userProductBody = userProduct.body;
        if (userProduct.check.status === "rate_limited") {
          stoppedByRateLimit = true;
          break;
        }
        catalogProductId = asId(asRecord(userProduct.body).catalog_product_id);
      }

      if (entity.type !== "PRODUCT" && entity.type !== "USER_PRODUCT") {
        unresolvedEntities.push({
          categoryId: dimension.categoryId,
          categoryName: dimension.expectedName,
          entityId: entity.id,
          entityType: entity.type,
          highlightPosition: entity.position,
          reason: "Tipo de entidade não suportado pelo Radar v1.",
        });
        continue;
      }

      let productBody: unknown = null;
      if (catalogProductId) {
        const product = await cachedCheck(
          productCache,
          catalogProductId,
          () =>
            executeCapabilityCheck(
              `${catalogProductId}_radar_product`,
              `/products/${encodeURIComponent(catalogProductId)}`,
              summarizeProduct,
            ),
          checks,
        );
        productBody = product.body;
        if (product.check.status === "rate_limited") {
          stoppedByRateLimit = true;
          break;
        }
      }

      const name =
        asString(asRecord(productBody).name) ??
        asString(asRecord(userProductBody).name);
      if (!name) {
        unresolvedEntities.push({
          categoryId: dimension.categoryId,
          categoryName: dimension.expectedName,
          entityId: entity.id,
          entityType: entity.type,
          highlightPosition: entity.position,
          reason: "Entidade não forneceu nome de produto utilizável.",
        });
        continue;
      }

      const normalizedName = normalizeRadarText(name);
      const titleExclusion = findTitleExclusion(
        name,
        preferences.bannedTerms,
      );
      if (titleExclusion) {
        unresolvedEntities.push({
          categoryId: dimension.categoryId,
          categoryName: dimension.expectedName,
          entityId: entity.id,
          entityType: entity.type,
          highlightPosition: entity.position,
          reason: `Produto ignorado pela regra ${titleExclusion.code}: ${titleExclusion.reason}`,
        });
        continue;
      }
      if (excludedCandidateNames.has(normalizedName)) {
        unresolvedEntities.push({
          categoryId: dimension.categoryId,
          categoryName: dimension.expectedName,
          entityId: entity.id,
          entityType: entity.type,
          highlightPosition: entity.position,
          reason: "Produto ignorado porque o mesmo título já apareceu em um radar anterior.",
        });
        continue;
      }

      let offersBody: unknown = null;
      if (catalogProductId) {
        const offers = await cachedCheck(
          offersCache,
          catalogProductId,
          () =>
            executeCapabilityCheck(
              `${catalogProductId}_radar_offers`,
              `/products/${encodeURIComponent(catalogProductId)}/items`,
              summarizeOffers,
            ),
          checks,
        );
        offersBody = offers.body;
        if (offers.check.status === "rate_limited") {
          stoppedByRateLimit = true;
          break;
        }
      }

      const firstOffer = offerEntries(offersBody)[0];
      const firstOfferItemId = asId(firstOffer?.item_id);
      let reviewsBody: unknown = null;
      if (firstOfferItemId && catalogProductId) {
        const reviewKey = `${firstOfferItemId}:${catalogProductId}`;
        const query = new URLSearchParams({ catalog_product_id: catalogProductId });
        const reviews = await cachedCheck(
          reviewsCache,
          reviewKey,
          () =>
            executeCapabilityCheck(
              `${catalogProductId}_radar_reviews`,
              `/reviews/item/${encodeURIComponent(firstOfferItemId)}?${query.toString()}`,
              summarizeReviews,
            ),
          checks,
        );
        reviewsBody = reviews.body;
        if (reviews.check.status === "rate_limited") {
          stoppedByRateLimit = true;
          break;
        }
      }

      const attributes =
        keyAttributes(productBody).length > 0
          ? keyAttributes(productBody)
          : keyAttributes(userProductBody);
      const brand = brandFromBody(productBody) ?? brandFromBody(userProductBody);
      const trendMatch = matchTrendKeywords(name, keywords);
      const pricing = pricingFromOffers(offersBody);
      const reviewSignals = reviewsFromBody(reviewsBody);
      const candidateId = catalogProductId
        ? `PRODUCT:${catalogProductId}`
        : `USER_PRODUCT:${userProductId ?? entity.id}`;
      if (excludedCandidateIds.has(candidateId)) continue;
      const source = {
        categoryId: dimension.categoryId,
        categoryName: dimension.expectedName,
        portfolioPriority: dimension.portfolioPriority,
        highlightPosition: entity.position,
        entityId: entity.id,
        entityType: entity.type,
      };
      const existing = candidates.get(candidateId);

      if (existing) {
        const sources = [...existing.sources, source].filter(
          (value, index, all) =>
            all.findIndex(
              (candidate) =>
                candidate.categoryId === value.categoryId &&
                candidate.entityId === value.entityId,
            ) === index,
        );
        const matchedTrends = uniqueStrings([
          ...existing.matchedTrends,
          ...trendMatch.keywords,
        ]).slice(0, 5);
        const strength = Math.max(
          candidateTrendStrength.get(candidateId) ?? 0,
          trendMatch.strength,
        );
        candidateTrendStrength.set(candidateId, strength);
        candidates.set(
          candidateId,
          annotateCandidate(
            {
              ...existing,
              sources,
              matchedTrends,
            },
            strength,
          ),
        );
        continue;
      }

      candidateTrendStrength.set(candidateId, trendMatch.strength);
      candidates.set(
        candidateId,
        annotateCandidate(
          {
            candidateId,
            entityType: entity.type,
            catalogProductId,
            userProductId,
            name,
            domainId:
              asString(asRecord(productBody).domain_id) ??
              asString(asRecord(userProductBody).domain_id),
            brand,
            imageUrl: firstImageUrl(productBody) ?? firstImageUrl(userProductBody),
            catalogUrl: catalogProductId
              ? `https://www.mercadolivre.com.br/p/${encodeURIComponent(catalogProductId)}`
              : null,
            listingUrl:
              asString(firstOffer?.permalink) ?? asString(asRecord(productBody).permalink),
            firstOfferItemId,
            sources: [source],
            matchedTrends: trendMatch.keywords,
            keyAttributes: attributes,
            pricing,
            reviews: reviewSignals,
          },
          trendMatch.strength,
        ),
      );
    }
  }

  const candidatesBeforeDiversity = [...candidates.values()].sort(compareCandidates);
  const sortedCandidates = selectDiverseCandidates(candidatesBeforeDiversity)
    .map((candidate, index) => ({ ...candidate, radarRank: index + 1 }));
  const finishedAt = new Date();
  const dimensionsSupported = dimensions.filter(
    (dimension) =>
      dimension.trends.status === "supported" &&
      dimension.highlights.status === "supported",
  ).length;
  const failedChecks = checks.filter((check) => check.status === "failed").length;
  const rateLimitedChecks = checks.filter((check) => check.status === "rate_limited").length;
  const status =
    dimensionsSupported === dimensionsToScan.length && sortedCandidates.length > 0
      ? "success"
      : sortedCandidates.length > 0
        ? "partial"
        : "failed";

  return {
    schemaVersion: 1,
    scoreVersion: "research-priority-v2",
    marketplace: "mercado_livre",
    source: "official_api",
    siteId: SITE_ID,
    status,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    configuration: {
      dimensionCount: dimensionsToScan.length,
      highlightLimitPerDimension: RADAR_HIGHLIGHT_LIMIT_PER_DIMENSION,
      maximumEntitiesBeforeDeduplication:
        dimensionsToScan.length * RADAR_HIGHLIGHT_LIMIT_PER_DIMENSION,
      maximumCandidatesPerDomain: RADAR_MAX_CANDIDATES_PER_DOMAIN,
      maximumCandidatesAfterDiversity: RADAR_MAX_CANDIDATES_AFTER_DIVERSITY,
      dimensionIds: dimensionsToScan.map((dimension) => dimension.categoryId),
    },
    summary: {
      dimensionsSupported,
      trendKeywordsCollected: dimensions.reduce(
        (total, dimension) => total + dimension.trends.count,
        0,
      ),
      highlightEntitiesCollected: dimensions.reduce(
        (total, dimension) => total + dimension.highlights.count,
        0,
      ),
      entitiesSelectedForEnrichment: dimensions.reduce(
        (total, dimension) =>
          total + dimension.highlights.selectedForEnrichment.length,
        0,
      ),
      candidatesBeforeDiversity: candidatesBeforeDiversity.length,
      candidatesAfterDeduplication: candidatesBeforeDiversity.length,
      candidatesAfterDiversity: sortedCandidates.length,
      unresolvedEntities: unresolvedEntities.length,
      highResearchPriority: sortedCandidates.filter(
        (candidate) => candidate.priorityLabel === "high_research_priority",
      ).length,
      mediumResearchPriority: sortedCandidates.filter(
        (candidate) => candidate.priorityLabel === "medium_research_priority",
      ).length,
      exploratory: sortedCandidates.filter(
        (candidate) => candidate.priorityLabel === "exploratory",
      ).length,
      failedChecks,
      rateLimitedChecks,
    },
    dimensions,
    candidates: sortedCandidates,
    unresolvedEntities,
    checks,
    notes: [
      "O researchPriorityScore organiza candidatos para pesquisa; não estima vendas nem garante oportunidade.",
      `Até ${RADAR_HIGHLIGHT_LIMIT_PER_DIMENSION} destaques oficiais são enriquecidos por categoria.`,
      `A diversidade limita cada domínio a ${RADAR_MAX_CANDIDATES_PER_DOMAIN} candidatos e a saída final a ${RADAR_MAX_CANDIDATES_AFTER_DIVERSITY} candidatos.`,
      ...(stoppedByRateLimit
        ? ["A coleta foi interrompida ao receber HTTP 429 da API oficial."]
        : []),
      "Preços, sellers e reviews pertencem ao produto de catálogo resolvido, não à categoria inteira.",
      "Marcas comuns não alteram a prioridade; identidades conhecidas são tratadas na triagem de viabilidade.",
      "O radar não executa ações fora das APIs oficiais do marketplace.",
      "sold_quantity de anúncios de terceiros não é coletado nem utilizado.",
    ],
  };
}
