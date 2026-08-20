import type {
  MercadoLivreCapabilityCheck,
  MercadoLivreCapabilityProbeContext,
  MercadoLivreCapabilityProbeOptions,
  MercadoLivreCapabilityProbeReport,
  MercadoLivreCapabilityStatus,
} from "./capability-types";
import {
  executeCapabilityCheck as executeCheck,
  skippedCapabilityCheck as skippedCheck,
  type ExecutedCapabilityCheck as ExecutedCheck,
} from "./capability-request";

const SITE_ID = "MLB" as const;
const MAX_CATEGORY_DEPTH = 6;
const DEFAULT_FALLBACK_QUERY = "suporte controle ps5";

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

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function summarizeAuthentication(body: unknown): Record<string, unknown> {
  const record = asRecord(body);
  return {
    authenticated: true,
    siteId: asString(record.site_id),
  };
}

function categoryEntries(body: unknown): Array<{ id: string; name: string }> {
  return asArray(body)
    .map((entry) => {
      const record = asRecord(entry);
      const id = asId(record.id);
      const name = asString(record.name);
      return id && name ? { id, name } : null;
    })
    .filter((entry): entry is { id: string; name: string } => entry !== null);
}

function childCategoryEntries(body: unknown): Array<{ id: string; name: string }> {
  return categoryEntries(asRecord(body).children_categories);
}

function summarizeCategories(body: unknown): Record<string, unknown> {
  const categories = categoryEntries(body);
  return {
    count: categories.length,
    sample: categories.slice(0, 10),
  };
}

function summarizeCategory(body: unknown): Record<string, unknown> {
  const record = asRecord(body);
  const children = childCategoryEntries(body);
  const pathFromRoot = asArray(record.path_from_root)
    .map((entry) => {
      const pathEntry = asRecord(entry);
      const id = asId(pathEntry.id);
      const name = asString(pathEntry.name);
      return id && name ? { id, name } : null;
    })
    .filter((entry): entry is { id: string; name: string } => entry !== null);

  return {
    id: asId(record.id),
    name: asString(record.name),
    childrenCount: children.length,
    isLeaf: children.length === 0,
    pathFromRoot,
  };
}

function trendKeywords(body: unknown): string[] {
  return asArray(body)
    .map((entry) => asString(asRecord(entry).keyword))
    .filter((keyword): keyword is string => keyword !== null);
}

function summarizeTrends(body: unknown): Record<string, unknown> {
  const keywords = trendKeywords(body);
  return {
    count: keywords.length,
    keywords: keywords.slice(0, 10),
  };
}

