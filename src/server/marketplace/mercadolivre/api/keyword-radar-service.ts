import type { PrismaClient } from "@/src/generated/prisma/client";
import { persistRadarHistory } from "@/src/server/history/radar-history";

import { executeCapabilityCheck } from "./capability-request";
import { type MercadoLivreDimensionSeed, MERCADO_LIVRE_DIMENSION_SEEDS } from "./dimension-seeds";
import { assessProductViability, buildProductViabilityPreview } from "./product-viability";
import { buildMercadoLivreRadar } from "./radar";
import type { MercadoLivreRadarReport, RadarCandidate } from "./radar-types";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function singular(token: string): string {
  return token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function keywordFallbackDimensions(keyword: string): MercadoLivreDimensionSeed[] {
  const text = normalize(keyword);
  const match = MERCADO_LIVRE_DIMENSION_SEEDS.filter((dimension) => {
    const description = normalize(`${dimension.expectedName} ${dimension.rationale}`);
    return text.split(" ").some((token) => token.length >= 4 && description.includes(token));
  });
  if (/\b(fidget|toy|brinquedo|brinquedos|antiestresse)\b/.test(text)) {
    const toys = MERCADO_LIVRE_DIMENSION_SEEDS.find((dimension) => dimension.categoryId === "MLB1132");
    if (toys && !match.some((dimension) => dimension.categoryId === toys.categoryId)) match.push(toys);
  }
  return match.length > 0
    ? match
    : MERCADO_LIVRE_DIMENSION_SEEDS.filter((dimension) => dimension.radarEnabled);
}

export async function dimensionsForOfficialKeywordRadar(keyword: string): Promise<MercadoLivreDimensionSeed[]> {
  const fallback = keywordFallbackDimensions(keyword);
  const params = new URLSearchParams({ q: keyword, limit: "3" });
  const discovery = await executeCapabilityCheck(
    "keyword_category_discovery",
    `/sites/MLB/domain_discovery/search?${params.toString()}`,
    (body) => ({ count: Array.isArray(body) ? body.length : 0 }),
  );
  const discovered = Array.isArray(discovery.body)
    ? discovery.body
      .map(asRecord)
      .map((entry) => ({
        categoryId: typeof entry.category_id === "string" ? entry.category_id : null,
        expectedName: typeof entry.category_name === "string" ? entry.category_name : "Categoria descoberta",
      }))
      .filter((entry): entry is { categoryId: string; expectedName: string } => entry.categoryId !== null)
    : [];
  const dimensions = discovered.map((entry, index) => ({
    categoryId: entry.categoryId,
    expectedName: entry.expectedName,
    rationale: `Categoria descoberta pela API oficial para “${keyword}”.`,
    portfolioPriority: index + 1,
    radarEnabled: true,
  }));
  return dimensions.length > 0 ? dimensions : fallback;
}

export function maximumUnitsFromNotes(notes: string | null | undefined): number | null {
  if (!notes) return null;
  const match = normalize(notes).match(/(?:no\s+)?maximo(?:\s+de)?\s+(\d{1,3})\s+unidades?/);
  if (!match) return null;
  const maximum = Number(match[1]);
  return Number.isInteger(maximum) && maximum >= 1 && maximum <= 100 ? maximum : null;
}

function matchesKeyword(candidate: RadarCandidate, keyword: string): boolean {
  const candidateText = normalize(candidate.name);
  const normalizedKeyword = normalize(keyword);
  if (candidateText.includes(normalizedKeyword)) return true;

  const candidateTokens = candidateText.split(" ").map(singular);
  return normalizedKeyword
    .split(" ")
    .filter((token) => token.length >= 3)
    .map(singular)
    .every((token) => candidateTokens.some((candidateToken) => candidateToken === token));
}

function priorityCounts(candidates: RadarCandidate[]) {
  return {
    highResearchPriority: candidates.filter((candidate) => candidate.priorityLabel === "high_research_priority").length,
    mediumResearchPriority: candidates.filter((candidate) => candidate.priorityLabel === "medium_research_priority").length,
    exploratory: candidates.filter((candidate) => candidate.priorityLabel === "exploratory").length,
  };
}

export function filterOfficialRadarByKeyword(
  report: MercadoLivreRadarReport,
  input: { keyword: string; maximumUnitsPerListing: number | null },
): MercadoLivreRadarReport {
  const matchedCandidates = report.candidates.filter((candidate) => {
    if (!matchesKeyword(candidate, input.keyword)) return false;
    return input.maximumUnitsPerListing === null ||
      assessProductViability(candidate).normalizedUnitCount <= input.maximumUnitsPerListing;
  });
  const candidates = matchedCandidates.map((candidate, index) => {
    const unitCount = assessProductViability(candidate).normalizedUnitCount;
    return {
      ...candidate,
      radarRank: index + 1,
      reasons: [
        ...candidate.reasons,
        `Correspondência com o termo solicitado: ${input.keyword}.`,
        input.maximumUnitsPerListing === null
          ? `Quantidade do kit identificada: ${unitCount} unidade(s).`
          : `Kit com ${unitCount} unidade(s), dentro do limite de ${input.maximumUnitsPerListing}.`,
      ],
    };
  });
  const counts = priorityCounts(candidates);

  return {
    ...report,
    status:
      candidates.length > 0
        ? (report.status === "failed" ? "partial" : report.status)
        : report.status === "failed"
          ? "failed"
          : "partial",
    summary: {
      ...report.summary,
      candidatesAfterDeduplication: candidates.length,
      candidatesAfterDiversity: candidates.length,
      ...counts,
    },
    candidates,
    notes: [
      ...report.notes,
      `Filtro determinístico aplicado ao termo “${input.keyword}”.`,
      input.maximumUnitsPerListing === null
        ? "Sem limite de unidades por kit nesta execução."
        : `Foram mantidos somente kits de até ${input.maximumUnitsPerListing} unidades.`,
      "A relevância vem exclusivamente do ranking oficial de mais vendidos por categoria; sold_quantity não é usado.",
    ],
  };
}

export async function runOfficialMercadoLivreKeywordRadar(
  database: PrismaClient,
  input: { keyword: string; notes?: string | null; maximumUnitsPerListing?: number | null },
) {
  const dimensions = await dimensionsForOfficialKeywordRadar(input.keyword);
  const report = filterOfficialRadarByKeyword(await buildMercadoLivreRadar(() => undefined, dimensions), {
    keyword: input.keyword,
    maximumUnitsPerListing: input.maximumUnitsPerListing ?? null,
  });
  const viability = buildProductViabilityPreview(report);
  const persistence = await persistRadarHistory(database, report, viability, {
    searchTerm: input.keyword,
    notes: input.notes ?? undefined,
    strategy: "KEYWORD_SEARCH",
  });
  return { report, viability, persistence };
}
