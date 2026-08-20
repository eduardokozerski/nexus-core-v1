import Link from "next/link";

import {
  removeRadarPreferenceAction,
  saveRadarPreferenceAction,
  setRadarCategoryStatusAction,
  startRadarCollectionAction,
  toggleRadarPreferenceAction,
} from "@/app/actions";
import { StatusBadge } from "@/app/components/status-badge";
import {
  RADAR_EXPLORATORY_CATEGORY_SLOTS,
  RADAR_PRIORITY_CATEGORY_SLOTS,
  radarCategoryDashboard,
  selectRadarCategoryPortfolio,
} from "@/src/server/marketplace/mercadolivre/api/category-portfolio";
import { RADAR_HIGHLIGHT_LIMIT_PER_DIMENSION } from "@/src/server/marketplace/mercadolivre/api/radar-config";
import { getDatabase } from "@/src/server/db/client";

export const dynamic = "force-dynamic";

const PORTFOLIO_PAGE_SIZE = 20;
const RECENT_RUNS_LIMIT = 8;

const focusLabels = {
  HOME: "Casa",
  MOBILE: "Celular",
  TOYS: "Brinquedos",
} as const;

const statusLabels = {
  EXPLORATORY: "Exploratória",
  PRIORITY: "Prioritária",
  PAUSED: "Pausada",
  DISCARDED: "Descartada",
} as const;

