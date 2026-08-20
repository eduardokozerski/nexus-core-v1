import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { MercadoLivreDimensionCoverageReport } from "./dimension-coverage-types";

const DEFAULT_DIRECTORY = "research-data/mercadolivre-api";

export interface PersistedDimensionCoverage {
  runPath: string;
  latestPath: string;
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

export async function persistDimensionCoverage(
  report: MercadoLivreDimensionCoverageReport,
  baseDirectory = DEFAULT_DIRECTORY,
): Promise<PersistedDimensionCoverage> {
  const runsDirectory = path.resolve(baseDirectory, "coverage-runs");
  const latestDirectory = path.resolve(baseDirectory, "latest");
  await Promise.all([
    mkdir(runsDirectory, { recursive: true }),
    mkdir(latestDirectory, { recursive: true }),
  ]);

  const timestamp = report.startedAt.replace(/[:.]/g, "-");
  const runPath = path.join(
    runsDirectory,
    `${timestamp}-${report.siteId}-dimension-coverage-${report.status}.json`,
  );
  const latestPath = path.join(latestDirectory, "dimension-coverage.json");
  const contents = `${JSON.stringify(report, null, 2)}\n`;

  await writeFile(runPath, contents, { encoding: "utf8", flag: "wx" });
  await replaceFileAtomically(latestPath, contents);

  return { runPath, latestPath };
}
