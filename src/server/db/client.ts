import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/src/generated/prisma/client";

const globalDatabase = globalThis as unknown as {
  nexusCorePrisma?: PrismaClient;
};

export function getDatabase(): PrismaClient {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL não configurada. Configure o PostgreSQL antes de importar o histórico.",
    );
  }

  if (globalDatabase.nexusCorePrisma) return globalDatabase.nexusCorePrisma;

  const adapter = new PrismaPg({ connectionString });
  const database = new PrismaClient({ adapter });

  if (process.env.NODE_ENV !== "production") {
    globalDatabase.nexusCorePrisma = database;
  }

  return database;
}
