import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { requireApiSession } from "@/src/server/auth/session";

const STATE_COOKIE = "nexus_meli_oauth_state";

export async function GET(request: Request) {
  if (!(await requireApiSession())) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const clientId = process.env.MELI_CLIENT_ID?.trim();
  const redirectUri = process.env.MELI_REDIRECT_URI?.trim();
  if (!clientId || !redirectUri) {
    return NextResponse.redirect(new URL("/settings/integration?error=oauth_configuration", request.url));
  }

  const state = randomBytes(32).toString("base64url");
  const authorizationUrl = new URL("https://auth.mercadolivre.com.br/authorization");
  authorizationUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  }).toString();
  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    // O callback OAuth está em /api/auth/ml/callback; /api cobre ambas as rotas.
    path: "/api",
    maxAge: 10 * 60,
    priority: "high",
  });
  return response;
}
