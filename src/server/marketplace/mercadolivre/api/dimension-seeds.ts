export interface MercadoLivreDimensionSeed {
  categoryId: string;
  expectedName: string;
  rationale: string;
  portfolioPriority: number;
  radarEnabled: boolean;
}

export const MERCADO_LIVRE_DIMENSION_SEEDS: MercadoLivreDimensionSeed[] = [
  {
    categoryId: "MLB271399",
    expectedName: "Suportes para Controle Remoto",
    rationale: "Acessórios compactos de parede com demanda comprovada e boa aderência operacional.",
    portfolioPriority: 1,
    radarEnabled: true,
  },
  {
    categoryId: "MLB271146",
    expectedName: "Porta Celulares",
    rationale: "Suportes compactos de mesa ou parede, incluindo kits pequenos já validados pela operação.",
    portfolioPriority: 2,
    radarEnabled: true,
  },
  {
    categoryId: "MLB186369",
    expectedName: "Saboneteiras",
    rationale: "Produto compacto para casa com histórico forte de vendas na operação.",
    portfolioPriority: 3,
    radarEnabled: true,
  },
  {
    categoryId: "MLB1839",
    expectedName: "Figuras de Ação",
    rationale: "Inclui bonecos articulados, como Dummy 13, sujeitos a validação manual de licença e montagem.",
    portfolioPriority: 4,
    radarEnabled: true,
  },
  {
    categoryId: "MLB264330",
    expectedName: "Fidget Spinners",
    rationale: "Brinquedos fidget compactos com demanda observada e potencial de fabricação aditiva.",
    portfolioPriority: 5,
    radarEnabled: true,
  },
  {
    categoryId: "MLB436414",
    expectedName: "Organização para Casa",
    rationale: "Categoria ampla preservada apenas para estudos de cobertura; mistura itens grandes e inviáveis.",
    portfolioPriority: 20,
    radarEnabled: false,
  },
  {
    categoryId: "MLB436416",
    expectedName: "Organizadores para Cozinha",
    rationale: "Categoria ampla preservada apenas para estudos de cobertura; não integra mais o radar operacional.",
    portfolioPriority: 21,
    radarEnabled: false,
  },
  {
    categoryId: "MLB432825",
    expectedName: "Eletrodomésticos de Brinquedo",
    rationale: "Dimensão já validada e útil como controle positivo do probe.",
    portfolioPriority: 27,
    radarEnabled: false,
  },
  {
    categoryId: "MLB1574",
    expectedName: "Casa, Móveis e Decoração",
    rationale: "Categoria ampla para medir se dimensões raiz fornecem sinais úteis.",
    portfolioPriority: 28,
    radarEnabled: false,
  },
  {
    categoryId: "MLB1132",
    expectedName: "Brinquedos e Hobbies",
    rationale: "Produtos decorativos, miniaturas, jogos e acessórios potencialmente imprimíveis.",
    portfolioPriority: 23,
    radarEnabled: false,
  },
  {
    categoryId: "MLB1368",
    expectedName: "Arte, Papelaria e Armarinho",
    rationale: "Ferramentas, moldes, organizadores e acessórios de bancada.",
    portfolioPriority: 24,
    radarEnabled: false,
  },
  {
    categoryId: "MLB1071",
    expectedName: "Animais",
    rationale: "Acessórios para pets, suportes, comedouros e organização.",
    portfolioPriority: 25,
    radarEnabled: false,
  },
  {
    categoryId: "MLB5672",
    expectedName: "Acessórios para Veículos",
    rationale: "Suportes, organizadores e acessórios internos com demanda pública.",
    portfolioPriority: 26,
    radarEnabled: false,
  },
];
