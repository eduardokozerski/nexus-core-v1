import { z } from "zod";

import { mercadoLivreFetch } from "@/src/lib/mercado-livre/client";

const ML_SITE_ID = "MLB" as const;
const SEARCH_ENDPOINT = "/products/search";
const MAX_RESULTS = 10;

const catalogSearchResponseSchema = z.object({
  keywords: z.string().optional(),
  paging: z
    .object({
      total: z.number().optional(),
      offset: z.number().optional(),
      limit: z.number().optional(),
    })
    .optional(),
  results: z
    .array(
      z.object({
        id: z.string(),
        catalog_product_id: z.string().optional(),
        domain_id: z.string().optional(),
        name: z.string(),
        status: z.string().optional(),
        pictures: z
          .array(z.object({ id: z.string(), url: z.string() }))
          .optional(),
        short_description: z
          .object({ type: z.string(), content: z.string() })
          .optional(),
        settings: z.object({ listing_strategy: z.string().optional() }).optional(),
        attributes: z.array(z.unknown()).optional(),
        tags: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});

export interface OfficialMercadoLivreSearchResult {
  position: number;
  externalId: string;
  catalogProductId: string | null;
  domainId: string | null;
  title: string;
  status: string | null;
  imageUrl: string | null;
  shortDescription: string | null;
  listingStrategy: string | null;
  attributes: unknown[];
  tags: string[];
  rawData: unknown;
}

export interface OfficialMercadoLivreSearchReport {
  schemaVersion: 1;
  marketplace: "mercado_livre";
  source: "official_api";
  endpoint: string;
  siteId: typeof ML_SITE_ID;
  query: string;
  requestedLimit: number;
  total: number;
  offset: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  status: "success" | "partial" | "failed";
  error: string | null;
  results: OfficialMercadoLivreSearchResult[];
}

function limitValue(value: number | undefined): number {
  if (value === undefined) return MAX_RESULTS;
  if (!Number.isInteger(value) || value < 1 || value > MAX_RESULTS) {
    throw new Error(`O limite deve ser um inteiro entre 1 e ${MAX_RESULTS}.`);
  }
  return value;
}

export async function searchMercadoLivreOfficial(
  rawQuery: string,
  options: { limit?: number; offset?: number } = {},
): Promise<OfficialMercadoLivreSearchReport> {
  const query = rawQuery.trim();
  if (!query) throw new Error("Informe uma palavra-chave para a busca.");

  const limit = limitValue(options.limit);
  const offset = options.offset ?? 0;
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error("O offset deve ser um inteiro maior ou igual a zero.");
  }

  const started = new Date();
  let status: OfficialMercadoLivreSearchReport["status"] = "failed";
  let error: string | null = null;
  let results: OfficialMercadoLivreSearchResult[] = [];
  let total = 0;
  let responseOffset = offset;

  try {
    const params = new URLSearchParams({
      status: "active",
      site_id: ML_SITE_ID,
      q: query,
      limit: String(limit),
      offset: String(offset),
    });
    const response = await mercadoLivreFetch(`${SEARCH_ENDPOINT}?${params}`);
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      const message =
        body && typeof body === "object" && "message" in body
          ? String(body.message)
          : `A API oficial respondeu HTTP ${response.status}.`;
      throw new Error(message);
    }

    const data = catalogSearchResponseSchema.parse(body);
    total = data.paging?.total ?? data.results?.length ?? 0;
    responseOffset = data.paging?.offset ?? offset;
    results = (data.results ?? []).map((product, index) => ({
      position: responseOffset + index + 1,
      externalId: product.id,
      catalogProductId: product.catalog_product_id ?? null,
      domainId: product.domain_id ?? null,
      title: product.name,
      status: product.status ?? null,
      imageUrl: product.pictures?.[0]?.url ?? null,
      shortDescription: product.short_description?.content ?? null,
      listingStrategy: product.settings?.listing_strategy ?? null,
      attributes: product.attributes ?? [],
      tags: product.tags ?? [],
      rawData: product,
    }));
    status = "success";
  } catch (caughtError) {
    error = caughtError instanceof Error ? caughtError.message : "Erro desconhecido.";
  }

  const finished = new Date();
  return {
    schemaVersion: 1,
    marketplace: "mercado_livre",
    source: "official_api",
    endpoint: SEARCH_ENDPOINT,
    siteId: ML_SITE_ID,
    query,
    requestedLimit: limit,
    total,
    offset: responseOffset,
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    durationMs: finished.getTime() - started.getTime(),
    status,
    error,
    results,
  };
}
