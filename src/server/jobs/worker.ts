import { Worker } from "bullmq";
import { loadEnvConfig } from "@next/env";

import { getDatabase } from "@/src/server/db/client";
import { markRadarRunFailed } from "@/src/server/history/radar-history";
import { ensureMercadoLivreAccessToken } from "@/src/lib/mercado-livre/authorization";
import { runOfficialMercadoLivreRadar } from "@/src/server/marketplace/mercadolivre/api/radar-service";

import { createRedisConnection } from "./connection";
import {
  MARKETPLACE_QUEUE_NAME,
  MARKETPLACE_RADAR_JOB_NAME,
  marketplaceRadarJobSchema,
  type MarketplaceRadarJob,
} from "./marketplace-queue";

loadEnvConfig(process.cwd());

const connection = createRedisConnection();
connection.on("error", (error) => {
  console.error("[jobs] Redis unavailable. Start Redis and restart the worker.", error.message);
});

const worker = new Worker<MarketplaceRadarJob>(MARKETPLACE_QUEUE_NAME, async (job) => {
  if (job.name !== MARKETPLACE_RADAR_JOB_NAME) {
    throw new Error(`Unsupported job type: ${job.name}`);
  }
  const data = marketplaceRadarJobSchema.parse(job.data);
  const database = getDatabase();

  // Renova pelo OAuth oficial somente quando a credencial estiver próxima do vencimento.
  // Isso ocorre antes de qualquer chamada de coleta do radar.
  console.info("[jobs] marketplace.radar started", {
    jobId: job.id,
    collectionRunId: data.collectionRunId,
  });
  await database.collectionRun.update({
    where: { id: data.collectionRunId },
    data: {
      status: "RUNNING",
      startedAt: new Date(),
      finishedAt: null,
      errorMessage: null,
    },
  });

  try {
    await ensureMercadoLivreAccessToken(database);
    const result = await runOfficialMercadoLivreRadar(
      database,
      data.collectionRunId,
    );
    console.info("[jobs] marketplace.radar completed", {
      jobId: job.id,
      collectionRunId: result.persistence.collectionRunId,
      status: result.report.status,
    });
    return {
      collectionRunId: result.persistence.collectionRunId,
      status: result.report.status,
    };
  } catch (error) {
    await markRadarRunFailed(database, data.collectionRunId, error);
    throw error;
  }
}, { connection, concurrency: 1 });

worker.on("failed", (job, error) => {
  console.error("[jobs] marketplace.radar failed", { jobId: job?.id, error: error.message });
});

let stoppingAfterRedisError = false;
worker.on("error", (error) => {
  if (stoppingAfterRedisError) return;
  stoppingAfterRedisError = true;
  console.error("[jobs] worker stopped due to Redis error.", error.message);
  void worker.close().finally(() => {
    void connection.quit().catch(() => undefined).finally(() => process.exit(1));
  });
});

async function shutdown(signal: string) {
  console.info(`[jobs] shutting down worker (${signal})`);
  await worker.close();
  await connection.quit();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
console.info("[jobs] worker started", { queue: MARKETPLACE_QUEUE_NAME, concurrency: 1 });
