import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const client = await getSupabaseServerClient();
  if (!client) {
    return NextResponse.json({ user: null }, { status: 503 });
  }

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  // Return the verified user profile only. Access and refresh tokens remain
  // in the Supabase-managed cookies and are never exposed by this route.
  return NextResponse.json({ user: data.user }, { headers: { "Cache-Control": "private, no-store" } });
}
