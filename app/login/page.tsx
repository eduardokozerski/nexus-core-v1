import { redirect } from "next/navigation";
import Image from "next/image";
import { loginAction } from "@/app/actions";
import { ThemeToggle } from "@/app/components/theme-toggle";
import { getSession } from "@/src/server/auth/session";
import darkLogo from "@/nxc-logo.png";
import lightLogo from "@/nxc-logo-b.png";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getSession()) redirect("/dashboard");
  const { error } = await searchParams;
  return (
    <main className="login-page">
      <ThemeToggle className="login-theme-toggle" />
      <section className="login-card">
        <div className="login-brand">
          <Image alt="Nexus Core" className="login-logo brand-logo-light" priority src={lightLogo} />
          <Image alt="Nexus Core" className="login-logo brand-logo-dark" priority src={darkLogo} />
        </div>
        <div><p className="eyebrow">Acesso interno</p><h1>Bem-vindo de volta</h1><p className="muted">Entre para acompanhar pesquisas e validar oportunidades.</p></div>
        {error && <div className="alert alert-error">{error}</div>}
        <form action={loginAction} className="stack">
          <label>E-mail<input name="email" type="email" autoComplete="email" required /></label>
          <label>Senha<input name="password" type="password" autoComplete="current-password" required /></label>
          <button className="button button-primary" type="submit">Entrar</button>
        </form>
        <p className="fine-print">Dados públicos de oportunidade. Nenhum resultado representa vendas confirmadas.</p>
      </section>
    </main>
  );
}
