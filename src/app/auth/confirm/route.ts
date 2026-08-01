import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getAppPath } from "@/lib/supabase/config";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function getSafeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return getAppPath("/");
  }

  return value;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const code = url.searchParams.get("code");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = getSafeNext(url.searchParams.get("next"));
  const client = await getSupabaseServerClient();

  if (!client || (!code && (!tokenHash || type !== "email"))) {
    return NextResponse.redirect(new URL(`${getAppPath("/login")}?error=invalid_link`, request.url));
  }

  const result = code
    ? await client.auth.exchangeCodeForSession(code)
    : await client.auth.verifyOtp({ token_hash: tokenHash as string, type: type as EmailOtpType });
  const { error } = result;
  if (error) {
    const errorCode = error.message.toLowerCase().includes("expired") ? "expired_link" : "invalid_link";
    return NextResponse.redirect(new URL(`${getAppPath("/login")}?error=${errorCode}`, request.url));
  }

  return NextResponse.redirect(new URL(next, request.url));
}
