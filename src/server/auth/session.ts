import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const COOKIE_NAME = "nexus_session";
const SESSION_SECONDS = 60 * 60 * 8;

export interface AdminSession {
  userId: string;
  email: string;
  expiresAt: number;
}

function secret(): string {
  const value = process.env.AUTH_SECRET?.trim();
  if (!value || value.length < 32) throw new Error("AUTH_SECRET deve ter pelo menos 32 caracteres.");
  return value;
}

function signature(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function encodeSession(session: AdminSession): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

function decodeSession(token: string): AdminSession | null {
  try {
    const [payload, providedSignature] = token.split(".");
    if (!payload || !providedSignature) return null;
    const expected = Buffer.from(signature(payload));
    const provided = Buffer.from(providedSignature);
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AdminSession;
    if (!value.userId || !value.email || value.expiresAt <= Date.now()) return null;
    return value;
  } catch {
    return null;
  }
}

export async function createSession(user: { id: string; email: string }): Promise<void> {
  const expiresAt = Date.now() + SESSION_SECONDS * 1000;
  (await cookies()).set(COOKIE_NAME, encodeSession({ userId: user.id, email: user.email, expiresAt }), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_SECONDS,
    priority: "high",
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

export async function getSession(): Promise<AdminSession | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return token ? decodeSession(token) : null;
}

export async function requireSession(): Promise<AdminSession> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireApiSession(): Promise<AdminSession | null> {
  return getSession();
}
