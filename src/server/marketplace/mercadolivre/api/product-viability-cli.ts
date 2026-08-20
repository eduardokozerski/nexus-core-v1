import path from "node:path";

import { buildProductViabilityPreview } from "./product-viability";
import {
  loadRadarReport,
  persistProductViabilityPreview,
} from "./product-viability-store";

async function main(): Promise<void> {
  const inputPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve("research-data/mercadolivre-api/latest/radar.json");
  const report = await loadRadarReport(inputPath);
  const preview = buildProductViabilityPreview(report);
  const persistence = await persistProductViabilityPreview(preview);

  console.log(
    JSON.stringify(
      {
        summary: preview.summary,
        validationQueue: preview.candidates
          .filter(
            (candidate) =>
              candidate.productViability.status === "ready_for_manual_validation" ||
              candidate.productViability.status === "manual_viability_review",
          )
          .map((candidate) => ({
            radarRank: candidate.radarRank,
            name: candidate.name,
            status: candidate.productViability.status,
            medianPricePerUnit: candidate.productViability.medianPricePerUnit,
            manualChecksRequired: candidate.productViability.manualChecksRequired,
          })),
        persistence,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Erro desconhecido.";
  console.error(`[product-viability] ${message}`);
  process.exitCode = 1;
});
