import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { persistCapabilityProbe } from "./capability-run-store";
import type { MercadoLivreCapabilityProbeReport } from "./capability-types";

const fixture: MercadoLivreCapabilityProbeReport = {
  schemaVersion: 1,
  marketplace: "mercado_livre",
  source: "official_api",
  siteId: "MLB",
  status: "partial",
  startedAt: "2026-07-16T10:00:00.000Z",
  finishedAt: "2026-07-16T10:00:01.000Z",
  durationMs: 1_000,
  context: {
    requestedCategoryId: null,
    selectedCategoryId: "MLB1",
    selectedCategoryName: "Teste",
    selectedCategoryIsLeaf: true,
    categoryPath: [{ id: "MLB1", name: "Teste" }],
    selectedQuery: "teste",
    querySource: "category_trends",
    selectedProductId: null,
    selectedItemId: null,
    selectedUserProductId: null,
  },
  summary: {
    total: 1,
    supported: 1,
    unauthorized: 0,
    forbidden: 0,
    unavailable: 0,
    rateLimited: 0,
    failed: 0,
    skipped: 0,
  },
  capabilities: { authentication: "supported" },
  checks: [
    {
      id: "authentication",
      endpoint: "/users/me",
      status: "supported",
      httpStatus: 200,
      durationMs: 10,
      attempts: 1,
      observed: { authenticated: true },
      error: null,
    },
  ],
  notes: [],
};

test("persiste histórico imutável e latest", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "meli-api-probe-"));

  try {
    const persisted = await persistCapabilityProbe(fixture, directory);
    const run = JSON.parse(await readFile(persisted.runPath, "utf8"));
    const latest = JSON.parse(await readFile(persisted.latestPath, "utf8"));

    assert.deepEqual(run, fixture);
    assert.deepEqual(latest, fixture);
    await assert.rejects(() => persistCapabilityProbe(fixture, directory));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
