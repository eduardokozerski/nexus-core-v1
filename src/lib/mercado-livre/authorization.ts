import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type { PrismaClient } from "@/src/generated/prisma/client";

import {
  refreshMercadoLivreAccessToken,
  type MercadoLivreTokenResponse,
} from "./refresh-access-token";

const AUTHORIZATION_LOCK_KEY = "nexus-core:mercadolivre:oauth";
const TOKEN_AAD = "nexus-core:mercadolivre:oauth:v1";
const REFRESH_WINDOW_MS = 10 * 60 * 1_000;

type AccessToken = { accessToken: string; expiresAt: Date };

let cachedAccessToken: AccessToken | null = null;

export class MercadoLivreReauthorizationRequiredError extends Error {
  constructor() {
    super("A conexão com o Mercado Livre precisa ser autorizada novamente.");
    this.name = "MercadoLivreReauthorizationRequiredError";
  }
}

function encryptionKey(): Buffer {
  const encodedKey = process.env.MELI_TOKEN_ENCRYPTION_KEY?.trim();
  if (!encodedKey) throw new Error("MELI_TOKEN_ENCRYPTION_KEY não configurada.");
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) {
    throw new Error("MELI_TOKEN_ENCRYPTION_KEY deve conter exatamente 32 bytes em Base64.");
  }
  return key;
}

function encryptToken(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(TOKEN_AAD));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptToken(payload: string): string {
  const [version, ivValue, tagValue, encryptedValue] = payload.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("A credencial armazenada do Mercado Livre está em formato inválido.");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
    decipher.setAAD(Buffer.from(TOKEN_AAD));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Não foi possível ler a credencial do Mercado Livre. Verifique a chave de criptografia configurada.");
  }
}

function expiresAt(tokens: MercadoLivreTokenResponse): Date {
  return new Date(Date.now() + tokens.expires_in * 1_000);
}

function isUsable(expires: Date): boolean {
  return expires.getTime() > Date.now() + REFRESH_WINDOW_MS;
}

function isInvalidGrant(error: unknown): boolean {
  return error instanceof Error && /invalid_grant|authorization code or refresh token/i.test(error.message);
}

function clearCache() { cachedAccessToken = null; }
function cache(token: AccessToken): AccessToken { cachedAccessToken = token; return token; }

