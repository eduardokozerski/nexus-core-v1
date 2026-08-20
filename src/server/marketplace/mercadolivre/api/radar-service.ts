import type { PrismaClient } from "@/src/generated/prisma/client";
import { persistRadarHistory } from "@/src/server/history/radar-history";

import {
  markRadarCategoryRun,
  prepareRadarCategoryPortfolio,
} from "./category-portfolio";
import { buildProductViabilityPreview } from "./product-viability";
import { buildMercadoLivreRadar } from "./radar";
import { RADAR_DIMENSIONS } from "./radar-config";
import { normalizeRadarText } from "./radar-preferences";

/** Runs the fixed category portfolio; it deliberately accepts no product query. */
export async function runOfficialMercadoLivreRadar(
  database: PrismaClient,
  collectionRunId?: string,
) {
  const [portfolio, seenListings, preferenceRows] = await Promise.all([
    prepareRadarCategoryPortfolio(database),
    database.listing.findMany({
      where: {
        snapshots: {
          some: {
            collectionRun: {
              searchTerm: { strategy: "RADAR_DISCOVERY" },
            },
          },
        },
      },
      select: { externalId: true, title: true },
    }),
    database.radarPreference.findMany({
      where: { active: true },
      orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
      select: { kind: true, term: true },
    }),
  ]);
  const excludedCandidateIds = new Set(
    seenListings.map((listing) => listing.externalId),
  );
  const excludedCandidateNames = new Set(
    seenListings.map((listing) => normalizeRadarText(listing.title)),
  );
  const preferences = {
    bannedTerms: preferenceRows
      .filter(({ kind }) => kind === "BANNED")
      .map(({ term }) => term),
    preferredCategoryIds: portfolio.dimensions.map(
      (dimension) => dimension.categoryId,
    ),
  };
  const report = await buildMercadoLivreRadar(
    () => undefined,
    portfolio.dimensions.length > 0
      ? portfolio.dimensions
      : RADAR_DIMENSIONS,
    {
      excludedCandidateIds,
      excludedCandidateNames,
      preferences,
    },
  );
  const viability = buildProductViabilityPreview(
    report,
    undefined,
    preferences,
  );
  const persistence = await persistRadarHistory(database, report, viability, {
    collectionRunId,
  });
  await markRadarCategoryRun(database, report);

  return { report, viability, persistence, portfolio };
}
