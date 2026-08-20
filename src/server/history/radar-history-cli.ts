import { readFile } from "node:fs/promises";
import path from "node:path";

import { loadEnvConfig } from "@next/env";

import { getDatabase } from "@/src/server/db/client";
import { loadRadarReport } from "@/src/server/marketplace/mercadolivre/api/product-viability-store";
import type { ProductViabilityPreview } from "@/src/server/marketplace/mercadolivre/api/product-viability-types";

import {
  persistRadarHistory,
  recordHumanDecision,
} from "./radar-history";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function loadViabilityPreview(filePath: string): Promise<ProductViabilityPreview> {
  const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as { candidates?: unknown }).candidates)
  ) {
    throw new Error(`Prévia de viabilidade inválida: ${filePath}`);
  }
  return parsed as ProductViabilityPreview;
}

async function importLatest(): Promise<void> {
  const radarPath = path.resolve(
    argument("--radar") ?? "research-data/mercadolivre-api/latest/radar.json",
  );
  const viabilityPath = path.resolve(
    argument("--viability") ??
      "research-data/mercadolivre-api/latest/radar-product-viability-preview.json",
  );
  const [report, preview] = await Promise.all([
    loadRadarReport(radarPath),
    loadViabilityPreview(viabilityPath),
  ]);
  const result = await persistRadarHistory(getDatabase(), report, preview, {
    searchTerm: argument("--search-term"),
    notes: argument("--notes"),
  });
  console.log(JSON.stringify(result, null, 2));
}

async function decision(): Promise<void> {
  const candidateId = argument("--candidate-id");
  const status = argument("--status");
  const notes = argument("--notes");
  if (!candidateId || !status || !notes) {
    throw new Error(
      "Use --candidate-id, --status validated|rejected e --notes para registrar a decisão.",
    );
  }
  if (status !== "validated" && status !== "rejected") {
    throw new Error("--status deve ser validated ou rejected.");
  }

  const result = await recordHumanDecision(getDatabase(), {
    candidateId,
    status,
    notes,
    source: "user_text",
  });
  console.log(JSON.stringify(result, null, 2));
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  const command = process.argv[2];
  if (command === "import-latest") return importLatest();
  if (command === "decision") return decision();
  throw new Error("Comando esperado: import-latest ou decision.");
}

main().catch((error: unknown) => {
  console.error(`[radar-history] ${error instanceof Error ? error.message : "Erro desconhecido."}`);
  process.exitCode = 1;
});
