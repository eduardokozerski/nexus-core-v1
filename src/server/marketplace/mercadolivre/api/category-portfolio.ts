import type {
  PrismaClient,
  RadarCategory,
  RadarCategoryStatus,
  RadarFocusArea,
} from "@/src/generated/prisma/client";

import { executeCapabilityCheck } from "./capability-request";
import type { MercadoLivreDimensionSeed } from "./dimension-seeds";
import type { MercadoLivreRadarReport } from "./radar-types";
import { normalizeRadarText } from "./radar-preferences";

const MARKETPLACE = "MERCADO_LIVRE" as const;
export const RADAR_PRIORITY_CATEGORY_SLOTS = 8;
export const RADAR_EXPLORATORY_CATEGORY_SLOTS = 4;
export const RADAR_CATEGORY_SLOTS =
  RADAR_PRIORITY_CATEGORY_SLOTS + RADAR_EXPLORATORY_CATEGORY_SLOTS;

const ROOTS: Array<{
  externalId: string;
  name: string;
  focusArea: RadarFocusArea;
}> = [
  {
    externalId: "MLB1574",
    name: "Casa, Móveis e Decoração",
    focusArea: "HOME",
  },
  {
    externalId: "MLB1051",
    name: "Celulares e Telefones",
    focusArea: "MOBILE",
  },
  {
    externalId: "MLB1132",
    name: "Brinquedos e Hobbies",
    focusArea: "TOYS",
  },
];

const EXCLUDED_CATEGORY_TERMS = [
  "armario",
  "bateria",
  "cama",
  "carregador",
  "colchao",
  "comoda",
  "drone",
  "eletrico",
  "eletronico",
  "guarda roupa",
  "inflavel",
  "motorizado",
  "pecas",
  "pelucia",
  "pilha",
  "roupa",
  "sapateira",
  "sofa",
  "veiculo infantil",
];

const FOCUS_TERMS: Record<RadarFocusArea, string[]> = {
  HOME: [
    "banheiro",
    "cozinha",
    "escritorio",
    "ferramenta de limpeza",
    "lavanderia",
    "limpeza",
    "organizacao",
    "organizador",
    "pia",
    "saboneteira",
    "suporte",
  ],
  MOBILE: [
    "acessorio",
    "celular",
    "limpeza",
    "organizador",
    "porta celular",
    "smartphone",
    "suporte",
  ],
  TOYS: [
    "antiestresse",
    "boneco",
    "brinquedo de montar",
    "figura de acao",
    "figuras de acao",
    "fidget",
    "jogo de mesa",
    "miniatura",
    "quebra cabeca",
  ],
};

const LEAF_FOCUS_TERMS: Record<RadarFocusArea, string[]> = {
  HOME: [
    "dispenser",
    "escorredor",
    "gancho",
    "limpeza",
    "organizador",
    "porta ",
    "prateleira",
    "ralo",
    "saboneteira",
    "suporte",
  ],
  MOBILE: [
    "aneis para celulares",
    "limpeza",
    "organizador",
    "porta celulares",
    "suporte",
  ],
  TOYS: [
    "antiestresse",
    "brinquedo de montar",
    "expositor",
    "figura de acao",
    "figuras de acao",
    "fidget",
    "miniatura",
    "quebra cabeca",
  ],
};

type JsonRecord = Record<string, unknown>;

export interface CategoryPortfolioSelection {
  priority: RadarCategory[];
  exploratory: RadarCategory[];
  dimensions: MercadoLivreDimensionSeed[];
}

function asRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function categoryChildren(body: unknown): Array<{ id: string; name: string }> {
  const children = asRecord(body).children_categories;
  if (!Array.isArray(children)) return [];
  return children
    .map(asRecord)
    .map((entry) => ({
      id: asString(entry.id),
      name: asString(entry.name),
    }))
    .filter(
      (entry): entry is { id: string; name: string } =>
        entry.id !== null && entry.name !== null,
    );
}

