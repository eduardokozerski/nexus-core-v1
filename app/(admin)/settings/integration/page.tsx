import Link from "next/link";

import { getMercadoLivreAuthorizationStatus } from "@/src/lib/mercado-livre/authorization";
import { getDatabase } from "@/src/server/db/client";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null) {
  return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(value) : "—";
}

export default async function IntegrationSettingsPage({
  searchParams,
}: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const [authorization, params] = await Promise.all([
    getMercadoLivreAuthorizationStatus(getDatabase()),
    searchParams,
  ]);
  const needsAuthorization = !authorization || authorization.status !== "ACTIVE";
  return <>
    <header className="page-header"><div><p className="eyebrow">Integração</p><h1>Mercado Livre</h1><p className="muted">A credencial é renovada automaticamente antes de o radar usar a API oficial.</p></div></header>
    {params.success === "connected" ? <div className="notice"><strong>Conta conectada</strong><span>A nova autorização foi armazenada com segurança.</span></div> : null}
    {params.error ? <div className="notice"><strong>Não foi possível concluir a autorização</strong><span>Confira a configuração OAuth e tente conectar novamente.</span></div> : null}
    <section className="panel"><div className="panel-title"><div><h2>Status da conexão</h2><p>Os tokens não são exibidos nesta tela.</p></div><span className={`badge ${needsAuthorization ? "badge-failed" : "badge-active"}`}>{needsAuthorization ? "Requer autorização" : "Ativa"}</span></div>
      <div className="list">
        <div className="list-row"><div><strong>Conta conectada</strong><span>{authorization?.sellerId ?? "Nenhuma conta conectada"}</span></div></div>
        <div className="list-row"><div><strong>Token atual expira em</strong><span>{formatDate(authorization?.accessTokenExpiresAt ?? null)}</span></div></div>
        <div className="list-row"><div><strong>Última renovação</strong><span>{formatDate(authorization?.lastRefreshAt ?? null)}</span></div></div>
      </div>
      {authorization?.lastRefreshError ? <p className="muted">{authorization.lastRefreshError}</p> : null}
      <div className="actions-row"><Link href="/api/ml/authorization/start" className="button button-primary">{needsAuthorization ? "Conectar Mercado Livre" : "Reconectar conta"}</Link></div>
    </section>
  </>;
}
