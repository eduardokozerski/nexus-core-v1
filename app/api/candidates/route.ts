import { NextResponse } from "next/server";
import { requireApiSession } from "@/src/server/auth/session";
import { getDatabase } from "@/src/server/db/client";

export async function GET(request: Request) {
  if (!(await requireApiSession())) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize")) || 20));
  const [items, total] = await Promise.all([
    getDatabase().listingSnapshot.findMany({ skip: (page - 1) * pageSize, take: pageSize, orderBy: [{ opportunityScore: "desc" }, { collectedAt: "desc" }], include: { listing: true, score: true, collectionRun: { include: { searchTerm: true } } } }),
    getDatabase().listingSnapshot.count(),
  ]);
  return NextResponse.json({ items: items.map((item) => ({ ...item, price: item.price?.toString() ?? null, ratingAverage: item.ratingAverage?.toString() ?? null })), page, pageSize, total });
}
