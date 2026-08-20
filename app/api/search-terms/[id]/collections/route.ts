import { NextResponse } from "next/server";

import { requireApiSession } from "@/src/server/auth/session";

export async function POST() {
  if (!(await requireApiSession())) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  return NextResponse.json(
    { error: "Keyword collections are not part of the active product flow. Run the category radar instead." },
    { status: 410 },
  );
}
