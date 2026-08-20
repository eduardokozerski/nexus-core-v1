import assert from "node:assert/strict";
import test from "node:test";
import { scoreOfficialKeywordResult } from "./official-keyword-score";

test("score oficial é determinístico, limitado e não inventa sinais", () => {
  const first = scoreOfficialKeywordResult(1);
  const tenth = scoreOfficialKeywordResult(10);
  assert.equal(first.totalScore, 40);
  assert.equal(tenth.totalScore, 4);
  assert.equal(first.priceScore, 0);
  assert.equal(first.components.reviewCount, null);
  assert.equal(first.priorityLabel, "exploratory");
});
