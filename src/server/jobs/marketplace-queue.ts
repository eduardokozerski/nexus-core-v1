import { Queue } from "bullmq";
import { z } from "zod";

import { createRedisConnection } from "./connection";

export const MARKETPLACE_QUEUE_NAME = "marketplace";
export const MARKETPLACE_RADAR_JOB_NAME = "marketplace.radar";
export const marketplaceRadarJobSchema = z.object({
  collectionRunId: z.string().uuid(),
}).strict();
export type MarketplaceRadarJob = z.infer<typeof marketplaceRadarJobSchema>;

const globalJobs = globalThis as unknown as { marketplaceQueue?: Queue<MarketplaceRadarJob> };

function getMarketplaceQueue(): Queue<MarketplaceRadarJob> {
  if (globalJobs.marketplaceQueue) return globalJobs.marketplaceQueue;
  const queue = new Queue<MarketplaceRadarJob>(MARKETPLACE_QUEUE_NAME, {
    connection: createRedisConnection(),
    defaultJobOptions: {
      // Request-level retries already use backoff. Repeating a full radar run
      // would duplicate a large volume of successful API calls.
      attempts: 1,
      removeOnComplete: { age: 604_800, count: 1_000 },
      removeOnFail: { age: 2_592_000, count: 1_000 },
    },
  });
  globalJobs.marketplaceQueue = queue;
  return queue;
}

export async function enqueueMarketplaceRadar(collectionRunId: string) {
  const data = marketplaceRadarJobSchema.parse({ collectionRunId });
  return getMarketplaceQueue().add(
    MARKETPLACE_RADAR_JOB_NAME,
    data,
    {
      jobId: `marketplace-radar-${collectionRunId}`,
    },
  );
}
