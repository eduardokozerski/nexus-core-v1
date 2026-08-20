import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { MercadoLivreRadarReport } from "./radar-types";
import type { ProductViabilityPreview } from "./product-viability-types";

const DEFAULT_DIRECTORY = "research-data/mercadolivre-api";

export interface PersistedProductViabilityPreview {
  runPath: string;
  latestPath: string;
}

function isRadarReport(value: unknown): value is MercadoLivreRadarReport {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return record.schemaVersion === 1 && Array.isArray(record.candidates);
}

export async function loadRadarReport(
  filePath = path.resolve(DEFAULT_DIRECTORY, "latest", "radar.json"),
): Promise<MercadoLivreRadarReport> {
  const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
  if (!isRadarReport(parsed)) throw new Error(`Radar JSON inválido: ${filePath}`);
  return parsed;
}

async function replaceFileAtomically(filePath: string, contents: string): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryPath, contents, { encoding: "utf8", flag: "w" });
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function persistProductViabilityPreview(
  preview: ProductViabilityPreview,
  baseDirectory = DEFAULT_DIRECTORY,
): Promise<PersistedProductViabilityPreview> {
  const runsDirectory = path.resolve(baseDirectory, "viability-runs");
  const latestDirectory = path.resolve(baseDirectory, "latest");
  await Promise.all([
    mkdir(runsDirectory, { recursive: true }),
    mkdir(latestDirectory, { recursive: true }),
  ]);

  const timestamp = preview.generatedAt.replace(/[:.]/g, "-");
  const runPath = path.join(runsDirectory, `${timestamp}-product-viability.json`);
  const latestPath = path.join(latestDirectory, "radar-product-viability-preview.json");
  const contents = `${JSON.stringify(preview, null, 2)}\n`;

  await writeFile(runPath, contents, { encoding: "utf8", flag: "wx" });
  await replaceFileAtomically(latestPath, contents);
  return { runPath, latestPath };
}