function categoryPath(body: unknown): Array<{ id: string; name: string }> {
  const path = asRecord(body).path_from_root;
  if (!Array.isArray(path)) return [];
  return path
    .map(asRecord)
    .map((entry) => ({
      id: asString(entry.id),
      name: asString(entry.name),
    }))
    .filter(
      (entry): entry is { id: string; name: string } =>
        entry.id !== null && entry.name !== null,
    );
}

export function categoryFocusScore(
  name: string,
  focusArea: RadarFocusArea,
  parentFocusScore = 0,
): number {
  const normalized = normalizeRadarText(name);
  if (
    EXCLUDED_CATEGORY_TERMS.some((term) =>
      normalized.includes(normalizeRadarText(term)),
    )
  ) {
    return -100;
  }

  const matches = FOCUS_TERMS[focusArea].filter((term) =>
    normalized.includes(normalizeRadarText(term)),
  ).length;
  if (matches > 0) return Math.min(100, 55 + matches * 15);

  const neutralBranch = /^(outros|acessorios|pecas|utilidades)$/.test(normalized);
  if (parentFocusScore >= 55 && neutralBranch) return parentFocusScore - 20;
  if (parentFocusScore >= 70) return Math.max(25, parentFocusScore - 35);
  return 0;
}

export function leafCategoryFocusScore(
  name: string,
  focusArea: RadarFocusArea,
): number {
  const normalized = normalizeRadarText(name);
  if (
    EXCLUDED_CATEGORY_TERMS.some((term) =>
      normalized.includes(normalizeRadarText(term)),
    )
  ) {
    return -100;
  }
  const matches = LEAF_FOCUS_TERMS[focusArea].filter((term) =>
    normalized.includes(normalizeRadarText(term)),
  ).length;
  return matches > 0 ? Math.min(100, 65 + matches * 15) : 0;
}

async function ensureRoots(database: PrismaClient): Promise<void> {
  await Promise.all(
    ROOTS.map((root) =>
      database.radarCategory.upsert({
        where: {
          marketplace_externalId: {
            marketplace: MARKETPLACE,
            externalId: root.externalId,
          },
        },
        create: {
          marketplace: MARKETPLACE,
          externalId: root.externalId,
          name: root.name,
          focusArea: root.focusArea,
          status: "EXPLORATORY",
          depth: 0,
          isLeaf: false,
          focusScore: 100,
          source: "portfolio_root",
          rationale: "Raiz oficial para descoberta controlada de categorias.",
        },
        update: {
          name: root.name,
          focusArea: root.focusArea,
          isLeaf: false,
          focusScore: 100,
        },
      }),
    ),
  );
}

async function discardOutOfFocusRootBranches(
  database: PrismaClient,
): Promise<void> {
  const rootChildren = await database.radarCategory.findMany({
    where: {
      marketplace: MARKETPLACE,
      depth: 1,
      status: "EXPLORATORY",
    },
  });
  await Promise.all(
    rootChildren
      .filter(
        (category) =>
          categoryFocusScore(category.name, category.focusArea, 0) <= 0,
      )
      .map((category) =>
        database.radarCategory.update({
          where: { id: category.id },
          data: {
            status: "DISCARDED",
            rationale:
              "Ramo descartado por não pertencer ao foco operacional da área.",
          },
        }),
      ),
  );
}

async function discardOutOfFocusLeaves(database: PrismaClient): Promise<void> {
  const leaves = await database.radarCategory.findMany({
    where: {
      marketplace: MARKETPLACE,
      isLeaf: true,
      status: "EXPLORATORY",
    },
  });
  await Promise.all(
    leaves.map((category) => {
      const focusScore = leafCategoryFocusScore(
        category.name,
        category.focusArea,
      );
      return database.radarCategory.update({
        where: { id: category.id },
        data:
          focusScore > 0
            ? { focusScore }
            : {
                status: "DISCARDED",
                rationale:
                  "Categoria-folha descartada por não representar um produto compacto do foco operacional.",
              },
      });
    }),
  );
}

