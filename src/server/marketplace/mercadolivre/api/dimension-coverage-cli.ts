import { loadEnvConfig } from "@next/env";

import { probeMercadoLivreDimensionCoverage } from "./dimension-coverage";
import { persistDimensionCoverage } from "./dimension-coverage-store";

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());

  const report = await probeMercadoLivreDimensionCoverage((message) =>
    console.error(message),
  );
  const persistence = await persistDimensionCoverage(report);

  console.log(
    JSON.stringify(
      {
        status: report.status,
        summary: report.summary,
        recommendedPortfolio: report.recommendedPortfolio,
        persistence,
      },
      null,
      2,
    ),
  );

  if (report.status === "failed") process.exitCode = 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Erro desconhecido.";
  console.error(`[meli-coverage] ${message}`);
  process.exitCode = 1;
});
