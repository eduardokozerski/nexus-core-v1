import Link from "next/link";
import { notFound } from "next/navigation";

import { AutoRefresh } from "@/app/components/auto-refresh";
import { CopyLink } from "@/app/components/copy-link";
import { DecisionForm } from "@/app/components/decision-form";
import { StatusBadge } from "@/app/components/status-badge";
import { getDatabase } from "@/src/server/db/client";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getDatabase().collectionRun.findUnique({
    where: { id },
    include: {
      searchTerm: true,
      snapshots: {
        orderBy: { searchPosition: "asc" },
        include: {
          listing: { include: { humanDecisions: { take: 1, orderBy: { decidedAt: "desc" } } } },
          radarCategory: true,
          score: true,
        },
      },
    },
  });
  if (!run) notFound();

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow"><Link href="/runs">Execuções</Link> / Detalhes</p>
          <h1>{run.searchTerm.keyword}</h1>
          <p className="muted">{formatDate(run.startedAt)} · {run.snapshots.length} resultado(s)</p>
          <AutoRefresh enabled={run.status === "PENDING" || run.status === "RUNNING"} />
        </div>
        <StatusBadge value={run.status} />
      </header>
      {run.errorMessage && <div className="alert alert-error">{run.errorMessage}</div>}
      <div className="notice"><strong>Feedback por categoria</strong><span>Validar aumenta a prioridade da categoria de origem; rejeições recorrentes podem pausá-la automaticamente.</span></div>
      <section className="panel table-panel">
        <div className="table-scroll">
          <table>
            <thead><tr><th>Pos.</th><th>Produto</th><th>Categoria</th><th>Viabilidade</th><th>Preço</th><th>Avaliações</th><th>Score</th><th>Link</th><th>Decisão</th></tr></thead>
            <tbody>
              {run.snapshots.map((snapshot) => {
                const decision = snapshot.listing.humanDecisions[0];
                return (
                  <tr key={snapshot.id}>
                    <td>{snapshot.searchPosition ?? "—"}</td>
                    <td><strong>{snapshot.listing.title}</strong><small>{snapshot.listing.externalId}</small></td>
                    <td>{snapshot.radarCategory?.name ?? "—"}</td>
                    <td>{formatViability(snapshot.viabilityStatus)}</td>
                    <td>{snapshot.price?.toString() ?? "Indisponível"}</td>
                    <td>{snapshot.reviewCount ?? "Indisponível"}</td>
                    <td><span className="score">{snapshot.score?.totalScore ?? "—"}</span><small>{snapshot.score?.version ?? "Sem score"}</small></td>
                    <td>{snapshot.listing.url ? <div className="actions"><a href={snapshot.listing.url} target="_blank" rel="noreferrer">Abrir</a><CopyLink value={snapshot.listing.url} /></div> : "Indisponível"}</td>
                    <td>
                      {decision ? <span className={`badge badge-${decision.status.toLowerCase()}`}>{decision.status === "VALIDATED" ? "Validado" : "Rejeitado"}</span> : <DecisionForm listingId={snapshot.listingId} collectionRunId={snapshot.collectionRunId} returnPath={`/runs/${id}`} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

function formatViability(status: string | null) {
  if (status === "ready_for_manual_validation") return "Pronto para validação";
  if (status === "not_viable_for_portfolio") return "Não viável";
  if (status === "insufficient_market_data") return "Dados insuficientes";
  if (status === "manual_viability_review") return "Revisão manual";
  return "Não classificado";
}
