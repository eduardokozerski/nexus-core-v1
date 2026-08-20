import { loadEnvConfig } from "@next/env";

import { bootstrapMercadoLivreAuthorizationFromEnvironment } from "./authorization";
import { getDatabase } from "@/src/server/db/client";

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  const authorization = await bootstrapMercadoLivreAuthorizationFromEnvironment(getDatabase());
  console.log(JSON.stringify({ migration: "success", sellerId: authorization.sellerId, expiresAt: authorization.expiresAt.toISOString() }, null, 2));
}

main().catch((error: unknown) => {
  console.error(`[meli-auth-bootstrap] ${error instanceof Error ? error.message : "Erro desconhecido."}`);
  process.exitCode = 1;
});
