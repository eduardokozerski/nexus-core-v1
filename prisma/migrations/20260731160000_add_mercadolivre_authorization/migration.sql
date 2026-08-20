-- CreateEnum
CREATE TYPE "MercadoLivreAuthorizationStatus" AS ENUM ('ACTIVE', 'REAUTH_REQUIRED', 'REVOKED');

-- CreateTable
CREATE TABLE "MercadoLivreAuthorization" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "accessTokenCiphertext" TEXT NOT NULL,
    "refreshTokenCiphertext" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "status" "MercadoLivreAuthorizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastRefreshAt" TIMESTAMP(3),
    "lastRefreshError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MercadoLivreAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MercadoLivreAuthorization_sellerId_key" ON "MercadoLivreAuthorization"("sellerId");
CREATE INDEX "MercadoLivreAuthorization_status_accessTokenExpiresAt_idx" ON "MercadoLivreAuthorization"("status", "accessTokenExpiresAt");
