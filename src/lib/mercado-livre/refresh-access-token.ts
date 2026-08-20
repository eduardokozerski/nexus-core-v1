export type MercadoLivreTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  user_id: number;
  refresh_token: string;
};

export async function refreshMercadoLivreAccessToken(
  refreshToken: string,
): Promise<MercadoLivreTokenResponse> {
  const clientId = process.env.MELI_CLIENT_ID;
  const clientSecret = process.env.MELI_CLIENT_SECRET;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Credenciais OAuth do Mercado Livre não configuradas.");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as
    | MercadoLivreTokenResponse
    | { message?: string; error?: string; error_description?: string };

  if (!response.ok) {
    const message =
      "error_description" in data && data.error_description
        ? data.error_description
        : "message" in data && data.message
          ? data.message
          : "Falha ao renovar o token do Mercado Livre.";
    throw new Error(message);
  }
  return data as MercadoLivreTokenResponse;
}

export async function exchangeMercadoLivreAuthorizationCode(
  code: string,
): Promise<MercadoLivreTokenResponse> {
  const clientId = process.env.MELI_CLIENT_ID;
  const clientSecret = process.env.MELI_CLIENT_SECRET;
  const redirectUri = process.env.MELI_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri || !code) {
    throw new Error("Configuração OAuth do Mercado Livre incompleta.");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });
  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as
    | MercadoLivreTokenResponse
    | { message?: string; error?: string; error_description?: string };
  if (!response.ok) {
    const message =
      "error_description" in data && data.error_description
        ? data.error_description
        : "message" in data && data.message
          ? data.message
          : "Falha ao autorizar a conta do Mercado Livre.";
    throw new Error(message);
  }
  return data as MercadoLivreTokenResponse;
}
