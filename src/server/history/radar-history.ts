import { createHash, randomUUID } from "node:crypto";

import { z } from "zod";

import { Prisma, type PrismaClient } from "@/src/generated/prisma/client";
import type { ProductViabilityPreview } from "@/src/server/marketplace/mercadolivre/api/product-viability-types";
import type {
  MercadoLivreRadarReport,
  RadarCandidate,
} from "@/src/server/marketplace/mercadolivre/api/radar-types";
import { refreshRadarCategoryScores } from "@/src/server/marketplace/mercadolivre/api/category-portfolio";

export const DEFAULT_RADAR_SEARCH_TERM = "Radar automático de oportunidades";

const humanDecisionInputSchema = z.object({
  candidateId: z.string().trim().min(1),
  status: z.enum(["validated", "rejected"]),
  notes: z.string().trim().min(3),
  source: z.string().trim().min(1).default("user_text"),
});

export type HumanDecisionInput = z.input<typeof humanDecisionInputSchema>;

export interface PersistRadarHistoryOptions {
  searchTerm?: string;
  notes?: string;
  strategy?: "KEYWORD_SEARCH" | "RADAR_DISCOVERY";
  collectionRunId?: string;
}

export interface PersistedRadarHistory {
  searchTermId: string;
  collectionRunId: string;
  listingsUpserted: number;
  snapshotsUpserted: number;
}

export interface PendingRadarRun {
  collectionRunId: string;
  created: boolean;
}

const ACTIVE_RADAR_RUN_WINDOW_MS = 30 * 60 * 1_000;

export function normalizeSearchTerm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function buildRadarRunKey(report: MercadoLivreRadarReport): string {
  return `${report.marketplace}:${report.source}:${report.startedAt}`;
}

export function buildHumanDecisionKey(input: HumanDecisionInput): string {
  const parsed = humanDecisionInputSchema.parse(input);
  const digest = createHash("sha256")
    .update(
      [
        parsed.candidateId,
        parsed.status,
        parsed.notes.toLocaleLowerCase("pt-BR"),
        parsed.source,
      ].join("\n"),
    )
    .digest("hex");
  return `human:${digest}`;
}

