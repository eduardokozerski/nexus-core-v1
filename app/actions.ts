"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createSession, destroySession, requireSession } from "@/src/server/auth/session";
import { verifyPassword } from "@/src/server/auth/password";
import { getDatabase } from "@/src/server/db/client";
import {
  createOrReusePendingRadarRun,
  markRadarRunFailed,
} from "@/src/server/history/radar-history";
import { enqueueMarketplaceRadar } from "@/src/server/jobs/marketplace-queue";
import { refreshRadarCategoryScore } from "@/src/server/marketplace/mercadolivre/api/category-portfolio";
import { normalizeRadarText } from "@/src/server/marketplace/mercadolivre/api/radar-preferences";

const credentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(200),
});

export async function loginAction(formData: FormData) {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) redirect("/login?error=Informe+e-mail+e+senha+validos");
  const user = await getDatabase().user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    redirect("/login?error=Credenciais+invalidas");
  }
  await createSession(user);
  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function startRadarCollectionAction() {
  await requireSession();
  const database = getDatabase();
  const pending = await createOrReusePendingRadarRun(database);
  if (!pending.created) {
    revalidatePath("/runs");
    redirect(`/runs?success=Radar+ja+esta+em+andamento&run=${pending.collectionRunId}`);
  }

  try {
    await enqueueMarketplaceRadar(pending.collectionRunId);
  } catch (error) {
    await markRadarRunFailed(database, pending.collectionRunId, error);
    revalidatePath("/runs");
    redirect("/runs?error=Nao+foi+possivel+agendar+o+radar");
  }
  revalidatePath("/runs");
  redirect(`/runs?success=Radar+de+categorias+agendado&run=${pending.collectionRunId}`);
}

export async function saveDecisionAction(formData: FormData) {
  await requireSession();
  const schema = z.object({
    listingId: z.string().uuid(),
    collectionRunId: z.string().uuid(),
    status: z.enum(["VALIDATED", "REJECTED"]),
    notes: z.string().trim().max(500).default(""),
    returnPath: z.string(),
  });
  const value = schema.parse({
    listingId: formData.get("listingId"),
    collectionRunId: formData.get("collectionRunId"),
    status: formData.get("status"),
    notes: formData.get("notes") || "",
    returnPath: formData.get("returnPath"),
  });
  if (
    value.returnPath !== "/candidates" &&
    !/^\/runs\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value.returnPath,
    )
  ) {
    throw new Error("Rota de retorno invÃ¡lida para registrar a decisÃ£o.");
  }
  const database = getDatabase();
  const snapshot = await database.listingSnapshot.findUnique({
    where: {
      listingId_collectionRunId: {
        listingId: value.listingId,
        collectionRunId: value.collectionRunId,
      },
    },
    select: { radarCategoryId: true },
  });
  await database.humanDecision.create({
    data: {
      externalDecisionKey: `ui:${randomUUID()}`,
      ...value,
      radarCategoryId: snapshot?.radarCategoryId,
      source: "admin_ui",
    },
  });
  await refreshRadarCategoryScore(database, snapshot?.radarCategoryId ?? null);
  revalidatePath(value.returnPath);
}

export async function saveRadarPreferenceAction(formData: FormData) {
  await requireSession();
  const schema = z.object({
    term: z.string().trim().min(2).max(100),
    reason: z.string().trim().max(300).default(""),
  });
  const value = schema.parse({
    term: formData.get("term"),
    reason: formData.get("reason") || "",
  });
  const normalizedTerm = normalizeRadarText(value.term);
  if (normalizedTerm.length < 2) {
    redirect("/search-terms?error=Informe+um+termo+mais+especifico");
  }

  await getDatabase().radarPreference.upsert({
    where: {
      kind_normalizedTerm: {
        kind: "BANNED",
        normalizedTerm,
      },
    },
    create: {
      ...value,
      kind: "BANNED",
      normalizedTerm,
      reason: value.reason || null,
    },
    update: {
      term: value.term,
      reason: value.reason || null,
      active: true,
    },
  });
  revalidatePath("/search-terms");
  redirect("/search-terms?success=Preferencia+salva");
}

export async function toggleRadarPreferenceAction(formData: FormData) {
  await requireSession();
  const value = z
    .object({
      id: z.string().uuid(),
      active: z.enum(["true", "false"]),
    })
    .parse({
      id: formData.get("id"),
      active: formData.get("active"),
    });

  await getDatabase().radarPreference.update({
    where: { id: value.id },
    data: { active: value.active === "true" },
  });
  revalidatePath("/search-terms");
}

export async function removeRadarPreferenceAction(formData: FormData) {
  await requireSession();
  const { id } = z
    .object({ id: z.string().uuid() })
    .parse({ id: formData.get("id") });

  await getDatabase().radarPreference.deleteMany({
    where: { id },
  });
  revalidatePath("/search-terms");
  redirect("/search-terms?success=Preferencia+removida");
}

export async function setRadarCategoryStatusAction(formData: FormData) {
  await requireSession();
  const value = z
    .object({
      id: z.string().uuid(),
      status: z.enum(["EXPLORATORY", "PRIORITY", "PAUSED", "DISCARDED"]),
    })
    .parse({
      id: formData.get("id"),
      status: formData.get("status"),
    });

  await getDatabase().radarCategory.update({
    where: { id: value.id },
    data: { status: value.status },
  });
  revalidatePath("/search-terms");
  revalidatePath("/dashboard");
}
