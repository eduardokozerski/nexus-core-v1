import Link from "next/link";

import { StatusBadge } from "@/app/components/status-badge";
import { ACTIONABLE_VIABILITY_STATUS } from "@/src/server/marketplace/actionable-queue";
import { getDatabase } from "@/src/server/db/client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const db = getDatabase();
  const actionableSnapshotWhere = {
    viabilityStatus: ACTIONABLE_VIABILITY_STATUS,
    collectionRun: { searchTerm: { strategy: "RADAR_DISCOVERY" as const } },
  };
  const actionableListingWhere = {
    humanDecisions: { none: {} },
    snapshots: { some: actionableSnapshotWhere },
  };
  const [categoryCount, runs, candidates, recentRuns, topListings] = await Promise.all([
    db.radarCategory.count({
      where: {
        isLeaf: true,
        status: { in: ["PRIORITY", "EXPLORATORY"] },
      },
    }),
    db.collectionRun.count({ where: { searchTerm: { strategy: "RADAR_DISCOVERY" } } }),
    db.listing.count({ where: actionableListingWhere }),
    db.collectionRun.findMany({
      where: { searchTerm: { strategy: "RADAR_DISCOVERY" } },
      take: 5,
      orderBy: { startedAt: "desc" },
      include: { _count: { select: { snapshots: true } } },
    }),
    db.listing.findMany({
      where: actionableListingWhere,
      take: 5,
      orderBy: { updatedAt: "desc" },
      include: {
        snapshots: {
          where: actionableSnapshotWhere,
          take: 1,
          orderBy: [
            { opportunityScore: "desc" },
            { collectedAt: "desc" },
          ],
          include: {
            collectionRun: { include: { searchTerm: true } },
            radarCategory: true,
          },
        },
      },
    }),
  ]);
  const topCandidates = topListings.flatMap((listing) =>
    listing.snapshots.map((snapshot) => ({ ...snapshot, listing })),
  );

  return <>
    <header className="page-header"><div><p className="eyebrow">Radar de oportunidades</p><h1>Visão geral</h1><p className="muted">Categorias e rankings oficiais organizados para sua validação manual.</p></div><Link href="/search-terms" className="button button-primary">Abrir radar</Link></header>
    <div className="notice"><strong>Como ler estes dados</strong><span>As pontuações organizam sinais públicos. Não representam quantidade de vendas nem garantia de oportunidade.</span></div>
    <section className="metrics"><article><span>Categorias no portfólio</span><strong>{categoryCount}</strong></article><article><span>Execuções do radar</span><strong>{runs}</strong></article><article><span>Na fila acionável</span><strong>{candidates}</strong></article></section>
    <section className="grid-two">
      <div className="panel"><div className="panel-title"><div><h2>Execuções recentes</h2><p>Últimos radares de categoria</p></div><Link href="/runs">Ver todas</Link></div>{recentRuns.length === 0 ? <Empty /> : <div className="list">{recentRuns.map((run) => <Link className="list-row" href={`/runs/${run.id}`} key={run.id}><div><strong>Radar de categorias</strong><span>{run._count.snapshots} candidatos · {formatDate(run.startedAt)}</span></div><StatusBadge value={run.status} /></Link>)}</div>}</div>
      <div className="panel"><div className="panel-title"><div><h2>Próximos para avaliar</h2><p>Itens novos que passaram na triagem</p></div><Link href="/candidates">Ver todos</Link></div>{topCandidates.length === 0 ? <Empty /> : <div className="list">{topCandidates.map((item) => <div className="list-row" key={item.id}><div><strong>{item.listing.title}</strong><span>{item.radarCategory?.name ?? "Categoria não identificada"} · posição {item.searchPosition ?? "—"}</span></div><span className="score">{item.opportunityScore ?? "—"}</span></div>)}</div>}</div>
    </section>
  </>;
}

function Empty() { return <div className="empty">Nenhum candidato acionável no momento.</div>; }
function formatDate(value: Date) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(value); }
