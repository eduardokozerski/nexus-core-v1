import { NextResponse } from "next/server";

import { getDatabase } from "@/src/server/db/client";
import { requireApiSession } from "@/src/server/auth/session";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await requireApiSession())) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await context.params;
  const run = await getDatabase().collectionRun.findUnique({
    where: { id },
    include: {
      searchTerm: true,
      snapshots: {
        orderBy: { searchPosition: "asc" },
        include: { listing: true, score: true },
      },
    },
  });

  if (!run) return NextResponse.json({ error: "Execução não encontrada." }, { status: 404 });

  return NextResponse.json({
    id: run.id,
    status: run.status,
    marketplace: run.marketplace,
    source: run.source,
    keyword: run.searchTerm.keyword,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    errorMessage: run.errorMessage,
    summary: run.summary,
    listings: run.snapshots.map((snapshot) => ({
      id: snapshot.listing.id,
      externalId: snapshot.listing.externalId,
      title: snapshot.listing.title,
      imageUrl: snapshot.listing.imageUrl,
      url: snapshot.listing.listingUrl ?? snapshot.listing.url,
      searchPosition: snapshot.searchPosition,
      price: snapshot.price?.toString() ?? null,
      ratingAverage: snapshot.ratingAverage?.toString() ?? null,
      reviewCount: snapshot.reviewCount,
      score: snapshot.score?.totalScore ?? null,
      reasons: snapshot.reasons,
    })),
  });
}
