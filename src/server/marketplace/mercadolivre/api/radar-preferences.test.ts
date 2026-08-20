import assert from "node:assert/strict";
import test from "node:test";

import {
  findBuiltInTitleExclusion,
  findUserTitleExclusion,
  matchingPreferenceTerm,
  normalizeRadarText,
} from "./radar-preferences";

test("normaliza acentos e pontuação para deduplicação histórica", () => {
  assert.equal(
    normalizeRadarText("  Suporte de Celular — Parede! "),
    "suporte de celular parede",
  );
});

test("encontra preferência como frase completa", () => {
  assert.equal(
    matchingPreferenceTerm("Kit de suporte de celular para parede", [
      "suporte de celular",
    ]),
    "suporte de celular",
  );
  assert.equal(
    matchingPreferenceTerm(
      "Suporte de parede triplo para controle remoto",
      ["suporte controle remoto"],
    ),
    "suporte controle remoto",
  );
  assert.equal(
    matchingPreferenceTerm("Limpador de porta de USB para notebook", [
      "limpador porta usb",
    ]),
    "limpador porta usb",
  );
  assert.equal(matchingPreferenceTerm("Produto superfidgetado", ["fidget"]), null);
});

test("bloqueia os dois itens indesejados relatados em 28/07", () => {
  assert.equal(
    findBuiltInTitleExclusion(
      "Bola Voadora Spinner Led Drone Brinquedo Boomerang",
    )?.code,
    "electronic_flying_toy",
  );
  assert.equal(
    findBuiltInTitleExclusion(
      "Sunny Patrulha Canina Chase e Veículo Básico Patrol Cruiser",
    )?.code,
    "excluded_licensed_toy",
  );
});

test("bloqueia bateria e carregador mesmo quando aparecem em categoria passiva", () => {
  assert.equal(
    findBuiltInTitleExclusion(
      "Bateria Samsung Carregador Portátil USB-C 20000mAh",
    )?.code,
    "powered_or_charging_product",
  );
});

test("bloqueia móveis grandes, porta-volumes e produtos flexíveis", () => {
  assert.equal(
    findBuiltInTitleExclusion("Armário organizador grande de cozinha")?.code,
    "oversized_storage_furniture",
  );
  assert.equal(
    findBuiltInTitleExclusion("Porta-volumes grande para teto")?.code,
    "oversized_storage_furniture",
  );
  assert.equal(
    findBuiltInTitleExclusion("Organizador dobrável de tecido")?.code,
    "soft_or_flexible_product",
  );
  assert.equal(
    findBuiltInTitleExclusion("Organizador porta pratos para armário"),
    null,
  );
});

test("termos banidos editáveis têm precedência e informam o termo", () => {
  const result = findUserTitleExclusion("Escorredor grande de pratos", [
    "escorredor",
  ]);
  assert.equal(result?.code, "user_banned_term");
  assert.equal(result?.matchedTerm, "escorredor");
});
