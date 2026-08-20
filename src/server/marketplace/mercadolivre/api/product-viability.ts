import type { MercadoLivreRadarReport, RadarCandidate } from "./radar-types";
import type {
  OperationalProfile,
  ProductViabilityAssessment,
  ProductViabilityCandidate,
  ProductViabilityPreview,
  ViabilityRuleResult,
} from "./product-viability-types";
import {
  EMPTY_RADAR_PREFERENCES,
  findTitleExclusion,
  type RadarPreferenceRules,
} from "./radar-preferences";

export const DEFAULT_OPERATIONAL_PROFILE: OperationalProfile = {
  maximumProductDimensionsMm: [400, 400, 400],
  compatibleMaterials: ["plastic", "metal", "wood"],
  maximumComponents: 4,
  maximumPurchasedParts: 3,
  bulkUnitThreshold: 8,
  minimumCommodityUnitPrice: 15,
};

const PRIORITIZED_PRODUCT_DOMAINS = new Map([
  ["MLB-REMOTE_CONTROL_HOLDERS", "Acessórios compactos e funcionais."],
  ["MLB-CELLPHONE_HOLDERS_AND_STANDS", "Acessórios compactos para dispositivos."],
  ["MLB-SOAP_HOLDERS", "Acessórios compactos para uso doméstico."],
  ["MLB-KITCHEN_CABINET_ORGANIZERS", "Organizadores funcionais."],
  ["MLB-FLATWARE_ORGANIZERS", "Organizadores funcionais."],
  ["MLB-SINK_ORGANIZERS_AND_KITCHEN_SPONGE_HOLDERS", "Acessórios domésticos compactos."],
]);

const EXCLUDED_DOMAINS = new Map([
  ["MLB-MOBILE_DEVICE_CHARGERS", "Produto eletrônico fora do portfólio de acessórios passivos."],
  ["MLB-DOG_POTTY_PADS", "Produto consumível."],
  ["MLB-NON_PRESCRIPTION_PET_ANTIPARASITICS", "Produto regulado."],
  ["MLB-SCHOOL_AND_OFFICE_PAPERS", "Produto de papel consumível."],
  ["MLB-COLLECTIBLE_ALBUM_STICKERS", "Colecionável com restrição de propriedade intelectual."],
]);

const SAFETY_CRITICAL_DOMAINS = new Map([
  ["MLB-KICK_SCOOTERS", "Produto estrutural sujeito a carga e requisitos de segurança."],
]);

const EXCLUDED_TITLE_PATTERNS = [/\bsacos?\b/, /\bvacuum\s+bags?\b/];
const LICENSED_IDENTITY_TERMS = ["copa do mundo", "disney", "fifa", "harry potter", "marvel", "minecraft", "naruto", "pokemon", "star wars", "world cup"];
const MATERIAL_ATTRIBUTE_IDS = ["MATERIAL", "STRUCTURE_MATERIAL", "HOOK_MATERIALS", "SCOOTER_MATERIALS", "DECK_MATERIAL"];
const DIMENSION_ATTRIBUTE_IDS = { LENGTH: "length", WIDTH: "width", DEPTH: "depth", HEIGHT: "height" } as const;