async function expandOneFrontierNode(
  database: PrismaClient,
  focusArea: RadarFocusArea,
): Promise<"expanded" | "empty" | "rate_limited"> {
  const node = await database.radarCategory.findFirst({
    where: {
      marketplace: MARKETPLACE,
      focusArea,
      status: "EXPLORATORY",
      expandedAt: null,
      OR: [{ isLeaf: false }, { isLeaf: null }],
    },
    orderBy: [{ depth: "desc" }, { focusScore: "desc" }, { createdAt: "asc" }],
  });
  if (!node) return "empty";

  const result = await executeCapabilityCheck(
    `category_portfolio_${node.externalId}`,
    `/categories/${encodeURIComponent(node.externalId)}`,
    (body) => ({ children: categoryChildren(body).length }),
  );
  const expandedAt = new Date();
  if (result.check.status === "rate_limited") {
    return "rate_limited";
  }
  if (result.check.status !== "supported") {
    await database.radarCategory.update({
      where: { id: node.id },
      data: {
        expandedAt,
        rationale: `Expansão indisponível: ${result.check.status}.`,
      },
    });
    return "expanded";
  }

  const record = asRecord(result.body);
  const children = categoryChildren(result.body);
  const path = categoryPath(result.body);
  const resolvedName = asString(record.name) ?? node.name;
  const leafFocusScore =
    children.length === 0
      ? leafCategoryFocusScore(resolvedName, focusArea)
      : node.focusScore;
  await database.radarCategory.update({
    where: { id: node.id },
    data: {
      name: resolvedName,
      path,
      isLeaf: children.length === 0,
      focusScore: leafFocusScore > 0 ? leafFocusScore : node.focusScore,
      ...(children.length === 0 && leafFocusScore <= 0
        ? {
            status: "DISCARDED",
            rationale:
              "Categoria-folha descartada por não representar um produto compacto do foco operacional.",
          }
        : {}),
      expandedAt,
    },
  });

  for (const child of children) {
    const focusScore = categoryFocusScore(
      child.name,
      focusArea,
      node.depth === 0 ? 0 : node.focusScore,
    );
    if (focusScore <= 0) continue;
    await database.radarCategory.upsert({
      where: {
        marketplace_externalId: {
          marketplace: MARKETPLACE,
          externalId: child.id,
        },
      },
      create: {
        marketplace: MARKETPLACE,
        externalId: child.id,
        name: child.name,
        focusArea,
        parentExternalId: node.externalId,
        depth: node.depth + 1,
        focusScore,
        path: [...path, { id: child.id, name: child.name }],
        rationale: "Categoria descoberta pela árvore oficial do Mercado Livre.",
      },
      update: {
        name: child.name,
        focusArea,
        parentExternalId: node.externalId,
        depth: node.depth + 1,
        focusScore,
        path: [...path, { id: child.id, name: child.name }],
      },
    });
  }
  return "expanded";
}

export async function expandRadarCategoryFrontier(
  database: PrismaClient,
  checksPerFocusArea = 8,
): Promise<void> {
  await ensureRoots(database);
  await discardOutOfFocusRootBranches(database);
  await discardOutOfFocusLeaves(database);
  for (const root of ROOTS) {
    for (let index = 0; index < checksPerFocusArea; index += 1) {
      const result = await expandOneFrontierNode(database, root.focusArea);
      if (result === "rate_limited") return;
      if (result === "empty") break;
    }
  }
}

function categoryRecency(category: RadarCategory): number {
  return category.lastScannedAt?.getTime() ?? 0;
}

function comparePriority(left: RadarCategory, right: RadarCategory): number {
  return (
    right.priorityScore - left.priorityScore ||
    categoryRecency(left) - categoryRecency(right) ||
    right.focusScore - left.focusScore ||
    left.externalId.localeCompare(right.externalId)
  );
}

function compareExploratory(
  left: RadarCategory,
  right: RadarCategory,
): number {
  return (
    Number(left.scanCount > 0) - Number(right.scanCount > 0) ||
    categoryRecency(left) - categoryRecency(right) ||
    right.focusScore - left.focusScore ||
    left.externalId.localeCompare(right.externalId)
  );
}

