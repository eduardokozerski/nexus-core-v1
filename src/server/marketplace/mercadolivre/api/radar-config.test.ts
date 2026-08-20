import assert from "node:assert/strict";
import test from "node:test";

import {
  RADAR_DIMENSIONS,
  RADAR_HIGHLIGHT_LIMIT_PER_DIMENSION,
} from "./radar-config";

test("radar operacional usa categorias compactas e específicas", () => {
  assert.deepEqual(
    RADAR_DIMENSIONS.map((dimension) => dimension.categoryId),
    ["MLB271399", "MLB271146", "MLB186369", "MLB1839", "MLB264330"],
  );
  assert.equal(RADAR_HIGHLIGHT_LIMIT_PER_DIMENSION, 20);
  assert.ok(!RADAR_DIMENSIONS.some((dimension) => dimension.categoryId === "MLB436414"));
  assert.ok(!RADAR_DIMENSIONS.some((dimension) => dimension.categoryId === "MLB436416"));
});
