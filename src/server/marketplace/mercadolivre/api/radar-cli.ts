import { loadEnvConfig } from "@next/env";

import { getDatabase } from "@/src/server/db/client";
import { persistRadarHistory } from "@/src/server/history/radar-history";

import { buildProductViabilityPreview } from "./product-viability";
import { persistProductViabilityPreview } from "./product-viability-store";
import { buildMercadoLivreRadar } from "./radar";
import { runOfficialMercadoLivreRadar } from "./radar-service";
import { persistRadarReport } from "./radar-store";

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());

  const dynamicResult = process.env.DATABASE_URL
    ? await runOfficialMercadoLivreRadar(getDatabase())
    : null;
  const report =
    dynamicResult?.report ??
    (await buildMercadoLivreRadar((message) => console.error(message)));
  const viability =
    dynamicResult?.viability ?? buildProductViabilityPreview(report);
  const [radarPersistence, viabilityPersistence] = await Promise.all([
    persistRadarReport(report),
    persistProductViabilityPreview(viability),
  ]);
  const historyPersistence =
    dynamicResult?.persistence ??
    (process.env.DATABASE_URL
      ? await persistRadarHistory(getDatabase(), report, viability)
      : null);

  if (!process.env.DATABASE_URL) {
    console.error(
      "[meli-radar] DATABASE_URL ausente; JSON salvo e importação PostgreSQL ignorada.",
    );
  }

  console.log(
    JSON.stringify(
      {
        status: report.status,
        summary: report.summary,
        topCandidates: report.candidates.slice(0, 10).map((candidate) => ({
          radarRank: candidate.radarRank,
          candidateId: candidate.candidateId,
          name: candidate.name,
          researchPriorityScore: candidate.scores.researchPriorityScore,
          priorityLabel: candidate.priorityLabel,
          flags: candidate.flags,
        })),
        viability: viability.summary,
        persistence: {
          radar: radarPersistence,
          viability: viabilityPersistence,
          history: historyPersistence,
        },
      },
      null,
      2,
    ),
  );

  if (report.status === "failed") process.exitCode = 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Erro desconhecido.";
  console.error(`[meli-radar] ${message}`);
  process.exitCode = 1;
});