function takeDiverse(
  categories: RadarCategory[],
  limit: number,
  usedIds: Set<string>,
): RadarCategory[] {
  const selected: RadarCategory[] = [];
  const usedAreas = new Set<RadarFocusArea>();
  for (const category of categories) {
    if (selected.length >= limit) break;
    if (usedIds.has(category.id) || usedAreas.has(category.focusArea)) continue;
    selected.push(category);
    usedIds.add(category.id);
    usedAreas.add(category.focusArea);
  }
  for (const category of categories) {
    if (selected.length >= limit) break;
    if (usedIds.has(category.id)) continue;
    selected.push(category);
    usedIds.add(category.id);
  }
  return selected;
}

export function selectRadarCategoryPortfolio(
  categories: RadarCategory[],
  prioritySlots = RADAR_PRIORITY_CATEGORY_SLOTS,
  exploratorySlots = RADAR_EXPLORATORY_CATEGORY_SLOTS,
): CategoryPortfolioSelection {
  const leafCategories = categories.filter(
    (category) =>
      category.isLeaf === true &&
      category.status !== "PAUSED" &&
      category.status !== "DISCARDED",
  );
  const priorityPool = leafCategories
    .filter((category) => category.status === "PRIORITY")
    .sort(comparePriority);
  const exploratoryPool = leafCategories
    .filter((category) => category.status === "EXPLORATORY")
    .sort(compareExploratory);
  const usedIds = new Set<string>();
  const priority = takeDiverse(priorityPool, prioritySlots, usedIds);
  const exploratory = takeDiverse(
    exploratoryPool,
    exploratorySlots,
    usedIds,
  );

  const totalSlots = prioritySlots + exploratorySlots;
  if (priority.length + exploratory.length < totalSlots) {
    priority.push(
      ...takeDiverse(
        priorityPool,
        totalSlots - priority.length - exploratory.length,
        usedIds,
      ),
    );
  }
  if (priority.length + exploratory.length < totalSlots) {
    exploratory.push(
      ...takeDiverse(
        exploratoryPool,
        totalSlots - priority.length - exploratory.length,
        usedIds,
      ),
    );
  }

  const selected = [...priority, ...exploratory];
  return {
    priority,
    exploratory,
    dimensions: selected.map((category, index) => ({
      categoryId: category.externalId,
      expectedName: category.name,
      rationale:
        category.status === "PRIORITY"
          ? "Categoria priorizada pelo histórico de validações do radar."
          : "Categoria-folha nova reservada para descoberta.",
      portfolioPriority: index + 1,
      radarEnabled: true,
    })),
  };
}

export async function refreshRadarCategoryScores(
  database: PrismaClient,
): Promise<void> {
  const grouped = await database.humanDecision.groupBy({
    by: ["radarCategoryId", "status"],
    where: { radarCategoryId: { not: null } },
    _count: { _all: true },
  });
  const counts = new Map<
    string,
    { validated: number; rejected: number }
  >();
  for (const row of grouped) {
    if (!row.radarCategoryId) continue;
    const entry = counts.get(row.radarCategoryId) ?? {
      validated: 0,
      rejected: 0,
    };
    if (row.status === "VALIDATED") entry.validated = row._count._all;
    if (row.status === "REJECTED") entry.rejected = row._count._all;
    counts.set(row.radarCategoryId, entry);
  }

  const categories = await database.radarCategory.findMany({
    where: { marketplace: MARKETPLACE },
  });
  await Promise.all(
    categories.map((category) => {
      const feedback = counts.get(category.id) ?? {
        validated: 0,
        rejected: 0,
      };
      const priorityScore = Math.max(
        0,
        Math.min(
          200,
          category.focusScore +
            feedback.validated * 20 -
            feedback.rejected * 12,
        ),
      );
      let status: RadarCategoryStatus = category.status;
      if (category.status !== "DISCARDED") {
        if (feedback.validated > 0) status = "PRIORITY";
        else if (feedback.rejected >= 3) status = "PAUSED";
      }
      return database.radarCategory.update({
        where: { id: category.id },
        data: { priorityScore, status },
      });
    }),
  );
}

