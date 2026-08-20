import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/src/server/auth/session";
import { getDatabase } from "@/src/server/db/client";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireApiSession())) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const item = await getDatabase().searchTerm.findUnique({ where: { id: (await params).id }, include: { collectionRuns: { orderBy: { startedAt: "desc" } } } });
  return item ? NextResponse.json(item) : NextResponse.json({ error: "Termo não encontrado." }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireApiSession())) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const parsed = z.object({ status: z.enum(["ACTIVE", "PAUSED"]), notes: z.string().trim().max(500).nullable().optional() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  try { return NextResponse.json(await getDatabase().searchTerm.update({ where: { id: (await params).id }, data: parsed.data })); }
  catch { return NextResponse.json({ error: "Termo não encontrado." }, { status: 404 }); }
}
