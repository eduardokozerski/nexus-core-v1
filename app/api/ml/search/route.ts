import { NextResponse } from "next/server";

import { requireApiSession } from "@/src/server/auth/session";

export async function GET() {
  if (!(await requireApiSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  return NextResponse.json(
    { error: "Direct product search is disabled. The active workflow is the category radar." },
    { status: 410 },
  );
}
