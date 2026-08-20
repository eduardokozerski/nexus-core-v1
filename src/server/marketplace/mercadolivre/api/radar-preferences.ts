export interface RadarPreferenceRules {
  bannedTerms: readonly string[];
  preferredCategoryIds: readonly string[];
}

export interface RadarTitleExclusion {
  code: string;
  reason: string;
  matchedTerm?: string;
}

export const EMPTY_RADAR_PREFERENCES: RadarPreferenceRules = {
  bannedTerms: [],
  preferredCategoryIds: [],
};

export function normalizeRadarText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function matchingPreferenceTerm(
  title: string,
  terms: readonly string[],
): string | null {
  const stopWords = new Set([
    "a",
    "as",
    "da",
    "das",
    "de",
    "do",
    "dos",
    "e",
    "em",
    "o",
    "os",
    "para",
    "por",
  ]);
  const titleTokens = normalizeRadarText(title)
    .split(" ")
    .filter((token) => token && !stopWords.has(token));
  return (
    terms.find((term) => {
      const termTokens = normalizeRadarText(term)
        .split(" ")
        .filter((token) => token && !stopWords.has(token));
      if (termTokens.length === 0) return false;
      let titleIndex = 0;
      return termTokens.every((termToken) => {
        const matchIndex = titleTokens.indexOf(termToken, titleIndex);
        if (matchIndex < 0) return false;
        titleIndex = matchIndex + 1;
        return true;
      });
    }) ?? null
  );
}

const BUILT_IN_EXCLUSIONS: Array<{
  pattern: RegExp;
  code: string;
  reason: string;
}> = [
  {
    pattern: /^(?!.*\b(?:bone|bones|chapeu|chapeus)\b).*\bcabides?\b/,
    code: "known_product_family",
    reason:
      "Cabide comum de roupa já explorado pela operação; suportes específicos para bonés continuam permitidos.",
  },
  {
    pattern: /\b(?:drone|bola\s+voadora|fly\s+spinner|brinquedo\s+voador)\b/,
    code: "electronic_flying_toy",
    reason:
      "Brinquedo voador ou eletrônico fora do escopo de acessórios passivos.",
  },
  {
    pattern:
      /\b(?:baterias?|power\s*banks?|carregador\s+portatil|\d+\s*mah)\b/,
    code: "powered_or_charging_product",
    reason:
      "Produto dependente de bateria ou circuito de carga, fora do escopo de peças passivas impressas em 3D.",
  },
  {
    pattern: /\b(?:patrulha\s+canina|paw\s+patrol)\b/,
    code: "excluded_licensed_toy",
    reason:
      "Brinquedo licenciado fora do foco operacional e sem vantagem clara para fabricação própria.",
  },
  {
    pattern:
      /^(?:kit\s+)?armarios?\b|\barmario\s+carrinho\b|\b(?:guarda\s+roupas?|roupeiros?|closets?|comodas?|sapateiras?|porta\s+volumes?)\b/,
    code: "oversized_storage_furniture",
    reason:
      "Móvel ou porta-volumes grande fora do perfil operacional.",
  },
  {
    pattern: /\bhermeticos?\b/,
    code: "sealed_food_container_requirement",
    reason:
      "O valor do produto depende de vedação hermética e contato com alimentos, requisitos que não devem ser substituídos por PLA.",
  },
  {
    pattern:
      /\b(?:tecidos?|feltros?|inflav(?:el|eis)|flexiv(?:el|eis)|dobrav(?:el|eis)|silicone|borracha)\b/,
    code: "soft_or_flexible_product",
    reason:
      "Produto sem a rigidez necessária para ser substituído por uma peça funcional em PLA ou PETG.",
  },
  {
    pattern: /\borganizador(?:es)?\s+(?:de\s+)?roupas?\s+(?:de\s+)?bebe\b/,
    code: "soft_large_baby_clothing_organizer",
    reason:
      "Organizador grande e flexível para roupas de bebê, sem a rigidez adequada para uma alternativa em PLA.",
  },
];

export function findBuiltInTitleExclusion(
  title: string,
): RadarTitleExclusion | null {
  const normalizedTitle = normalizeRadarText(title);
  const exclusion = BUILT_IN_EXCLUSIONS.find(({ pattern }) =>
    pattern.test(normalizedTitle),
  );
  return exclusion
    ? {
        code: exclusion.code,
        reason: exclusion.reason,
      }
    : null;
}

export function findUserTitleExclusion(
  title: string,
  bannedTerms: readonly string[],
): RadarTitleExclusion | null {
  const matchedTerm = matchingPreferenceTerm(title, bannedTerms);
  return matchedTerm
    ? {
        code: "user_banned_term",
        reason: `O título contém o termo banido “${matchedTerm}”.`,
        matchedTerm,
      }
    : null;
}

export function findTitleExclusion(
  title: string,
  bannedTerms: readonly string[] = [],
): RadarTitleExclusion | null {
  return (
    findUserTitleExclusion(title, bannedTerms) ??
    findBuiltInTitleExclusion(title)
  );
}
