import { type PrismaClient } from "@/src/generated/prisma/client";

import { persistOfficialSearch } from "./official-search-persistence";
import { searchMercadoLivreOfficial } from "./official-search";

export async function runOfficialMercadoLivreSearch(
  database: PrismaClient,
  input: { keyword: string; limit?: number; offset?: number },
) {
  const report = await searchMercadoLivreOfficial(input.keyword, {
    limit: input.limit,
    offset: input.offset,
  });
  const persistence = await persistOfficialSearch(database, report);
  return { report, persistence };
}