export function candidateDemandScore(candidate: RadarCandidate): number {
  return (
    candidate.scores.highlightScore +
    candidate.scores.reviewsScore +
    candidate.scores.ratingScore +
    candidate.scores.trendScore
  );
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function runStatus(report: MercadoLivreRadarReport) {
  switch (report.status) {
    case "success":
      return "SUCCESS" as const;
    case "partial":
      return "PARTIAL" as const;
    case "failed":
      return "FAILED" as const;
  }
}

function reportErrorMessage(report: MercadoLivreRadarReport): string | null {
  if (report.status !== "failed") return null;
  return (
    report.checks.find((check) => check.error)?.error ??
    report.notes[0] ??
    "A coleta oficial falhou sem informar detalhes."
  );
}

export async function createOrReusePendingRadarRun(
  database: PrismaClient,
): Promise<PendingRadarRun> {
  const activeSince = new Date(Date.now() - ACTIVE_RADAR_RUN_WINDOW_MS);
  const existing = await database.collectionRun.findFirst({
    where: {
      status: { in: ["PENDING", "RUNNING"] },
      updatedAt: { gte: activeSince },
      searchTerm: { strategy: "RADAR_DISCOVERY" },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (existing) {
    return { collectionRunId: existing.id, created: false };
  }

  const keyword = DEFAULT_RADAR_SEARCH_TERM;
  const normalizedKeyword = normalizeSearchTerm(keyword);
  const searchTerm = await database.searchTerm.upsert({
    where: {
      marketplace_normalizedKeyword_strategy: {
        marketplace: "MERCADO_LIVRE",
        normalizedKeyword,
        strategy: "RADAR_DISCOVERY",
      },
    },
    create: {
      marketplace: "MERCADO_LIVRE",
      keyword,
      normalizedKeyword,
      strategy: "RADAR_DISCOVERY",
    },
    update: { keyword, status: "ACTIVE" },
  });
  const now = new Date();
  const run = await database.collectionRun.create({
    data: {
      externalRunKey: `radar:queued:${randomUUID()}`,
      searchTermId: searchTerm.id,
      marketplace: "MERCADO_LIVRE",
      source: "OFFICIAL_API",
      status: "PENDING",
      startedAt: now,
      summary: asJson({ queue: { enqueuedAt: now.toISOString() } }),
    },
    select: { id: true },
  });
  return { collectionRunId: run.id, created: true };
}

export async function markRadarRunFailed(
  database: PrismaClient,
  collectionRunId: string,
  error: unknown,
): Promise<void> {
  const message =
    error instanceof Error ? error.message : String(error || "Erro desconhecido.");
  await database.collectionRun.update({
    where: { id: collectionRunId },
    data: {
      status: "FAILED",
      finishedAt: new Date(),
      errorMessage: message.slice(0, 2_000),
    },
  });
}

function viabilityByCandidate(preview: ProductViabilityPreview) {
  return new Map(
    preview.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
}

function assertMatchingReports(
  report: MercadoLivreRadarReport,
  preview: ProductViabilityPreview,
): void {
  if (
    preview.sourceRadarStartedAt !== report.startedAt ||
    preview.sourceRadarFinishedAt !== report.finishedAt
  ) {
    throw new Error(
      "O Radar JSON e a prévia de viabilidade pertencem a execuções diferentes.",
    );
  }
}

export async function persistRadarHistory(
  database: PrismaClient,
  report: MercadoLivreRadarReport,
  preview: ProductViabilityPreview,
  options: PersistRadarHistoryOptions = {},
): Promise<PersistedRadarHistory> {
  assertMatchingReports(report, preview);

  const keyword = options.searchTerm?.trim() || DEFAULT_RADAR_SEARCH_TERM;
  const normalizedKeyword = normalizeSearchTerm(keyword);
  const strategy = options.strategy ?? "RADAR_DISCOVERY";
  const viability = viabilityByCandidate(preview);

  return database.$transaction(async (transaction) => {
    const searchTerm = await transaction.searchTerm.upsert({
      where: {
        marketplace_normalizedKeyword_strategy: {
          marketplace: "MERCADO_LIVRE",
          normalizedKeyword,
          strategy,
        },
      },
      create: {
        marketplace: "MERCADO_LIVRE",
        keyword,
        normalizedKeyword,
        strategy,
        notes: options.notes,
      },
      update: {
        keyword,
        status: "ACTIVE",
        ...(options.notes ? { notes: options.notes } : {}),
      },
    });

    const collectionRunData = {
      externalRunKey: buildRadarRunKey(report),
      searchTermId: searchTerm.id,
      marketplace: "MERCADO_LIVRE" as const,
      source: "OFFICIAL_API" as const,
      status: runStatus(report),
      scoreVersion: report.scoreVersion,
      viabilityRuleVersion: preview.ruleVersion,
      startedAt: new Date(report.startedAt),
      finishedAt: new Date(report.finishedAt),
      errorMessage: reportErrorMessage(report),
      summary: asJson({ radar: report.summary, viability: preview.summary }),
      rawReport: asJson(report),
    };
    const collectionRun = options.collectionRunId
      ? await transaction.collectionRun.update({
          where: { id: options.collectionRunId },
          data: collectionRunData,
        })
      : await transaction.collectionRun.upsert({
          where: { externalRunKey: buildRadarRunKey(report) },
          create: collectionRunData,
          update: collectionRunData,
        });
    const radarCategories = await transaction.radarCategory.findMany({
      where: {
        marketplace: "MERCADO_LIVRE",
        externalId: {
          in: report.dimensions.map((dimension) => dimension.categoryId),
        },
      },
      select: { id: true, externalId: true },
    });
    const radarCategoryIds = new Map(
      radarCategories.map((category) => [category.externalId, category.id]),
    );

    for (const candidate of report.candidates) {
      const assessment = viability.get(candidate.candidateId);
      const listing = await transaction.listing.upsert({
        where: {
          marketplace_externalId: {
            marketplace: "MERCADO_LIVRE",
            externalId: candidate.candidateId,
          },
        },
        create: {
          marketplace: "MERCADO_LIVRE",
          externalId: candidate.candidateId,
          catalogProductId: candidate.catalogProductId,
          userProductId: candidate.userProductId,
          domainId: candidate.domainId,
          url: candidate.catalogUrl ?? candidate.listingUrl,
          listingUrl: candidate.listingUrl,
          title: candidate.name,
          imageUrl: candidate.imageUrl,
          brand: candidate.brand,
        },
        update: {
          catalogProductId: candidate.catalogProductId,
          userProductId: candidate.userProductId,
          domainId: candidate.domainId,
          url: candidate.catalogUrl ?? candidate.listingUrl,
          listingUrl: candidate.listingUrl,
          title: candidate.name,
          imageUrl: candidate.imageUrl,
          brand: candidate.brand,
        },
      });

      const bestPosition = candidate.sources.length
        ? Math.min(...candidate.sources.map((source) => source.highlightPosition))
        : null;
      const primarySource = [...candidate.sources].sort(
        (left, right) =>
          left.highlightPosition - right.highlightPosition ||
          left.portfolioPriority - right.portfolioPriority,
      )[0];
      const snapshotData = {
        radarCategoryId: primarySource
          ? radarCategoryIds.get(primarySource.categoryId) ?? null
          : null,
        searchPosition: bestPosition,
        minimumPrice: candidate.pricing.minimumPrice,
        price: candidate.pricing.medianPrice,
        maximumPrice: candidate.pricing.maximumPrice,
        currencyId: candidate.pricing.currencyId,
        offerCount: candidate.pricing.offerCount,
        uniqueSellerCount: candidate.pricing.uniqueSellerCount,
        ratingAverage: candidate.reviews.ratingAverage,
        reviewCount: candidate.reviews.count,
        opportunityScore: candidate.scores.researchPriorityScore,
        priorityLabel: candidate.priorityLabel,
        viabilityStatus: assessment?.productViability.status ?? null,
        flags: asJson(candidate.flags),
        reasons: asJson(candidate.reasons),
        rawData: asJson({
          candidate,
          productViability: assessment?.productViability ?? null,
        }),
        collectedAt: new Date(report.finishedAt),
      };

      const snapshot = await transaction.listingSnapshot.upsert({
        where: {
          listingId_collectionRunId: {
            listingId: listing.id,
            collectionRunId: collectionRun.id,
          },
        },
        create: {
          listingId: listing.id,
          collectionRunId: collectionRun.id,
          ...snapshotData,
        },
        update: snapshotData,
      });

      await transaction.opportunityScore.upsert({
        where: { listingSnapshotId: snapshot.id },
        create: {
          listingSnapshotId: snapshot.id,
          version: report.scoreVersion,
          totalScore: candidate.scores.researchPriorityScore,
          demandScore: candidateDemandScore(candidate),
          competitionScore: candidate.scores.competitionScore,
          priceScore: candidate.scores.priceScore,
          riskScore: candidate.scores.riskPenalty,
          components: asJson(candidate.scores),
          reasons: asJson(candidate.reasons),
        },
        update: {
          version: report.scoreVersion,
          totalScore: candidate.scores.researchPriorityScore,
          demandScore: candidateDemandScore(candidate),
          competitionScore: candidate.scores.competitionScore,
          priceScore: candidate.scores.priceScore,
          riskScore: candidate.scores.riskPenalty,
          components: asJson(candidate.scores),
          reasons: asJson(candidate.reasons),
        },
      });
    }

    return {
      searchTermId: searchTerm.id,
      collectionRunId: collectionRun.id,
      listingsUpserted: report.candidates.length,
      snapshotsUpserted: report.candidates.length,
    };
  }, {
    maxWait: 10_000,
    timeout: 180_000,
  });
}

export async function recordHumanDecision(
  database: PrismaClient,
  rawInput: HumanDecisionInput,
): Promise<{ decisionId: string; candidateId: string; title: string }> {
  const input = humanDecisionInputSchema.parse(rawInput);
  const externalDecisionKey = buildHumanDecisionKey(input);
  const listing = await database.listing.findUnique({
    where: {
      marketplace_externalId: {
        marketplace: "MERCADO_LIVRE",
        externalId: input.candidateId,
      },
    },
    include: {
      snapshots: {
        orderBy: { collectedAt: "desc" },
        take: 1,
        select: { collectionRunId: true, radarCategoryId: true },
      },
    },
  });

  if (!listing) {
    throw new Error(`Candidato não encontrado no histórico: ${input.candidateId}`);
  }

  const decisionData = {
    listingId: listing.id,
    collectionRunId: listing.snapshots[0]?.collectionRunId,
    radarCategoryId: listing.snapshots[0]?.radarCategoryId,
    status: input.status === "validated" ? ("VALIDATED" as const) : ("REJECTED" as const),
    notes: input.notes,
    source: input.source,
  };
  const decision = await database.humanDecision.upsert({
    where: { externalDecisionKey },
    create: { externalDecisionKey, ...decisionData },
    update: decisionData,
  });
  await refreshRadarCategoryScores(database);

  return {
    decisionId: decision.id,
    candidateId: listing.externalId,
    title: listing.title,
  };
}
