import assert from "node:assert/strict";
import test from "node:test";

import type { RadarCandidate } from "@/src/server/marketplace/mercadolivre/api/radar-types";

import {
  buildRadarRunKey,
  buildHumanDecisionKey,
  candidateDemandScore,
  normalizeSearchTerm,
} from "./radar-history";

test("normaliza o termo sem perder a identidade da busca", () => {
  assert.equal(
    normalizeSearchTerm("  Organização Funcional — Cozinha  "),
    "organizacao funcional cozinha",
  );
});

test("a mesma decisão textual produz uma chave idempotente", () => {
  const input = {
    candidateId: "PRODUCT:MLB25854946",
    status: "validated" as const,
    notes: "Validado manualmente pelo operador.",
  };

  assert.equal(buildHumanDecisionKey(input), buildHumanDecisionKey(input));
  assert.match(buildHumanDecisionKey(input), /^human:[a-f0-9]{64}$/);
});

test("a chave da execução é estável para importações idempotentes", () => {
  const key = buildRadarRunKey({
    marketplace: "mercado_livre",
    source: "official_api",
    startedAt: "2026-07-20T13:06:00.069Z",
  } as Parameters<typeof buildRadarRunKey>[0]);

  assert.equal(
    key,
    "mercado_livre:official_api:2026-07-20T13:06:00.069Z",
  );
});

test("separa demanda das demais parcelas do score", () => {
  const candidate = {
    scores: {
      highlightScore: 20,
      reviewsScore: 12,
      ratingScore: 10,
      trendScore: 7,
      competitionScore: 8,
      priceScore: 10,
      riskPenalty: 0,
      researchPriorityScore: 67,
    },
  } as RadarCandidate;

  assert.equal(candidateDemandScore(candidate), 49);
});
