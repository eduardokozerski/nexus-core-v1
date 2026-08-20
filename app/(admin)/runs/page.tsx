import Link from "next/link";
import { AutoRefresh } from "@/app/components/auto-refresh";
import { StatusBadge } from "@/app/components/status-badge";
import { getDatabase } from "@/src/server/db/client";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const runs = await getDatabase().collectionRun.findMany({ take: 100, orderBy: { startedAt: "desc" }, include: { searchTerm: true, _count: { select: { snapshots: true } } } });
  const hasActiveRun = runs.some((run) => run.status === "PENDING" || run.status === "RUNNING");
  return <><header className="page-header"><div><p className="eyebrow">Histórico auditável</p><h1>Execuções</h1><p className="muted">Consulte resultados, limitações e erros de cada coleta oficial.</p><AutoRefresh enabled={hasActiveRun} /></div></header><section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Termo</th><th>Status</th><th>Resultados</th><th>Fonte</th><th>Início</th><th></th></tr></thead><tbody>{runs.map((run) => <tr key={run.id}><td><strong>{run.searchTerm.keyword}</strong></td><td><StatusBadge value={run.status} /></td><td>{run._count.snapshots}</td><td>API oficial</td><td>{formatDate(run.startedAt)}</td><td><Link href={`/runs/${run.id}`}>Detalhes</Link></td></tr>)}</tbody></table></div>{runs.length === 0 && <div className="empty">Nenhuma execução registrada.</div>}</section></>;
}
function formatDate(value: Date) { return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(value); }
