# Nexus Core

Nexus Core é uma plataforma administrativa concluída para pesquisa, priorização e acompanhamento de oportunidades em marketplaces. Ela transforma sinais públicos dispersos em uma fila de análise clara, auditável e pronta para decisões humanas.

## Resultado entregue

O sistema reduziu o trabalho manual de pesquisa ao centralizar a descoberta de produtos, a coleta de dados autorizados, o histórico de execuções e a exportação de candidatos. A equipe passou a trabalhar com critérios consistentes, evidências visíveis e uma trilha de decisão por item.

## Principais capacidades

- Radar de categorias e termos com execuções sob demanda.
- Coleta exclusiva por APIs oficiais, com execução sequencial, cache e deduplicação.
- Proteção de taxa com intervalo global, respeito a `Retry-After`, backoff exponencial e persistência de resultados parciais.
- Score determinístico e explicável baseado em posição, preço, avaliações, concorrência e sinais de risco.
- Validação operacional por regras, com justificativas e revisão humana.
- Painel administrativo com métricas, filas, filtros, paginação, links copiáveis e acompanhamento de execuções.
- Histórico em PostgreSQL, processamento assíncrono com BullMQ e exportação de candidatos para CSV.

## Arquitetura

- **Frontend:** Next.js, React, TypeScript e Tailwind CSS.
- **Backend:** rotas do App Router, Zod e módulos de domínio separados.
- **Dados:** PostgreSQL, Prisma ORM e snapshots históricos.
- **Processamento:** Redis e BullMQ em worker dedicado.
- **Integrações:** APIs oficiais de marketplace, com limites tratados de forma segura.

## Princípios do produto

As pontuações representam sinais públicos de oportunidade, não vendas confirmadas ou previsões garantidas. O sistema privilegia transparência: dados indisponíveis permanecem como indisponíveis, regras produzem justificativas e decisões relevantes passam por validação humana.

## Execução local

1. Copie `.env.example` para `.env.local` e informe as variáveis necessárias para seu ambiente.
2. Instale as dependências com `npm install`.
3. Aplique o schema do banco com `npm run prisma:migrate`.
4. Crie o acesso administrativo com `npm run admin:create`.
5. Inicie a aplicação com `npm run dev` e o worker em outro terminal com `npm run worker`.

Segredos, tokens e dados operacionais não devem ser versionados. Use um gerenciador de segredos no ambiente de produção.
