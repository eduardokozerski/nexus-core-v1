import { loadEnvConfig } from "@next/env";

import { probeMercadoLivreApiCapabilities } from "./capability-probe";
import { persistCapabilityProbe } from "./capability-run-store";

function readOption(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length).trim() || undefined;

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1]?.trim() || undefined;
  return undefined;
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());

  const report = await probeMercadoLivreApiCapabilities({
    categoryId: readOption("category"),
    fallbackQuery: readOption("query"),
    log: (message) => console.error(message),
  });
  const persistence = await persistCapabilityProbe(report);

  console.log(
    JSON.stringify(
      {
        status: report.status,
        summary: report.summary,
        context: report.context,
        capabilities: report.capabilities,
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
  console.error(`[meli-api-probe] ${message}`);
  process.exitCode = 1;
});