type DimensionName = (typeof DIMENSION_ATTRIBUTE_IDS)[keyof typeof DIMENSION_ATTRIBUTE_IDS];

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parsePositiveNumber(value: string | null | undefined): number | null {
  const match = value?.replace(",", ".").match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function attributeMap(candidate: RadarCandidate): Map<string, string> {
  return new Map(candidate.keyAttributes.filter((attribute) => attribute.value).map((attribute) => [attribute.id, attribute.value as string]));
}

function normalizedUnitCount(candidate: RadarCandidate, attributes: Map<string, string>): number {
  const structuredCounts = ["UNITS_PER_PACK", "UNITS_PER_PACKAGE"].map((id) => parsePositiveNumber(attributes.get(id))).filter((value): value is number => value !== null);
  const titleMatch = normalizeText(candidate.name).match(/\bkit\s+(?:com\s+)?(\d{1,4})\b/) ?? normalizeText(candidate.name).match(/\b(\d{1,4})\s+(?:unidades?|un)\b/);
  return Math.max(titleMatch ? Number(titleMatch[1]) : 1, ...structuredCounts, 1);
}

function measurementInMillimeters(value: string | undefined): number | null {
  const match = value?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(mm|cm|m)\b/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  return match[2] === "m" ? amount * 1_000 : match[2] === "cm" ? amount * 10 : amount;
}

function extractDimensions(attributes: Map<string, string>): Record<DimensionName, number | null> {
  const dimensions: Record<DimensionName, number | null> = { length: null, width: null, depth: null, height: null };
  for (const [attributeId, dimensionName] of Object.entries(DIMENSION_ATTRIBUTE_IDS) as Array<[keyof typeof DIMENSION_ATTRIBUTE_IDS, DimensionName]>) {
    dimensions[dimensionName] = measurementInMillimeters(attributes.get(attributeId));
  }
  return dimensions;
}

function fitsOperationalProfile(dimensions: Record<DimensionName, number | null>, maximumDimensions: [number, number, number]): boolean | null {
  const known = Object.values(dimensions).filter((value): value is number => value !== null);
  if (!known.length) return null;
  if (known.some((value) => value > Math.max(...maximumDimensions))) return false;
  if (known.length < 3) return null;
  return [...known].sort((left, right) => right - left).slice(0, 3).every((value, index) => value <= [...maximumDimensions].sort((left, right) => right - left)[index]);
}

function rule(code: string, reason: string, evidence?: ViabilityRuleResult["evidence"]): ViabilityRuleResult {
  return { code, reason, ...(evidence ? { evidence } : {}) };
}

function observedMaterials(attributes: Map<string, string>): string[] {
  return [...new Set(MATERIAL_ATTRIBUTE_IDS.map((id) => attributes.get(id)).filter((value): value is string => Boolean(value)))];
}

export function assessProductViability(
  candidate: RadarCandidate,
  profile: OperationalProfile = DEFAULT_OPERATIONAL_PROFILE,
  preferences: RadarPreferenceRules = EMPTY_RADAR_PREFERENCES,
): ProductViabilityAssessment {
  const passedRules: ViabilityRuleResult[] = [];
  const failedRules: ViabilityRuleResult[] = [];
  const warnings: ViabilityRuleResult[] = [];
  const reviewBlockers = new Set<string>();
  const attributes = attributeMap(candidate);
  const unitCount = normalizedUnitCount(candidate, attributes);
  const medianPricePerUnit = candidate.pricing.medianPrice === null ? null : Math.round((candidate.pricing.medianPrice / unitCount) * 100) / 100;
  const dimensions = extractDimensions(attributes);
  const profileFit = fitsOperationalProfile(dimensions, profile.maximumProductDimensionsMm);
  const materials = observedMaterials(attributes);
  const normalizedName = normalizeText(candidate.name);
  let excluded = false;
  let prioritized = false;

  const titleExclusion = findTitleExclusion(candidate.name, preferences.bannedTerms);
  const domainExclusion = candidate.domainId ? EXCLUDED_DOMAINS.get(candidate.domainId) : null;
  const safetyReason = candidate.domainId ? SAFETY_CRITICAL_DOMAINS.get(candidate.domainId) : null;
  const priorityReason = candidate.domainId ? PRIORITIZED_PRODUCT_DOMAINS.get(candidate.domainId) : null;
  if (titleExclusion) {
    failedRules.push(rule(titleExclusion.code, titleExclusion.reason, titleExclusion.matchedTerm ? { matchedTerm: titleExclusion.matchedTerm } : undefined));
    excluded = true;
  } else if (domainExclusion || EXCLUDED_TITLE_PATTERNS.some((pattern) => pattern.test(normalizedName))) {
    failedRules.push(rule("excluded_product_type", domainExclusion ?? "Produto consumível ou fora do escopo operacional.", { domainId: candidate.domainId }));
    excluded = true;
  } else if (safetyReason) {
    warnings.push(rule("safety_critical_product", safetyReason, { domainId: candidate.domainId }));
    reviewBlockers.add("safety_review");
  } else if (priorityReason) {
    passedRules.push(rule("prioritized_product_domain", priorityReason, { domainId: candidate.domainId }));
    prioritized = true;
  } else {
    warnings.push(rule("domain_not_yet_classified", "A categoria exige revisão antes de ser priorizada.", { domainId: candidate.domainId }));
    reviewBlockers.add("domain_not_yet_classified");
  }

  const portfolioCategory = candidate.sources.find((source) => preferences.preferredCategoryIds.includes(source.categoryId));
  if (!excluded && portfolioCategory) {
    prioritized = true;
    reviewBlockers.delete("domain_not_yet_classified");
    passedRules.push(rule("portfolio_category_fit", "O produto pertence a uma categoria aprovada para descoberta.", { categoryId: portfolioCategory.categoryId }));
  }

  const licensedTerm = LICENSED_IDENTITY_TERMS.find((term) => normalizedName.includes(normalizeText(term)));
  if (licensedTerm) {
    warnings.push(rule("licensed_identity_notice", "O título contém uma identidade conhecida e exige análise de propriedade intelectual.", { matchedTerm: licensedTerm }));
    reviewBlockers.add("ip_review");
  }
  if (unitCount >= profile.bulkUnitThreshold) {
    failedRules.push(rule("bulk_commodity_economics", "Kit volumoso com pouca aderência à operação unitária ou de pequenos lotes.", { unitCount, medianPricePerUnit }));
    excluded = true;
  } else if (medianPricePerUnit === null) {
    warnings.push(rule("pricing_unavailable", "Preço mediano por unidade indisponível."));
  } else if (medianPricePerUnit < profile.minimumCommodityUnitPrice) {
    warnings.push(rule("low_unit_price", "O preço por unidade pode limitar a margem operacional.", { medianPricePerUnit }));
  } else {
    passedRules.push(rule("unit_price_above_initial_floor", "O preço unitário supera o piso inicial configurado.", { medianPricePerUnit }));
  }
  if (profileFit === false) {
    warnings.push(rule("oversize_review", "As dimensões excedem o perfil operacional configurado.", { maximumProductDimensionsMm: profile.maximumProductDimensionsMm.join("x") }));
    reviewBlockers.add("product_dimensions");
  } else if (profileFit === null) {
    warnings.push(rule("dimensions_incomplete", "As dimensões não permitem confirmar o enquadramento operacional."));
  } else {
    passedRules.push(rule("fits_operational_profile", "As dimensões conhecidas atendem ao perfil operacional."));
  }
  if (!materials.length) warnings.push(rule("material_unavailable", "Material principal não informado."));
  if (candidate.listingUrl === null && candidate.catalogUrl === null) warnings.push(rule("insufficient_actionable_market_data", "Sem página pública acionável; mantido para diagnóstico de cobertura."));

  const status = excluded
    ? "not_viable_for_portfolio"
    : candidate.listingUrl === null && candidate.catalogUrl === null
      ? "insufficient_market_data"
      : reviewBlockers.size > 0
        ? "manual_viability_review"
        : prioritized
          ? "ready_for_manual_validation"
          : "manual_viability_review";
  return {
    ruleVersion: "product-viability-v1",
    status,
    passedRules,
    failedRules,
    warnings,
    normalizedUnitCount: unitCount,
    medianPricePerUnit,
    dimensionsMm: dimensions,
    fitsOperationalProfile: profileFit,
    observedMaterials: materials,
    manualChecksRequired: status === "manual_viability_review" ? [...reviewBlockers] : [],
  };
}

function previewCandidate(candidate: RadarCandidate, profile: OperationalProfile, preferences: RadarPreferenceRules): ProductViabilityCandidate {
  return {
    radarRank: candidate.radarRank,
    candidateId: candidate.candidateId,
    name: candidate.name,
    domainId: candidate.domainId,
    brand: candidate.brand,
    catalogUrl: candidate.catalogUrl,
    marketSignals: { researchPriorityScore: candidate.scores.researchPriorityScore, priorityLabel: candidate.priorityLabel, medianPrice: candidate.pricing.medianPrice, reviewCount: candidate.reviews.count, ratingAverage: candidate.reviews.ratingAverage, uniqueSellerCount: candidate.pricing.uniqueSellerCount },
    productViability: assessProductViability(candidate, profile, preferences),
  };
}

export function buildProductViabilityPreview(report: MercadoLivreRadarReport, profile: OperationalProfile = DEFAULT_OPERATIONAL_PROFILE, preferences: RadarPreferenceRules = EMPTY_RADAR_PREFERENCES): ProductViabilityPreview {
  const candidates = report.candidates.map((candidate) => previewCandidate(candidate, profile, preferences));
  return {
    schemaVersion: 1,
    ruleVersion: "product-viability-v1",
    marketplace: "mercado_livre",
    source: "official_api_radar",
    generatedAt: new Date().toISOString(),
    sourceRadarStartedAt: report.startedAt,
    sourceRadarFinishedAt: report.finishedAt,
    operationalProfile: profile,
    summary: {
      totalCandidates: candidates.length,
      readyForManualValidation: candidates.filter((candidate) => candidate.productViability.status === "ready_for_manual_validation").length,
      manualViabilityReview: candidates.filter((candidate) => candidate.productViability.status === "manual_viability_review").length,
      notViableForPortfolio: candidates.filter((candidate) => candidate.productViability.status === "not_viable_for_portfolio").length,
      insufficientMarketData: candidates.filter((candidate) => candidate.productViability.status === "insufficient_market_data").length,
      ipOrSafetyReview: candidates.filter((candidate) => candidate.productViability.status === "ip_or_safety_review").length,
    },
    candidates,
    notes: [
      "A viabilidade operacional é independente do score de sinais de mercado.",
      "Candidatos acionáveis seguem para validação humana antes de qualquer decisão.",
      "Identidades conhecidas recebem aviso de propriedade intelectual.",
      "Candidatos descartados permanecem no relatório com códigos e evidências das regras aplicadas.",
    ],
  };
}
