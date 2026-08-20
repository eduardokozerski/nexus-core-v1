import { NextResponse } from "next/server";

import { requireApiSession } from "@/src/server/auth/session";
import { getDatabase } from "@/src/server/db/client";
import {
  createOrReusePendingRadarRun,
  markRadarRunFailed,
} from "@/src/server/history/radar-history";
import { enqueueMarketplaceRadar } from "@/src/server/jobs/marketplace-queue";

export async function POST() {
  if (!(await requireApiSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const database = getDatabase();
  const pending = await createOrReusePendingRadarRun(database);
  if (!pending.created) {
    return NextResponse.json({
      collectionRunId: pending.collectionRunId,
      status: "already_queued",
    }, { status: 202 });
  }

  try {
    const job = await enqueueMarketplaceRadar(pending.collectionRunId);
    return NextResponse.json({
      jobId: job.id,
      collectionRunId: pending.collectionRunId,
      status: "queued",
    }, { status: 202 });
  } catch (error) {
    await markRadarRunFailed(database, pending.collectionRunId, error);
    const message = error instanceof Error ? error.message : "Unable to schedule the category radar.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