/** Atualiza somente a categoria que recebeu feedback humano. */
export async function refreshRadarCategoryScore(
  database: PrismaClient,
  radarCategoryId: string | null,
): Promise<void> {
  if (!radarCategoryId) return;

  const [category, grouped] = await Promise.all([
    database.radarCategory.findUnique({ where: { id: radarCategoryId } }),
    database.humanDecision.groupBy({
      by: ["status"],
      where: { radarCategoryId },
      _count: { _all: true },
    }),
  ]);
  if (!category) return;

  const feedback = { validated: 0, rejected: 0 };
  for (const row of grouped) {
    if (row.status === "VALIDATED") feedback.validated = row._count._all;
    if (row.status === "REJECTED") feedback.rejected = row._count._all;
  }

  const priorityScore = Math.max(
    0,
    Math.min(
      200,
      category.focusScore + feedback.validated * 20 - feedback.rejected * 12,
    ),
  );
  let status: RadarCategoryStatus = category.status;
  if (category.status !== "DISCARDED") {
    if (feedback.validated > 0) status = "PRIORITY";
    else if (feedback.rejected >= 3) status = "PAUSED";
  }

  await database.radarCategory.update({
    where: { id: category.id },
    data: { priorityScore, status },
  });
}

export async function prepareRadarCategoryPortfolio(
  database: PrismaClient,
): Promise<CategoryPortfolioSelection> {
  await refreshRadarCategoryScores(database);
  await expandRadarCategoryFrontier(database);
  const categories = await database.radarCategory.findMany({
    where: { marketplace: MARKETPLACE },
  });
  return selectRadarCategoryPortfolio(categories);
}

export async function markRadarCategoryRun(
  database: PrismaClient,
  report: MercadoLivreRadarReport,
): Promise<void> {
  const categoryCandidateCounts = new Map<string, number>();
  for (const candidate of report.candidates) {
    for (const source of candidate.sources) {
      categoryCandidateCounts.set(
        source.categoryId,
        (categoryCandidateCounts.get(source.categoryId) ?? 0) + 1,
      );
    }
  }

  for (const dimension of report.dimensions) {
    const category = await database.radarCategory.findUnique({
      where: {
        marketplace_externalId: {
          marketplace: MARKETPLACE,
          externalId: dimension.categoryId,
        },
      },
    });
    if (!category) continue;
    const candidateDelta =
      categoryCandidateCounts.get(dimension.categoryId) ?? 0;
    const nextScanCount = category.scanCount + 1;
    const nextCandidateCount = category.candidateCount + candidateDelta;
    const shouldPauseEmptyExploration =
      category.status === "EXPLORATORY" &&
      nextScanCount >= 2 &&
      nextCandidateCount === 0 &&
      dimension.highlights.status === "supported";
    await database.radarCategory.update({
      where: { id: category.id },
      data: {
        scanCount: { increment: 1 },
        candidateCount: { increment: candidateDelta },
        lastScannedAt: new Date(report.finishedAt),
        ...(shouldPauseEmptyExploration ? { status: "PAUSED" } : {}),
      },
    });
  }
}

export async function radarCategoryDashboard(database: PrismaClient) {
  const [categories, grouped] = await Promise.all([
    database.radarCategory.findMany({
      where: { marketplace: MARKETPLACE, depth: { gt: 0 } },
      orderBy: [
        { status: "asc" },
        { priorityScore: "desc" },
        { focusScore: "desc" },
      ],
    }),
    database.humanDecision.groupBy({
      by: ["radarCategoryId", "status"],
      where: { radarCategoryId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const feedback = new Map<
    string,
    { validated: number; rejected: number }
  >();
  for (const row of grouped) {
    if (!row.radarCategoryId) continue;
    const value = feedback.get(row.radarCategoryId) ?? {
      validated: 0,
      rejected: 0,
    };
    if (row.status === "VALIDATED") value.validated = row._count._all;
    if (row.status === "REJECTED") value.rejected = row._count._all;
    feedback.set(row.radarCategoryId, value);
  }
  return categories.map((category) => ({
    ...category,
    feedback: feedback.get(category.id) ?? { validated: 0, rejected: 0 },
  }));
}
