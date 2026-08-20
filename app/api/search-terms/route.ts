import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/src/server/auth/session";
import { getDatabase } from "@/src/server/db/client";
import { normalizeSearchTerm } from "@/src/server/history/radar-history";

export async function GET() {
  if (!(await requireApiSession())) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const items = await getDatabase().searchTerm.findMany({ orderBy: { updatedAt: "desc" }, include: { _count: { select: { collectionRuns: true } } } });
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  if (!(await requireApiSession())) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const parsed = z.object({ keyword: z.string().trim().min(2).max(120), notes: z.string().trim().max(500).optional() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Payload inválido.", details: parsed.error.flatten() }, { status: 400 });
  const normalizedKeyword = normalizeSearchTerm(parsed.data.keyword);
  const item = await getDatabase().searchTerm.upsert({
    where: { marketplace_normalizedKeyword_strategy: { marketplace: "MERCADO_LIVRE", normalizedKeyword, strategy: "KEYWORD_SEARCH" } },
    create: { marketplace: "MERCADO_LIVRE", keyword: parsed.data.keyword, normalizedKeyword, notes: parsed.data.notes },
    update: { keyword: parsed.data.keyword, notes: parsed.data.notes, status: "ACTIVE" },
  });
  return NextResponse.json(item, { status: 201 });
}
