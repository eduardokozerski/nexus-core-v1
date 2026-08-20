import Link from "next/link";

import { CopyLink } from "@/app/components/copy-link";
import { DecisionForm } from "@/app/components/decision-form";
import { ACTIONABLE_VIABILITY_STATUS } from "@/src/server/marketplace/actionable-queue";
import { getDatabase } from "@/src/server/db/client";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 20;

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const query = await searchParams;
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const snapshotWhere = {
    viabilityStatus: ACTIONABLE_VIABILITY_STATUS,
    collectionRun: { searchTerm: { strategy: "RADAR_DISCOVERY" as const } },
  };
  const listingWhere = {
    humanDecisions: { none: {} },
    snapshots: { some: snapshotWhere },
    ...(query.q
      ? { title: { contains: query.q, mode: "insensitive" as const } }
      : {}),
  };
  const [listings, total] = await Promise.all([
    getDatabase().listing.findMany({
      where: listingWhere,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      orderBy: { updatedAt: "desc" },
      include: {
        snapshots: {
          where: snapshotWhere,
          take: 1,
          orderBy: [
            { opportunityScore: "desc" },
            { collectedAt: "desc" },
          ],
          include: {
            collectionRun: { include: { searchTerm: true } },
            radarCategory: true,
            score: true,
          },
        },
      },
    }),
    getDatabase().listing.count({ where: listingWhere }),
  ]);
  const items = listings.flatMap((listing) =>
    listing.snapshots.map((snapshot) => ({ ...snapshot, listing })),
  );
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Fila acionável</p>
          <h1>Candidatos</h1>
          <p className="muted">
            Somente itens novos que passaram nas regras de viabilidade operacional.
          </p>
        </div>
        <a href="/api/exports/candidates.csv" className="button">
          Exportar CSV
        </a>
      </header>
      <div className="notice">
        <strong>Oportunidade, não vendas</strong>
        <span>
          Itens rejeitados, validados ou sem viabilidade permanecem no histórico,
          mas não retornam para esta fila.
        </span>
      </div>
      <section className="panel table-panel">
        <form className="filters">
          <input name="q" defaultValue={query.q} placeholder="Filtrar por título" />
          <button className="button button-small">Filtrar</button>
        </form>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Produto</th><th>Categoria descoberta</th><th>Pos.</th><th>Score</th>
                <th>Dados públicos</th><th>Link</th><th>Decisão</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.listing.title}</strong><small>Coletado em {formatDate(item.collectedAt)}</small></td>
                  <td>{item.radarCategory?.name ?? "—"}</td>
                  <td>{item.searchPosition ?? "—"}</td>
                  <td><span className="score">{item.score?.totalScore ?? "—"}</span><small>{item.score?.version}</small></td>
                  <td><small>Preço: {item.price?.toString() ?? "indisponível"}<br />Avaliações: {item.reviewCount ?? "indisponível"}</small></td>
                  <td>
                    {item.listing.url && <div className="actions"><a href={item.listing.url} target="_blank" rel="noreferrer">Abrir</a><CopyLink value={item.listing.url} /></div>}
                  </td>
                  <td><DecisionForm listingId={item.listingId} collectionRunId={item.collectionRunId} returnPath="/candidates" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {items.length === 0 && <div className="empty">Nenhum candidato novo e acionável no momento.</div>}
        <div className="pagination">
          <span>Página {page} de {pages} · {total} resultado(s)</span>
          <div>
            {page > 1 && <Link className="button button-small" href={`/candidates?page=${page - 1}&q=${encodeURIComponent(query.q ?? "")}`}>Anterior</Link>}
            {page < pages && <Link className="button button-small" href={`/candidates?page=${page + 1}&q=${encodeURIComponent(query.q ?? "")}`}>Próxima</Link>}
          </div>
        </div>
      </section>
    </>
  );
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(value);
}
