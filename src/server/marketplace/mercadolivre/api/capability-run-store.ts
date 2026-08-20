import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { MercadoLivreCapabilityProbeReport } from "./capability-types";

const DEFAULT_DIRECTORY = "research-data/mercadolivre-api";

export interface PersistedCapabilityProbe {
  runPath: string;
  latestPath: string;
}

function timestampForFile(isoTimestamp: string): string {
  return isoTimestamp.replace(/[:.]/g, "-");
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

export async function persistCapabilityProbe(
  report: MercadoLivreCapabilityProbeReport,
  baseDirectory = DEFAULT_DIRECTORY,
): Promise<PersistedCapabilityProbe> {
  const runsDirectory = path.resolve(baseDirectory, "runs");
  const latestDirectory = path.resolve(baseDirectory, "latest");
  await Promise.all([
    mkdir(runsDirectory, { recursive: true }),
    mkdir(latestDirectory, { recursive: true }),
  ]);

  const fileName = `${timestampForFile(report.startedAt)}-${report.siteId}-capabilities-${report.status}.json`;
  const runPath = path.join(runsDirectory, fileName);
  const latestPath = path.join(latestDirectory, "capabilities.json");
  const contents = `${JSON.stringify(report, null, 2)}\n`;

  await writeFile(runPath, contents, { encoding: "utf8", flag: "wx" });
  await replaceFileAtomically(latestPath, contents);

  return { runPath, latestPath };
}
