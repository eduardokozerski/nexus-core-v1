import { loadEnvConfig } from "@next/env";

import { getDatabase } from "@/src/server/db/client";

import {
  prepareRadarCategoryPortfolio,
  radarCategoryDashboard,
} from "./category-portfolio";

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  const database = getDatabase();
  const selection = await prepareRadarCategoryPortfolio(database);
  const categories = await radarCategoryDashboard(database);

  console.log(
    JSON.stringify(
      {
        summary: {
          leafCategories: categories.filter(
            (category) => category.isLeaf === true,
          ).length,
          priorityCategories: categories.filter(
            (category) => category.status === "PRIORITY",
          ).length,
          exploratoryCategories: categories.filter(
            (category) => category.status === "EXPLORATORY",
          ).length,
          pausedCategories: categories.filter(
            (category) => category.status === "PAUSED",
          ).length,
        },
        nextRun: {
          priority: selection.priority.map((category) => ({
            id: category.externalId,
            name: category.name,
            focusArea: category.focusArea,
          })),
          exploratory: selection.exploratory.map((category) => ({
            id: category.externalId,
            name: category.name,
            focusArea: category.focusArea,
          })),
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(
    `[category-portfolio] ${
      error instanceof Error ? error.message : "Erro desconhecido."
    }`,
  );
  process.exitCode = 1;
});
