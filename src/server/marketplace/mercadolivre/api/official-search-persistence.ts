import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@/src/generated/prisma/client";
import { normalizeSearchTerm } from "@/src/server/history/radar-history";
import {
  OFFICIAL_KEYWORD_SCORE_VERSION,
  scoreOfficialKeywordResult,
} from "@/src/server/marketplace/scoring/official-keyword-score";

import type { OfficialMercadoLivreSearchReport } from "./official-search";

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export interface PersistedOfficialSearch {
  searchTermId: string;
  collectionRunId: string;
  listingsUpserted: number;
  snapshotsUpserted: number;
}

export async function persistOfficialSearch(
  database: PrismaClient,
  report: OfficialMercadoLivreSearchReport,
): Promise<PersistedOfficialSearch> {
  const normalizedKeyword = normalizeSearchTerm(report.query);
  const externalRunKey = `official-search:${randomUUID()}`;
  const runStatus = report.status === "success" ? "SUCCESS" : report.results.length > 0 ? "PARTIAL" : "FAILED";

  return database.$transaction(async (transaction) => {
    const searchTerm = await transaction.searchTerm.upsert({
      where: {
        marketplace_normalizedKeyword_strategy: {
          marketplace: "MERCADO_LIVRE",
          normalizedKeyword,
          strategy: "KEYWORD_SEARCH",
        },
      },
      create: { marketplace: "MERCADO_LIVRE", keyword: report.query, normalizedKeyword, strategy: "KEYWORD_SEARCH" },
      update: { keyword: report.query, status: "ACTIVE" },
    });

    const run = await transaction.collectionRun.create({
      data: {
        externalRunKey,
        searchTermId: searchTerm.id,
        marketplace: "MERCADO_LIVRE",
        source: "OFFICIAL_API",
        status: runStatus,
        scoreVersion: OFFICIAL_KEYWORD_SCORE_VERSION,
        startedAt: new Date(report.startedAt),
        finishedAt: new Date(report.finishedAt),
        errorMessage: report.error,
        summary: asJson({ total: report.total, returned: report.results.length, offset: report.offset, endpoint: report.endpoint }),
        rawReport: asJson(report),
      },
    });

    for (const result of report.results) {
      const catalogUrl = `https://www.mercadolivre.com.br/p/${encodeURIComponent(result.catalogProductId ?? result.externalId)}`;
      const score = scoreOfficialKeywordResult(result.position);
      const listing = await transaction.listing.upsert({
        where: { marketplace_externalId: { marketplace: "MERCADO_LIVRE", externalId: result.externalId } },
        create: {
          marketplace: "MERCADO_LIVRE",
          externalId: result.externalId,
          catalogProductId: result.catalogProductId,
          domainId: result.domainId,
          title: result.title,
          imageUrl: result.imageUrl,
          url: catalogUrl,
        },
        update: {
          catalogProductId: result.catalogProductId,
          domainId: result.domainId,
          title: result.title,
          imageUrl: result.imageUrl,
          url: catalogUrl,
        },
      });

      const availability = { source: "official_api", dataAvailability: { price: false, reviews: false, sales: false } };
      const snapshot = await transaction.listingSnapshot.upsert({
        where: { listingId_collectionRunId: { listingId: listing.id, collectionRunId: run.id } },
        create: {
          listingId: listing.id,
          collectionRunId: run.id,
          searchPosition: result.position,
          opportunityScore: score.totalScore,
          priorityLabel: score.priorityLabel,
          flags: asJson(availability),
          reasons: asJson(score.reasons),
          rawData: asJson(result.rawData),
          collectedAt: new Date(report.finishedAt),
        },
        update: {
          searchPosition: result.position,
          opportunityScore: score.totalScore,
          priorityLabel: score.priorityLabel,
          flags: asJson(availability),
          reasons: asJson(score.reasons),
          rawData: asJson(result.rawData),
          collectedAt: new Date(report.finishedAt),
        },
      });

      await transaction.opportunityScore.upsert({
        where: { listingSnapshotId: snapshot.id },
        create: {
          listingSnapshotId: snapshot.id,
          version: score.version,
          totalScore: score.totalScore,
          demandScore: score.demandScore,
          competitionScore: score.competitionScore,
          priceScore: score.priceScore,
          sellerScore: score.sellerScore,
          riskScore: score.riskScore,
          components: asJson(score.components),
          reasons: asJson(score.reasons),
        },
        update: {
          version: score.version,
          totalScore: score.totalScore,
          demandScore: score.demandScore,
          competitionScore: score.competitionScore,
          priceScore: score.priceScore,
          sellerScore: score.sellerScore,
          riskScore: score.riskScore,
          components: asJson(score.components),
          reasons: asJson(score.reasons),
        },
      });
    }

    return {
      searchTermId: searchTerm.id,
      collectionRunId: run.id,
      listingsUpserted: report.results.length,
      snapshotsUpserted: report.results.length,
    };
  });
}
