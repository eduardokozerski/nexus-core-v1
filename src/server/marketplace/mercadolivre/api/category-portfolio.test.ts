import assert from "node:assert/strict";
import test from "node:test";

import type {
  RadarCategory,
  RadarCategoryStatus,
  RadarFocusArea,
} from "@/src/generated/prisma/client";

import {
  categoryFocusScore,
  leafCategoryFocusScore,
  selectRadarCategoryPortfolio,
} from "./category-portfolio";

function category(
  externalId: string,
  focusArea: RadarFocusArea,
  status: RadarCategoryStatus,
  overrides: Partial<RadarCategory> = {},
): RadarCategory {
  return {
    id: externalId,
    marketplace: "MERCADO_LIVRE",
    externalId,
    name: externalId,
    focusArea,
    status,
    parentExternalId: null,
    depth: 3,
    isLeaf: true,
    focusScore: 70,
    priorityScore: 70,
    scanCount: 0,
    candidateCount: 0,
    path: null,
    rationale: null,
    source: "test",
    expandedAt: null,
    lastScannedAt: null,
    createdAt: new Date("2026-07-28T00:00:00.000Z"),
    updatedAt: new Date("2026-07-28T00:00:00.000Z"),
    ...overrides,
  };
}

test("pontua ramos de foco e descarta categorias incompatíveis", () => {
  assert.ok(categoryFocusScore("Organizadores para Banheiro", "HOME") > 50);
  assert.ok(categoryFocusScore("Suportes para Celulares", "MOBILE") > 50);
  assert.ok(categoryFocusScore("Figuras de Ação", "TOYS") > 50);
  assert.equal(categoryFocusScore("Guarda-Roupas", "HOME"), -100);
  assert.equal(categoryFocusScore("Drones com Bateria", "TOYS"), -100);
  assert.ok(leafCategoryFocusScore("Organizadores de Pia", "HOME") > 50);
  assert.ok(
    leafCategoryFocusScore("Anéis para Celulares", "MOBILE") > 50,
  );
  assert.ok(
    leafCategoryFocusScore("Expositores de Bonecos", "TOYS") > 50,
  );
  assert.equal(
    leafCategoryFocusScore("Cubas e Pias para Banheiro", "HOME"),
    0,
  );
  assert.equal(
    leafCategoryFocusScore("Bonecas, Bonecos e Bebês", "TOYS"),
    0,
  );
});

test("amplia o portfólio para oito categorias prioritárias e quatro exploratórias", () => {
  const result = selectRadarCategoryPortfolio([
    category("HOME_PRIORITY", "HOME", "PRIORITY", { priorityScore: 100 }),
    category("MOBILE_PRIORITY", "MOBILE", "PRIORITY", { priorityScore: 90 }),
    category("TOYS_PRIORITY", "TOYS", "PRIORITY", { priorityScore: 80 }),
    category("HOME_EXTRA_1", "HOME", "PRIORITY", { priorityScore: 70 }),
    category("HOME_EXTRA_2", "HOME", "PRIORITY", { priorityScore: 60 }),
    category("MOBILE_EXTRA_1", "MOBILE", "PRIORITY", { priorityScore: 50 }),
    category("MOBILE_EXTRA_2", "MOBILE", "PRIORITY", { priorityScore: 40 }),
    category("TOYS_EXTRA", "TOYS", "PRIORITY", { priorityScore: 30 }),
    category("HOME_NEW", "HOME", "EXPLORATORY", { focusScore: 95 }),
    category("TOYS_NEW", "TOYS", "EXPLORATORY", { focusScore: 90 }),
    category("MOBILE_NEW", "MOBILE", "EXPLORATORY", { focusScore: 85 }),
    category("HOME_NEW_2", "HOME", "EXPLORATORY", { focusScore: 80 }),
  ]);

  assert.equal(result.priority.length, 8);
  assert.equal(result.exploratory.length, 4);
  assert.equal(result.dimensions.length, 12);
});

test("não seleciona categorias pausadas ou que não sejam folha", () => {
  const result = selectRadarCategoryPortfolio([
    category("PAUSED", "HOME", "PAUSED"),
    category("BRANCH", "MOBILE", "EXPLORATORY", { isLeaf: false }),
    category("LEAF", "TOYS", "EXPLORATORY"),
  ]);

  assert.deepEqual(
    result.dimensions.map((dimension) => dimension.categoryId),
    ["LEAF"],
  );
});
