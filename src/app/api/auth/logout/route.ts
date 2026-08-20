import { NextResponse } from "next/server";
import { signOut } from "@/lib/rbac/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  await signOut();
  return NextResponse.json({ ok: true });
}
