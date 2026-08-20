export const OFFICIAL_KEYWORD_SCORE_VERSION = "official-keyword-v1";

export function scoreOfficialKeywordResult(position: number) {
  const boundedPosition = Math.min(Math.max(position, 1), 10);
  const demandScore = Math.max(4, 44 - boundedPosition * 4);
  return {
    version: OFFICIAL_KEYWORD_SCORE_VERSION,
    totalScore: demandScore,
    demandScore,
    competitionScore: 0,
    priceScore: 0,
    sellerScore: 0,
    riskScore: 0,
    priorityLabel: "exploratory" as const,
    components: { officialSearchPosition: position, reviewCount: null, price: null, sellerReputation: null },
    reasons: [
      `Posição ${position} na resposta da busca oficial de produtos.`,
      "Preço, avaliações, reputação e vendas não estavam disponíveis; nenhum valor foi inferido.",
      "Pontuação exploratória: requer validação manual e não representa vendas confirmadas.",
    ],
  };
}
