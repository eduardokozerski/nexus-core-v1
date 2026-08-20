import {
  ensureMercadoLivreAccessToken,
  getCachedMercadoLivreAccessToken,
  recoverMercadoLivreAccessTokenAfterUnauthorized,
} from "./authorization";
import { getDatabase } from "@/src/server/db/client";

const ML_API_URL = "https://api.mercadolibre.com";
const DEFAULT_MINIMUM_REQUEST_INTERVAL_MS = 500;
const MINIMUM_ALLOWED_INTERVAL_MS = 100;
const MAXIMUM_ALLOWED_INTERVAL_MS = 10_000;

let lastRequestStartedAt = 0;
let throttleTail = Promise.resolve();

function minimumRequestIntervalMs(): number {
  const configured = Number(process.env.MELI_API_MIN_INTERVAL_MS);
  if (!Number.isFinite(configured)) return DEFAULT_MINIMUM_REQUEST_INTERVAL_MS;
  return Math.min(MAXIMUM_ALLOWED_INTERVAL_MS, Math.max(MINIMUM_ALLOWED_INTERVAL_MS, Math.round(configured)));
}

async function delay(milliseconds: number): Promise<void> {
  if (milliseconds > 0) await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForRequestSlot(): Promise<void> {
  const previous = throttleTail;
  let release: () => void = () => undefined;
  throttleTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    await delay(Math.max(0, lastRequestStartedAt + minimumRequestIntervalMs() - Date.now()));
    lastRequestStartedAt = Date.now();
  } finally {
    release();
  }
}

async function requestWithAccessToken(
  path: string,
  accessToken: string,
  options: RequestInit,
): Promise<Response> {
  await waitForRequestSlot();
  return fetch(`${ML_API_URL}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...options.headers,
    },
    cache: "no-store",
  });
}

function isSafeToRetry(options: RequestInit): boolean {
  return ["GET", "HEAD", "OPTIONS"].includes((options.method ?? "GET").toUpperCase());
}

export async function mercadoLivreFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const credential = getCachedMercadoLivreAccessToken() ?? await ensureMercadoLivreAccessToken(getDatabase());
  const response = await requestWithAccessToken(path, credential.accessToken, options);

  if (response.status !== 401 || !isSafeToRetry(options)) return response;

  await response.body?.cancel();
  const recoveredCredential = await recoverMercadoLivreAccessTokenAfterUnauthorized(
    getDatabase(),
    credential.accessToken,
  );
  return requestWithAccessToken(path, recoveredCredential.accessToken, options);
}
