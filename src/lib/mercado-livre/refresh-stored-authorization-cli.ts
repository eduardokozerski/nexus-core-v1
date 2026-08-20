import { loadEnvConfig } from "@next/env";

import { refreshStoredMercadoLivreAccessToken } from "./authorization";
import { getDatabase } from "@/src/server/db/client";

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  const token = await refreshStoredMercadoLivreAccessToken(getDatabase());
  console.log(JSON.stringify({ refresh: "success", persisted: true, expiresAt: token.expiresAt.toISOString() }, null, 2));
}

main().catch((error: unknown) => {
  console.error(`[meli-auth-refresh] ${error instanceof Error ? error.message : "Erro desconhecido."}`);
  process.exitCode = 1;
});
