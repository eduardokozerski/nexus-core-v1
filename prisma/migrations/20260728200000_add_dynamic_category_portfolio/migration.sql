CREATE TYPE "RadarCategoryStatus" AS ENUM (
    'EXPLORATORY',
    'PRIORITY',
    'PAUSED',
    'DISCARDED'
);

CREATE TYPE "RadarFocusArea" AS ENUM ('HOME', 'MOBILE', 'TOYS');

CREATE TABLE "RadarCategory" (
    "id" TEXT NOT NULL,
    "marketplace" "Marketplace" NOT NULL DEFAULT 'MERCADO_LIVRE',
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "focusArea" "RadarFocusArea" NOT NULL,
    "status" "RadarCategoryStatus" NOT NULL DEFAULT 'EXPLORATORY',
    "parentExternalId" TEXT,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "isLeaf" BOOLEAN,
    "focusScore" INTEGER NOT NULL DEFAULT 0,
    "priorityScore" INTEGER NOT NULL DEFAULT 0,
    "scanCount" INTEGER NOT NULL DEFAULT 0,
    "candidateCount" INTEGER NOT NULL DEFAULT 0,
    "path" JSONB,
    "rationale" TEXT,
    "source" TEXT NOT NULL DEFAULT 'official_category_tree',
    "expandedAt" TIMESTAMP(3),
    "lastScannedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RadarCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RadarCategory_marketplace_externalId_key"
ON "RadarCategory"("marketplace", "externalId");

CREATE INDEX "RadarCategory_status_isLeaf_priorityScore_idx"
ON "RadarCategory"("status", "isLeaf", "priorityScore");

CREATE INDEX "RadarCategory_focusArea_expandedAt_depth_idx"
ON "RadarCategory"("focusArea", "expandedAt", "depth");

ALTER TABLE "ListingSnapshot" ADD COLUMN "radarCategoryId" TEXT;
ALTER TABLE "HumanDecision" ADD COLUMN "radarCategoryId" TEXT;

CREATE INDEX "ListingSnapshot_radarCategoryId_collectedAt_idx"
ON "ListingSnapshot"("radarCategoryId", "collectedAt");

CREATE INDEX "HumanDecision_radarCategoryId_status_idx"
ON "HumanDecision"("radarCategoryId", "status");

ALTER TABLE "ListingSnapshot"
ADD CONSTRAINT "ListingSnapshot_radarCategoryId_fkey"
FOREIGN KEY ("radarCategoryId") REFERENCES "RadarCategory"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HumanDecision"
ADD CONSTRAINT "HumanDecision_radarCategoryId_fkey"
FOREIGN KEY ("radarCategoryId") REFERENCES "RadarCategory"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "RadarCategory"
    ("id", "externalId", "name", "focusArea", "status", "depth", "isLeaf",
     "focusScore", "priorityScore", "rationale", "source", "updatedAt")
VALUES
    ('7b2b2230-a4db-4c79-b71c-a349ea04b001', 'MLB1574', 'Casa, Móveis e Decoração', 'HOME', 'EXPLORATORY', 0, false, 100, 0, 'Raiz oficial para descoberta controlada de categorias de casa.', 'portfolio_root', CURRENT_TIMESTAMP),
    ('7b2b2230-a4db-4c79-b71c-a349ea04b002', 'MLB1051', 'Celulares e Telefones', 'MOBILE', 'EXPLORATORY', 0, false, 100, 0, 'Raiz oficial para descoberta de acessórios passivos para celular.', 'portfolio_root', CURRENT_TIMESTAMP),
    ('7b2b2230-a4db-4c79-b71c-a349ea04b003', 'MLB1132', 'Brinquedos e Hobbies', 'TOYS', 'EXPLORATORY', 0, false, 100, 0, 'Raiz oficial para descoberta de brinquedos compactos e passivos.', 'portfolio_root', CURRENT_TIMESTAMP),
    ('7b2b2230-a4db-4c79-b71c-a349ea04b011', 'MLB271399', 'Suportes para Controle Remoto', 'HOME', 'PRIORITY', 3, true, 100, 100, 'Categoria compacta já validada no radar.', 'initial_portfolio', CURRENT_TIMESTAMP),
    ('7b2b2230-a4db-4c79-b71c-a349ea04b012', 'MLB271146', 'Porta Celulares', 'MOBILE', 'PRIORITY', 3, true, 100, 100, 'Categoria compacta já validada no radar.', 'initial_portfolio', CURRENT_TIMESTAMP),
    ('7b2b2230-a4db-4c79-b71c-a349ea04b013', 'MLB186369', 'Saboneteiras', 'HOME', 'PRIORITY', 3, true, 100, 100, 'Categoria compacta já validada no radar.', 'initial_portfolio', CURRENT_TIMESTAMP),
    ('7b2b2230-a4db-4c79-b71c-a349ea04b014', 'MLB1839', 'Figuras de Ação', 'TOYS', 'PRIORITY', 3, true, 90, 90, 'Categoria de brinquedos articulados já integrada ao radar.', 'initial_portfolio', CURRENT_TIMESTAMP),
    ('7b2b2230-a4db-4c79-b71c-a349ea04b015', 'MLB264330', 'Fidget Spinners', 'TOYS', 'PRIORITY', 3, true, 90, 90, 'Categoria de brinquedos passivos já integrada ao radar.', 'initial_portfolio', CURRENT_TIMESTAMP);

UPDATE "ListingSnapshot" AS snapshot
SET "radarCategoryId" = category."id"
FROM "RadarCategory" AS category
WHERE
    category."marketplace" = 'MERCADO_LIVRE'
    AND category."externalId" =
        snapshot."rawData" #>> '{candidate,sources,0,categoryId}';

UPDATE "HumanDecision" AS decision
SET "radarCategoryId" = snapshot."radarCategoryId"
FROM "ListingSnapshot" AS snapshot
WHERE
    decision."listingId" = snapshot."listingId"
    AND decision."collectionRunId" = snapshot."collectionRunId"
    AND snapshot."radarCategoryId" IS NOT NULL;

DELETE FROM "RadarPreference" WHERE "kind" = 'PREFERRED';