export async function storeMercadoLivreAuthorization(
  database: PrismaClient,
  tokens: MercadoLivreTokenResponse,
): Promise<void> {
  await database.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${AUTHORIZATION_LOCK_KEY}))`;
    const active = await transaction.mercadoLivreAuthorization.findFirst({
      where: { status: "ACTIVE" }, select: { sellerId: true },
    });
    const sellerId = String(tokens.user_id);
    if (active && active.sellerId !== sellerId) {
      throw new Error("Já existe uma conta ativa do Mercado Livre conectada a esta instalação.");
    }
    await transaction.mercadoLivreAuthorization.upsert({
      where: { sellerId },
      create: {
        sellerId,
        accessTokenCiphertext: encryptToken(tokens.access_token),
        refreshTokenCiphertext: encryptToken(tokens.refresh_token),
        accessTokenExpiresAt: expiresAt(tokens),
        status: "ACTIVE",
        lastRefreshAt: new Date(),
        lastRefreshError: null,
      },
      update: {
        accessTokenCiphertext: encryptToken(tokens.access_token),
        refreshTokenCiphertext: encryptToken(tokens.refresh_token),
        accessTokenExpiresAt: expiresAt(tokens),
        status: "ACTIVE",
        lastRefreshAt: new Date(),
        lastRefreshError: null,
      },
    });
  }, { maxWait: 10_000, timeout: 30_000 });
  clearCache();
}

export async function bootstrapMercadoLivreAuthorizationFromEnvironment(database: PrismaClient) {
  const refreshToken = process.env.MELI_REFRESH_TOKEN?.trim();
  if (!refreshToken) throw new Error("MELI_REFRESH_TOKEN não configurado para a migração inicial.");
  const tokens = await refreshMercadoLivreAccessToken(refreshToken);
  await storeMercadoLivreAuthorization(database, tokens);
  const token = cache({ accessToken: tokens.access_token, expiresAt: expiresAt(tokens) });
  return { sellerId: String(tokens.user_id), expiresAt: token.expiresAt };
}

type AcquireOptions = { rejectedAccessToken?: string; forceRefresh?: boolean };

async function acquireStoredAccessToken(database: PrismaClient, options: AcquireOptions = {}): Promise<AccessToken> {
  const result = await database.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${AUTHORIZATION_LOCK_KEY}))`;
    const authorization = await transaction.mercadoLivreAuthorization.findFirst({
      where: { status: "ACTIVE" }, orderBy: { updatedAt: "desc" },
    });
    if (!authorization) return { kind: "reauthorization_required" as const };

    const storedAccessToken = decryptToken(authorization.accessTokenCiphertext);
    const storedToken = { accessToken: storedAccessToken, expiresAt: authorization.accessTokenExpiresAt };
    const replacedByAnotherProcess = Boolean(options.rejectedAccessToken) && options.rejectedAccessToken !== storedAccessToken;
    if (!options.forceRefresh && (
      options.rejectedAccessToken ? replacedByAnotherProcess : isUsable(authorization.accessTokenExpiresAt)
    )) {
      return { kind: "access_token" as const, token: storedToken };
    }

    let tokens: MercadoLivreTokenResponse;
    try {
      tokens = await refreshMercadoLivreAccessToken(decryptToken(authorization.refreshTokenCiphertext));
    } catch (error) {
      const requiresReauthorization = isInvalidGrant(error);
      await transaction.mercadoLivreAuthorization.update({
        where: { id: authorization.id },
        data: {
          status: requiresReauthorization ? "REAUTH_REQUIRED" : "ACTIVE",
          lastRefreshError: requiresReauthorization
            ? "O refresh token foi recusado pelo Mercado Livre."
            : "Não foi possível renovar a credencial do Mercado Livre.",
        },
      });
      return { kind: requiresReauthorization ? "reauthorization_required" as const : "refresh_failed" as const };
    }

    const refreshedToken = { accessToken: tokens.access_token, expiresAt: expiresAt(tokens) };
    await transaction.mercadoLivreAuthorization.update({
      where: { id: authorization.id },
      data: {
        accessTokenCiphertext: encryptToken(tokens.access_token),
        refreshTokenCiphertext: encryptToken(tokens.refresh_token),
        accessTokenExpiresAt: refreshedToken.expiresAt,
        status: "ACTIVE",
        lastRefreshAt: new Date(),
        lastRefreshError: null,
      },
    });
    return { kind: "access_token" as const, token: refreshedToken };
  }, { maxWait: 10_000, timeout: 30_000 });

  if (result.kind === "reauthorization_required") {
    clearCache();
    throw new MercadoLivreReauthorizationRequiredError();
  }
  if (result.kind === "refresh_failed") {
    clearCache();
    throw new Error("Não foi possível renovar a credencial do Mercado Livre. Tente iniciar o radar novamente.");
  }
  return cache(result.token!);
}

export async function ensureMercadoLivreAccessToken(database: PrismaClient): Promise<AccessToken> {
  if (cachedAccessToken && isUsable(cachedAccessToken.expiresAt)) return cachedAccessToken;
  return acquireStoredAccessToken(database);
}

export function getCachedMercadoLivreAccessToken(): AccessToken | null {
  return cachedAccessToken && isUsable(cachedAccessToken.expiresAt)
    ? cachedAccessToken
    : null;
}

export async function refreshStoredMercadoLivreAccessToken(database: PrismaClient): Promise<AccessToken> {
  clearCache();
  return acquireStoredAccessToken(database, { forceRefresh: true });
}

export async function recoverMercadoLivreAccessTokenAfterUnauthorized(
  database: PrismaClient,
  rejectedAccessToken: string,
): Promise<AccessToken> {
  clearCache();
  return acquireStoredAccessToken(database, { rejectedAccessToken });
}

export async function getMercadoLivreAuthorizationStatus(database: PrismaClient) {
  return database.mercadoLivreAuthorization.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { sellerId: true, status: true, accessTokenExpiresAt: true, lastRefreshAt: true, lastRefreshError: true },
  });
}
