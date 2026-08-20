import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { storeMercadoLivreAuthorization } from "@/src/lib/mercado-livre/authorization";
import { exchangeMercadoLivreAuthorizationCode } from "@/src/lib/mercado-livre/refresh-access-token";
import { getDatabase } from "@/src/server/db/client";

const STATE_COOKIE = "nexus_meli_oauth_state";

function statesMatch(received: string | null, expected: string | undefined): boolean {
  if (!received || !expected) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function redirectToSettings(request: NextRequest, parameter: "success" | "error", value: string) {
  const redirectUrl = new URL("/settings/integration", request.url);
  redirectUrl.searchParams.set(parameter, value);
  const response = NextResponse.redirect(redirectUrl);
  response.cookies.delete({ name: STATE_COOKIE, path: "/api" });
  return response;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const state = requestUrl.searchParams.get("state");
  const code = requestUrl.searchParams.get("code");
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;

  if (!statesMatch(state, expectedState) || !code) {
    return redirectToSettings(request, "error", "authorization_denied");
  }

  try {
    const tokens = await exchangeMercadoLivreAuthorizationCode(code);
    await storeMercadoLivreAuthorization(getDatabase(), tokens);
    return redirectToSettings(request, "success", "connected");
  } catch {
    return redirectToSettings(request, "error", "authorization_failed");
  }
}
