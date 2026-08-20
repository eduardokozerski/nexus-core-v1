import { getDatabase } from "@/src/server/db/client";
import { hashPassword } from "./password";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const name = process.env.ADMIN_NAME?.trim() || "Administrador";
  if (!email || !email.includes("@")) throw new Error("Defina ADMIN_EMAIL com um e-mail válido.");
  const passwordHash = await hashPassword(password);
  await getDatabase().user.upsert({ where: { email }, create: { email, name, passwordHash }, update: { name, passwordHash } });
  console.log(`Administrador ${email} configurado.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