export default async function RadarCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ categoryPage?: string; error?: string; success?: string }>;
}) {
  const database = getDatabase();
  const [runs, preferences, categories, message] = await Promise.all([
    database.collectionRun.findMany({
      where: { searchTerm: { strategy: "RADAR_DISCOVERY" } },
      orderBy: { startedAt: "desc" },
      take: RECENT_RUNS_LIMIT,
      include: { _count: { select: { snapshots: true } } },
    }),
    database.radarPreference.findMany({
      where: { kind: "BANNED" },
      orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    }),
    radarCategoryDashboard(database),
    searchParams,
  ]);
  const leafCategories = categories.filter((category) => category.isLeaf === true);
  const planned = selectRadarCategoryPortfolio(leafCategories);
  const requestedPage = Number(message.categoryPage);
  const categoryPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const portfolioPageCount = Math.max(1, Math.ceil(leafCategories.length / PORTFOLIO_PAGE_SIZE));
  const currentPortfolioPage = Math.min(categoryPage, portfolioPageCount);
  const portfolioStart = (currentPortfolioPage - 1) * PORTFOLIO_PAGE_SIZE;
  const visibleLeafCategories = leafCategories.slice(portfolioStart, portfolioStart + PORTFOLIO_PAGE_SIZE);
  const plannedIds = new Set(planned.dimensions.map((dimension) => dimension.categoryId));
  const feedbackByCategoryId = new Map(categories.map((category) => [category.id, category.feedback]));

  return <>
    <header className="page-header">
      <div>
        <p className="eyebrow">Mercado Livre · descoberta por categoria</p>
        <h1>Radar de categorias</h1>
        <p className="muted">Cada execução combina categorias com bom histórico e categorias-folha novas da árvore oficial. Nenhuma frase de produto é pesquisada.</p>
      </div>
      <form action={startRadarCollectionAction}><button className="button button-primary">Executar radar</button></form>
    </header>
    {message.error && <div className="alert alert-error">{message.error}</div>}
    {message.success && <div className="alert alert-success">{message.success}</div>}

    <div className="notice"><strong>{RADAR_PRIORITY_CATEGORY_SLOTS} conhecidas + {RADAR_EXPLORATORY_CATEGORY_SLOTS} novas</strong><span>Até {RADAR_HIGHLIGHT_LIMIT_PER_DIMENSION} destaques oficiais por categoria. Validações aumentam a prioridade; três rejeições sem validação pausam a categoria.</span></div>

    <section className="panel form-panel">
      <div><h2>Proteções por termo</h2><p>Termos servem somente para impedir produtos indesejados dentro das categorias. Eles nunca são usados para procurar ou priorizar produtos.</p></div>
      <form action={saveRadarPreferenceAction} className="term-form">
        <label>Termo ou frase banida<input name="term" required minLength={2} maxLength={100} placeholder="Ex.: guarda-roupa" /></label>
        <label>Motivo opcional<input name="reason" maxLength={300} placeholder="Ex.: produto grande demais" /></label>
        <button className="button button-primary">Adicionar bloqueio</button>
      </form>
    </section>

    <section className="panel table-panel">
      <div className="panel-title"><div><h2>Próxima varredura</h2><p>{planned.dimensions.length} categoria(s) já selecionada(s) para a próxima execução.</p></div></div>
      <div className="table-scroll"><table><thead><tr><th>Categoria</th><th>Área</th><th>Papel</th><th>Histórico</th></tr></thead><tbody>
        {[...planned.priority, ...planned.exploratory].map((category) => <tr key={category.id}><td><strong>{category.name}</strong><small>{category.externalId}</small></td><td>{focusLabels[category.focusArea]}</td><td><span className={`badge ${category.status === "PRIORITY" ? "badge-validated" : "badge-running"}`}>{category.status === "PRIORITY" ? "Conhecida" : "Nova descoberta"}</span></td><td>{feedbackByCategoryId.get(category.id)?.validated ?? 0} validação(ões) · {feedbackByCategoryId.get(category.id)?.rejected ?? 0} rejeição(ões)</td></tr>)}
      </tbody></table></div>
      {planned.dimensions.length === 0 && <div className="empty">O catálogo de categorias será preparado na primeira execução do radar.</div>}
    </section>

    <section className="panel table-panel">
      <div className="panel-title"><div><h2>Termos bloqueados</h2><p>{preferences.filter((preference) => preference.active).length} proteção(ões) ativa(s).</p></div></div>
      <div className="table-scroll"><table><thead><tr><th>Termo</th><th>Motivo</th><th>Status</th><th>Ação</th></tr></thead><tbody>
        {preferences.map((preference) => <tr key={preference.id}><td><strong>{preference.term}</strong></td><td>{preference.reason ?? "—"}</td><td>{preference.active ? "Ativa" : "Pausada"}</td><td><div className="actions"><form action={toggleRadarPreferenceAction}><input type="hidden" name="id" value={preference.id} /><input type="hidden" name="active" value={String(!preference.active)} /><button className="link-button">{preference.active ? "Pausar" : "Ativar"}</button></form><form action={removeRadarPreferenceAction}><input type="hidden" name="id" value={preference.id} /><button className="link-button danger">Remover</button></form></div></td></tr>)}
      </tbody></table></div>
    </section>

    <section className="panel table-panel">
      <div className="panel-title"><div><h2>Execuções do radar</h2><p>{runs.length} execução(ões) recentes</p></div></div>
      <div className="table-scroll"><table><thead><tr><th>Status</th><th>Candidatos</th><th>Início</th></tr></thead><tbody>{runs.map((run) => <tr key={run.id}><td><StatusBadge value={run.status} /></td><td>{run._count.snapshots}</td><td>{formatDate(run.startedAt)}</td></tr>)}</tbody></table></div>
      {runs.length === 0 && <div className="empty">O radar ainda não foi executado.</div>}
    </section>

    <section className="panel table-panel">
      <div className="panel-title"><div><h2>Portfólio de categorias</h2><p>{leafCategories.length} categoria(s)-folha descobertas; exibindo somente o recorte atual.</p></div></div>
      <div className="table-scroll"><table><thead><tr><th>Categoria</th><th>Área</th><th>Status</th><th>Resultados</th><th>Feedback</th><th>Próxima?</th><th>Ação</th></tr></thead><tbody>
        {visibleLeafCategories.map((category) => <tr key={category.id}><td><strong>{category.name}</strong><small>{category.externalId}</small></td><td>{focusLabels[category.focusArea]}</td><td>{statusLabels[category.status]}</td><td>{category.candidateCount} candidato(s) em {category.scanCount} varredura(s)</td><td>{category.feedback.validated} aprovados · {category.feedback.rejected} rejeitados</td><td>{plannedIds.has(category.externalId) ? <span className="badge badge-running">Sim</span> : "—"}</td><td><div className="actions">{category.status === "EXPLORATORY" && <form action={setRadarCategoryStatusAction}><input type="hidden" name="id" value={category.id} /><input type="hidden" name="status" value="PRIORITY" /><button className="link-button">Priorizar categoria</button></form>}<form action={setRadarCategoryStatusAction}><input type="hidden" name="id" value={category.id} /><input type="hidden" name="status" value={category.status === "PAUSED" ? "EXPLORATORY" : "PAUSED"} /><button className={`link-button ${category.status === "PAUSED" ? "" : "danger"}`}>{category.status === "PAUSED" ? "Retomar" : "Pausar"}</button></form></div></td></tr>)}
      </tbody></table></div>
      {leafCategories.length === 0 ? <div className="empty">Nenhuma categoria-folha está disponível ainda.</div> : <div className="section-summary"><span>Mostrando {portfolioStart + 1}–{Math.min(portfolioStart + PORTFOLIO_PAGE_SIZE, leafCategories.length)} de {leafCategories.length} categorias.</span><nav aria-label="Páginas do portfólio de categorias">{currentPortfolioPage > 1 && <Link className="button button-small" href={`/search-terms?categoryPage=${currentPortfolioPage - 1}`}>Anterior</Link>}<span>Página {currentPortfolioPage} de {portfolioPageCount}</span>{currentPortfolioPage < portfolioPageCount && <Link className="button button-small" href={`/search-terms?categoryPage=${currentPortfolioPage + 1}`}>Próxima</Link>}</nav></div>}
    </section>
  </>;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(value);
}
