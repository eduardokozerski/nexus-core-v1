import { NextResponse } from "next/server";
import { requireApiSession } from "@/src/server/auth/session";
import { getDatabase } from "@/src/server/db/client";

export async function GET(request: Request) {
  if (!(await requireApiSession())) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const page = Math.max(1, Number(new URL(request.url).searchParams.get("page")) || 1);
  const pageSize = 20;
  const [items, total] = await Promise.all([
    getDatabase().collectionRun.findMany({ skip: (page - 1) * pageSize, take: pageSize, orderBy: { startedAt: "desc" }, include: { searchTerm: true, _count: { select: { snapshots: true } } } }),
    getDatabase().collectionRun.count(),
  ]);
  return NextResponse.json({ items, page, pageSize, total });
}
