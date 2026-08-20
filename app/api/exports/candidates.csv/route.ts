import { requireApiSession } from "@/src/server/auth/session";
import { ACTIONABLE_VIABILITY_STATUS } from "@/src/server/marketplace/actionable-queue";
import { getDatabase } from "@/src/server/db/client";

function cell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET() {
  if (!(await requireApiSession())) {
    return Response.json({ error: "Not authenticated." }, { status: 401 });
  }
  const snapshotWhere = {
    viabilityStatus: ACTIONABLE_VIABILITY_STATUS,
    collectionRun: { searchTerm: { strategy: "RADAR_DISCOVERY" as const } },
  };
  const listings = await getDatabase().listing.findMany({
    where: {
      humanDecisions: { none: {} },
      snapshots: { some: snapshotWhere },
    },
    orderBy: { updatedAt: "desc" },
    include: {
      snapshots: {
        where: snapshotWhere,
        take: 1,
        orderBy: [
          { opportunityScore: "desc" },
          { collectedAt: "desc" },
        ],
        include: {
          radarCategory: true,
          score: true,
          collectionRun: { include: { searchTerm: true } },
        },
      },
    },
  });
  const items = listings.flatMap((listing) =>
    listing.snapshots.map((snapshot) => ({ ...snapshot, listing })),
  );
  const headers = ["Marketplace", "Categoria", "Título", "URL", "Preço", "Rating", "Avaliações", "Vendedor", "Posição", "Score", "Versão do score", "Razões", "Coletado em"];
  const rows = items.map((item) => ["Mercado Livre", item.radarCategory?.name, item.listing.title, item.listing.listingUrl ?? item.listing.url, item.price?.toString(), item.ratingAverage?.toString(), item.reviewCount, item.listing.sellerName, item.searchPosition, item.score?.totalScore, item.score?.version, Array.isArray(item.reasons) ? item.reasons.join(" | ") : "", item.collectedAt.toISOString()]);
  const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(cell).join(";")).join("\r\n")}`;
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="nexus-fila-acionavel-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