interface HighlightEntry {
  id: string;
  position: number | null;
  type: "ITEM" | "PRODUCT" | "USER_PRODUCT" | string;
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

function summarizeHighlights(body: unknown): Record<string, unknown> {
  const entries = highlightEntries(body);
  const types = entries.reduce<Record<string, number>>((counts, entry) => {
    counts[entry.type] = (counts[entry.type] ?? 0) + 1;
    return counts;
  }, {});

  return {
    count: entries.length,
    types,
    sample: entries.slice(0, 10),
  };
}

function productSearchEntries(
  body: unknown,
): Array<{ id: string; name: string | null; domainId: string | null }> {
  return asArray(asRecord(body).results)
    .map((entry) => {
      const record = asRecord(entry);
      const id = asId(record.id);
      if (!id) return null;
      return {
        id,
        name: asString(record.name),
        domainId: asString(record.domain_id),
      };
    })
    .filter(
      (
        entry,
      ): entry is { id: string; name: string | null; domainId: string | null } =>
        entry !== null,
    );
}

function summarizeProductSearch(body: unknown): Record<string, unknown> {
  const record = asRecord(body);
  const paging = asRecord(record.paging);
  const products = productSearchEntries(body);
  return {
    total: asNumber(paging.total),
    returned: products.length,
    products: products.slice(0, 3),
  };
}

function summarizeProduct(body: unknown): Record<string, unknown> {
  const record = asRecord(body);
  return {
    id: asId(record.id),
    name: asString(record.name),
    status: asString(record.status),
    domainId: asString(record.domain_id),
    attributesCount: asArray(record.attributes).length,
    picturesCount: asArray(record.pictures).length,
  };
}

function summarizeUserProduct(body: unknown): Record<string, unknown> {
  const record = asRecord(body);
  return {
    id: asId(record.id),
    name: asString(record.name),
    domainId: asString(record.domain_id),
    familyId: asId(record.family_id),
    attributesCount: asArray(record.attributes).length,
  };
}

function itemIdsFromSearch(body: unknown): string[] {
  return asArray(asRecord(body).results)
    .map((entry) => {
      if (typeof entry === "string") return entry;
      return asId(asRecord(entry).item_id) ?? asId(asRecord(entry).id);
    })
    .filter((id): id is string => id !== null);
}

function summarizeItemSearch(body: unknown): Record<string, unknown> {
  const record = asRecord(body);
  const paging = asRecord(record.paging);
  const itemIds = itemIdsFromSearch(body);
  return {
    total: asNumber(paging.total),
    returned: itemIds.length,
    itemIds: itemIds.slice(0, 10),
  };
}

function productOfferEntries(body: unknown): JsonRecord[] {
  return asArray(asRecord(body).results).map(asRecord);
}

function summarizeProductOffers(body: unknown): Record<string, unknown> {
  const record = asRecord(body);
  const paging = asRecord(record.paging);
  const offers = productOfferEntries(body);
  return {
    total: asNumber(paging.total),
    returned: offers.length,
    offers: offers.slice(0, 10).map((offer) => ({
      itemId: asId(offer.item_id),
      sellerId: asId(offer.seller_id),
      price: asNumber(offer.price),
      currencyId: asString(offer.currency_id),
      listingTypeId: asString(offer.listing_type_id),
      condition: asString(offer.condition),
    })),
  };
}

function summarizeItem(body: unknown): Record<string, unknown> {
  const record = asRecord(body);
  const shipping = asRecord(record.shipping);
  return {
    id: asId(record.id),
    title: asString(record.title),
    sellerId: asId(record.seller_id),
    categoryId: asId(record.category_id),
    catalogProductId: asId(record.catalog_product_id),
    userProductId: asId(record.user_product_id),
    price: asNumber(record.price),
    originalPrice: asNumber(record.original_price),
    currencyId: asString(record.currency_id),
    permalink: asString(record.permalink),
    freeShipping: typeof shipping.free_shipping === "boolean" ? shipping.free_shipping : null,
    logisticType: asString(shipping.logistic_type),
    soldQuantityUsed: false,
  };
}

function summarizeReviews(body: unknown): Record<string, unknown> {
  const record = asRecord(body);
  const paging = asRecord(record.paging);
  return {
    total: asNumber(paging.total) ?? asArray(record.reviews).length,
    ratingAverage: asNumber(record.rating_average),
    ratingLevels: isRecord(record.rating_levels) ? record.rating_levels : null,
    reviewTextsPersisted: false,
  };
}

function summarizeSellerReputation(body: unknown): Record<string, unknown> {
  const reputation = asRecord(asRecord(body).seller_reputation);
  const transactions = asRecord(reputation.transactions);
  return {
    levelId: asString(reputation.level_id),
    powerSellerStatus: asString(reputation.power_seller_status),
    transactions: {
      period: asString(transactions.period),
      total: asNumber(transactions.total),
      completed: asNumber(transactions.completed),
    },
    scope: "seller_level_not_item_sales",
  };
}

function categoryPreferenceScore(name: string): number {
  const normalized = normalizeText(name);
  const preferences = [
    "organizacao",
    "decoracao",
    "casa",
    "cozinha",
    "escritorio",
    "banheiro",
    "jardim",
    "brinquedos",
    "acessorios",
  ];

  return preferences.reduce(
    (score, preference, index) =>
      normalized.includes(preference)
        ? Math.max(score, preferences.length - index)
        : score,
    0,
  );
}

function selectPreferredCategory(
  categories: Array<{ id: string; name: string }>,
): { id: string; name: string } | null {
  return (
    [...categories].sort((left, right) => {
      const scoreDifference =
        categoryPreferenceScore(right.name) - categoryPreferenceScore(left.name);
      return scoreDifference || left.name.localeCompare(right.name, "pt-BR");
    })[0] ?? null
  );
}

function itemSellerId(body: unknown): string | null {
  return asId(asRecord(body).seller_id);
}

function itemCatalogProductId(body: unknown): string | null {
  return asId(asRecord(body).catalog_product_id);
}

function buildSummary(checks: MercadoLivreCapabilityCheck[]) {
  const count = (status: MercadoLivreCapabilityStatus) =>
    checks.filter((check) => check.status === status).length;

  return {
    total: checks.length,
    supported: count("supported"),
    unauthorized: count("unauthorized"),
    forbidden: count("forbidden"),
    unavailable: count("unavailable"),
    rateLimited: count("rate_limited"),
    failed: count("failed"),
    skipped: count("skipped"),
  };
}

function checkStatus(
  checks: MercadoLivreCapabilityCheck[],
  ...ids: string[]
): MercadoLivreCapabilityStatus {
  for (const id of ids) {
    const check = checks.find((candidate) => candidate.id === id);
    if (check && check.status !== "skipped") return check.status;
  }
  return "skipped";
}

function finishReport(
  startedAt: Date,
  checks: MercadoLivreCapabilityCheck[],
  context: MercadoLivreCapabilityProbeContext,
  notes: string[],
): MercadoLivreCapabilityProbeReport {
  const finishedAt = new Date();
  const summary = buildSummary(checks);
  const authentication = checkStatus(checks, "authentication");
  const hasCapabilityFailure =
    summary.unauthorized +
      summary.forbidden +
      summary.unavailable +
      summary.rateLimited +
      summary.failed +
      summary.skipped >
    0;

  return {
    schemaVersion: 1,
    marketplace: "mercado_livre",
    source: "official_api",
    siteId: SITE_ID,
    status:
      authentication !== "supported"
        ? "failed"
        : hasCapabilityFailure
          ? "partial"
          : "success",
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    context,
    summary,
    capabilities: {
      authentication,
      categories: checkStatus(checks, "categories"),
      categoryDetail: checkStatus(
        checks,
        "category_detail_6",
        "category_detail_5",
        "category_detail_4",
        "category_detail_3",
        "category_detail_2",
        "category_detail_1",
      ),
      nationalTrends: checkStatus(checks, "national_trends"),
      categoryTrends: checkStatus(checks, "category_trends"),
      highlights: checkStatus(checks, "highlights"),
      itemDetail: checkStatus(checks, "highlight_item_detail", "item_detail"),
      productDetail: checkStatus(
        checks,
        "highlight_product_detail",
        "product_detail",
      ),
      userProductDetail: checkStatus(checks, "highlight_user_product_detail"),
      userProductItems: checkStatus(checks, "user_product_items"),
      catalogSearch: checkStatus(checks, "catalog_search"),
      catalogOffers: checkStatus(checks, "catalog_offers"),
      reviews: checkStatus(checks, "reviews"),
      sellerReputation: checkStatus(checks, "seller_reputation"),
    },
    checks,
    notes,
  };
}

export async function probeMercadoLivreApiCapabilities(
  options: MercadoLivreCapabilityProbeOptions = {},
): Promise<MercadoLivreCapabilityProbeReport> {
  const startedAt = new Date();
  const checks: MercadoLivreCapabilityCheck[] = [];
  const notes = [
    "Todas as chamadas usam somente a API oficial e são executadas sequencialmente.",
    "sold_quantity não é coletado nem usado para anúncios de terceiros.",
    "Dados da conta autenticada e textos de avaliações não são persistidos.",
  ];
  const log = options.log ?? (() => undefined);
  const context: MercadoLivreCapabilityProbeContext = {
    requestedCategoryId: options.categoryId ?? null,
    selectedCategoryId: null,
    selectedCategoryName: null,
    selectedCategoryIsLeaf: null,
    categoryPath: [],
    selectedQuery: null,
    querySource: null,
    selectedProductId: null,
    selectedItemId: null,
    selectedUserProductId: null,
  };

  log("[meli-api-probe] Validando autenticação.");
  const authentication = await executeCheck(
    "authentication",
    "/users/me",
    summarizeAuthentication,
  );
  checks.push(authentication.check);

  if (authentication.check.status !== "supported") {
    notes.push("O probe foi interrompido porque a autenticação não está válida.");
    return finishReport(startedAt, checks, context, notes);
  }

  log("[meli-api-probe] Consultando categorias MLB.");
  const categories = await executeCheck(
    "categories",
    `/sites/${SITE_ID}/categories`,
    summarizeCategories,
  );
  checks.push(categories.check);

  const roots = categoryEntries(categories.body);
  let currentCategory = options.categoryId
    ? { id: options.categoryId, name: options.categoryId }
    : selectPreferredCategory(roots);

  for (let depth = 1; currentCategory && depth <= MAX_CATEGORY_DEPTH; depth += 1) {
    log(`[meli-api-probe] Inspecionando categoria ${currentCategory.id}.`);
    const category = await executeCheck(
      `category_detail_${depth}`,
      `/categories/${encodeURIComponent(currentCategory.id)}`,
      summarizeCategory,
    );
    checks.push(category.check);
    if (category.check.status !== "supported") break;

    const categoryRecord = asRecord(category.body);
    const categoryId = asId(categoryRecord.id) ?? currentCategory.id;
    const categoryName = asString(categoryRecord.name) ?? currentCategory.name;
    const children = childCategoryEntries(category.body);

    context.selectedCategoryId = categoryId;
    context.selectedCategoryName = categoryName;
    context.selectedCategoryIsLeaf = children.length === 0;
    context.categoryPath = asArray(categoryRecord.path_from_root)
      .map((entry) => {
        const record = asRecord(entry);
        const id = asId(record.id);
        const name = asString(record.name);
        return id && name ? { id, name } : null;
      })
      .filter((entry): entry is { id: string; name: string } => entry !== null);

    if (children.length === 0 || options.categoryId) break;
    currentCategory = selectPreferredCategory(children);
  }

  log("[meli-api-probe] Consultando tendências nacionais.");
  const nationalTrends = await executeCheck(
    "national_trends",
    `/trends/${SITE_ID}`,
    summarizeTrends,
  );
  checks.push(nationalTrends.check);

  let categoryTrends: ExecutedCheck | null = null;
  let highlights: ExecutedCheck | null = null;

  if (context.selectedCategoryId) {
    const categoryId = encodeURIComponent(context.selectedCategoryId);
    log("[meli-api-probe] Consultando tendências da categoria selecionada.");
    categoryTrends = await executeCheck(
      "category_trends",
      `/trends/${SITE_ID}/${categoryId}`,
      summarizeTrends,
    );
    checks.push(categoryTrends.check);

    log("[meli-api-probe] Consultando mais vendidos da categoria selecionada.");
    highlights = await executeCheck(
      "highlights",
      `/highlights/${SITE_ID}/category/${categoryId}`,
      summarizeHighlights,
    );
    checks.push(highlights.check);
  } else {
    checks.push(
      skippedCheck(
        "category_trends",
        `/trends/${SITE_ID}/{category_id}`,
        "Nenhuma categoria válida foi selecionada.",
      ),
      skippedCheck(
        "highlights",
        `/highlights/${SITE_ID}/category/{category_id}`,
        "Nenhuma categoria válida foi selecionada.",
      ),
    );
  }

  const categoryKeywords = trendKeywords(categoryTrends?.body);
  const nationalKeywords = trendKeywords(nationalTrends.body);
  if (categoryKeywords[0]) {
    context.selectedQuery = categoryKeywords[0];
    context.querySource = "category_trends";
  } else if (nationalKeywords[0]) {
    context.selectedQuery = nationalKeywords[0];
    context.querySource = "national_trends";
  } else {
    context.selectedQuery = options.fallbackQuery ?? DEFAULT_FALLBACK_QUERY;
    context.querySource = "fallback";
  }

  const rankedEntries = highlightEntries(highlights?.body);
  let itemBody: unknown = null;
  let productBody: unknown = null;
  let userProductBody: unknown = null;

  const highlightedItem = rankedEntries.find((entry) => entry.type === "ITEM");
  if (highlightedItem) {
    context.selectedItemId = highlightedItem.id;
    const result = await executeCheck(
      "highlight_item_detail",
      `/items/${encodeURIComponent(highlightedItem.id)}`,
      summarizeItem,
    );
    checks.push(result.check);
    itemBody = result.body;
  } else {
    checks.push(
      skippedCheck(
        "highlight_item_detail",
        "/items/{item_id}",
        "O ranking não retornou entidade do tipo ITEM.",
      ),
    );
  }

  const highlightedProduct = rankedEntries.find((entry) => entry.type === "PRODUCT");
  if (highlightedProduct) {
    context.selectedProductId = highlightedProduct.id;
    const result = await executeCheck(
      "highlight_product_detail",
      `/products/${encodeURIComponent(highlightedProduct.id)}`,
      summarizeProduct,
    );
    checks.push(result.check);
    productBody = result.body;
  } else {
    checks.push(
      skippedCheck(
        "highlight_product_detail",
        "/products/{product_id}",
        "O ranking não retornou entidade do tipo PRODUCT.",
      ),
    );
  }

  const highlightedUserProduct = rankedEntries.find(
    (entry) => entry.type === "USER_PRODUCT",
  );
  if (highlightedUserProduct) {
    context.selectedUserProductId = highlightedUserProduct.id;
    const result = await executeCheck(
      "highlight_user_product_detail",
      `/user-products/${encodeURIComponent(highlightedUserProduct.id)}`,
      summarizeUserProduct,
    );
    checks.push(result.check);
    userProductBody = result.body;
  } else {
    checks.push(
      skippedCheck(
        "highlight_user_product_detail",
        "/user-products/{user_product_id}",
        "O ranking não retornou entidade do tipo USER_PRODUCT.",
      ),
    );
  }

  const userProductSellerId = asId(asRecord(userProductBody).user_id);
  if (context.selectedUserProductId && userProductSellerId) {
    const params = new URLSearchParams({
      user_product_id: context.selectedUserProductId,
      limit: "10",
    });
    const result = await executeCheck(
      "user_product_items",
      `/users/${encodeURIComponent(userProductSellerId)}/items/search?${params.toString()}`,
      summarizeItemSearch,
    );
    checks.push(result.check);
    context.selectedItemId ??= itemIdsFromSearch(result.body)[0] ?? null;
  } else {
    checks.push(
      skippedCheck(
        "user_product_items",
        "/users/{seller_id}/items/search?user_product_id={user_product_id}",
        "Não foi possível obter simultaneamente user_product_id e seller_id.",
      ),
    );
  }

  const searchParams = new URLSearchParams({
    status: "active",
    site_id: SITE_ID,
    q: context.selectedQuery,
    limit: "3",
  });
  log(`[meli-api-probe] Buscando no catálogo por “${context.selectedQuery}”.`);
  const catalogSearch = await executeCheck(
    "catalog_search",
    `/products/search?${searchParams.toString()}`,
    summarizeProductSearch,
  );
  checks.push(catalogSearch.check);

  context.selectedProductId ??=
    itemCatalogProductId(itemBody) ?? productSearchEntries(catalogSearch.body)[0]?.id ?? null;

  if (context.selectedProductId && !productBody) {
    const result = await executeCheck(
      "product_detail",
      `/products/${encodeURIComponent(context.selectedProductId)}`,
      summarizeProduct,
    );
    checks.push(result.check);
    productBody = result.body;
  } else if (!context.selectedProductId) {
    checks.push(
      skippedCheck(
        "product_detail",
        "/products/{product_id}",
        "Nenhum product_id foi descoberto.",
      ),
    );
  }

  let catalogOffers: ExecutedCheck | null = null;
  let offerSellerId: string | null = null;
  if (context.selectedProductId) {
    log("[meli-api-probe] Consultando ofertas concorrentes do produto.");
    catalogOffers = await executeCheck(
      "catalog_offers",
      `/products/${encodeURIComponent(context.selectedProductId)}/items`,
      summarizeProductOffers,
    );
    checks.push(catalogOffers.check);
    const firstOffer = productOfferEntries(catalogOffers.body)[0];
    context.selectedItemId ??= asId(firstOffer?.item_id);
    offerSellerId = asId(firstOffer?.seller_id);
  } else {
    checks.push(
      skippedCheck(
        "catalog_offers",
        "/products/{product_id}/items",
        "Nenhum product_id foi descoberto.",
      ),
    );
  }

  if (context.selectedItemId && !itemBody) {
    const result = await executeCheck(
      "item_detail",
      `/items/${encodeURIComponent(context.selectedItemId)}`,
      summarizeItem,
    );
    checks.push(result.check);
    itemBody = result.body;
  } else if (!context.selectedItemId) {
    checks.push(
      skippedCheck(
        "item_detail",
        "/items/{item_id}",
        "Nenhum item_id foi descoberto.",
      ),
    );
  }

  context.selectedProductId ??= itemCatalogProductId(itemBody);
  const sellerId = itemSellerId(itemBody) ?? offerSellerId;

  if (context.selectedItemId) {
    const reviewParams = new URLSearchParams();
    if (context.selectedProductId) {
      reviewParams.set("catalog_product_id", context.selectedProductId);
    }
    const query = reviewParams.size > 0 ? `?${reviewParams.toString()}` : "";
    const result = await executeCheck(
      "reviews",
      `/reviews/item/${encodeURIComponent(context.selectedItemId)}${query}`,
      summarizeReviews,
    );
    checks.push(result.check);
  } else {
    checks.push(
      skippedCheck(
        "reviews",
        "/reviews/item/{item_id}",
        "Nenhum item_id foi descoberto.",
      ),
    );
  }

  if (sellerId) {
    const result = await executeCheck(
      "seller_reputation",
      `/users/${encodeURIComponent(sellerId)}?attributes=id,seller_reputation`,
      summarizeSellerReputation,
    );
    checks.push(result.check);
  } else {
    checks.push(
      skippedCheck(
        "seller_reputation",
        "/users/{seller_id}?attributes=id,seller_reputation",
        "Nenhum seller_id foi descoberto.",
      ),
    );
  }

  return finishReport(startedAt, checks, context, notes);
}
