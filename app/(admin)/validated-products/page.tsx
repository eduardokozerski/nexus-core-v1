import Link from "next/link";

import { CopyLink } from "@/app/components/copy-link";
import { getDatabase } from "@/src/server/db/client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function ValidatedProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const query = await searchParams;
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const listingWhere = {
    humanDecisions: {
      some: { status: "VALIDATED" as const },
    },
    ...(query.q
      ? { title: { contains: query.q, mode: "insensitive" as const } }
      : {}),
  };
  const database = getDatabase();
  const [listings, total] = await Promise.all([
    database.listing.findMany({
      where: listingWhere,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      orderBy: { updatedAt: "desc" },
      include: {
        humanDecisions: {
          where: { status: "VALIDATED" },
          take: 1,
          orderBy: { decidedAt: "desc" },
          include: { radarCategory: true },
        },
        snapshots: {
          take: 1,
          orderBy: { collectedAt: "desc" },
          include: { score: true },
        },
      },
    }),
    database.listing.count({ where: listingWhere }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Portfólio aprovado</p>
          <h1>Produtos validados</h1>
          <p className="muted">Itens aprovados manualmente para seguir na pesquisa de modelos imprimíveis.</p>
        </div>
        <Link href="/candidates" className="button button-primary">Ver candidatos</Link>
      </header>

      <div className="notice">
        <strong>Validação manual</strong>
        <span>Esta lista mostra decisões do time. A validação não representa vendas confirmadas ou garantia comercial.</span>
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
                <th>Produto</th>
                <th>Categoria</th>
                <th>Dados da coleta</th>
                <th>Score</th>
                <th>Validação</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => {
                const decision = listing.humanDecisions[0];
                const snapshot = listing.snapshots[0];
                const url = listing.listingUrl ?? listing.url;

                return (
                  <tr key={listing.id}>
                    <td>
                      <strong>{listing.title}</strong>
                      <small>{listing.sellerName ?? "Vendedor não informado"}</small>
                    </td>
                    <td>{decision?.radarCategory?.name ?? "—"}</td>
                    <td>
                      <small>Preço: {snapshot?.price?.toString() ?? "indisponível"}<br />
                      Avaliações: {snapshot?.reviewCount ?? "indisponível"}</small>
                    </td>
                    <td><span className="score">{snapshot?.score?.totalScore ?? snapshot?.opportunityScore ?? "—"}</span></td>
                    <td>
                      <span className="badge badge-validated">Validado</span>
                      <small>{formatDate(decision?.decidedAt)}{decision?.notes ? ` · ${decision.notes}` : ""}</small>
                    </td>
                    <td>
                      {url ? <div className="actions"><a href={url} target="_blank" rel="noreferrer">Abrir</a><CopyLink value={url} /></div> : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {listings.length === 0 && <div className="empty">Nenhum produto validado encontrado.</div>}
        <div className="pagination">
          <span>Página {page} de {pages} · {total} produto(s) validado(s)</span>
          <div>
            {page > 1 && <Link className="button button-small" href={`/validated-products?page=${page - 1}&q=${encodeURIComponent(query.q ?? "")}`}>Anterior</Link>}
            {page < pages && <Link className="button button-small" href={`/validated-products?page=${page + 1}&q=${encodeURIComponent(query.q ?? "")}`}>Próxima</Link>}
          </div>
        </div>
      </section>
    </>
  );
}

function formatDate(value: Date | undefined) {
  if (!value) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(value);
}
