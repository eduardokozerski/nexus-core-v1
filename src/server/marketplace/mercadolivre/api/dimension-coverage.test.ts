import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateCoverageScore,
  classifyDimensionReadiness,
} from "./dimension-coverage";

test("classifica dimensão pronta quando descoberta e ofertas estão disponíveis", () => {
  assert.equal(
    classifyDimensionReadiness({
      trends: "supported",
      highlights: "supported",
      offers: "supported",
    }),
    "radar_ready",
  );
});

test("score de cobertura mantém reviews como enriquecimento opcional", () => {
  assert.equal(
    calculateCoverageScore({
      category: "supported",
      trends: "supported",
      highlights: "supported",
      offers: "supported",
      reviews: "unavailable",
    }),
    90,
  );
});
