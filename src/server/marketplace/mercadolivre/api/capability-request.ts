import { mercadoLivreFetch } from "@/src/lib/mercado-livre/client";

import type {
  MercadoLivreCapabilityCheck,
  MercadoLivreCapabilityStatus,
} from "./capability-types";

export interface ExecutedCapabilityCheck {
  check: MercadoLivreCapabilityCheck;
  body: unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function extractApiError(body: unknown): string | null {
  const record = asRecord(body);
  return (
    asString(record.error_description) ??
    asString(record.message) ??
    asString(record.error)
  );
}

function classifyStatus(status: number): MercadoLivreCapabilityStatus {
  if (status >= 200 && status < 300) return "supported";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "unavailable";
  if (status === 429) return "rate_limited";
  return "failed";
}

const MAX_ATTEMPTS = 4;
const MAX_RETRY_DELAY_MS = 60_000;

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1_000, MAX_RETRY_DELAY_MS);
  }
  const exponentialDelay = Math.min(1_000 * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
  return exponentialDelay + Math.floor(Math.random() * 500);
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function executeCapabilityCheck(
  id: string,
  endpoint: string,
  summarize: (body: unknown) => Record<string, unknown>,
): Promise<ExecutedCapabilityCheck> {
  const startedAt = performance.now();
  let attempts = 0;

  try {
    let response: Response;

    do {
      attempts += 1;
      response = await mercadoLivreFetch(endpoint);
      if (response.status !== 429 || attempts >= MAX_ATTEMPTS) break;
      await response.body?.cancel();
      await delay(retryDelayMs(response, attempts));
    } while (attempts < MAX_ATTEMPTS);

    const body = await response.json().catch(() => null);
    const status = classifyStatus(response.status);

    return {
      check: {
        id,
        endpoint,
        status,
        httpStatus: response.status,
        durationMs: Math.round(performance.now() - startedAt),
        attempts,
        observed: status === "supported" ? summarize(body) : {},
        error: status === "supported" ? null : extractApiError(body),
      },
      body: status === "supported" ? body : null,
    };
  } catch (error) {
    return {
      check: {
        id,
        endpoint,
        status: "failed",
        httpStatus: null,
        durationMs: Math.round(performance.now() - startedAt),
        attempts,
        observed: {},
        error: error instanceof Error ? error.message : "Erro desconhecido.",
      },
      body: null,
    };
  }
}

export function skippedCapabilityCheck(
  id: string,
  endpoint: string,
  reason: string,
): MercadoLivreCapabilityCheck {
  return {
    id,
    endpoint,
    status: "skipped",
    httpStatus: null,
    durationMs: 0,
    attempts: 0,
    observed: {},
    error: reason,
  };
}
