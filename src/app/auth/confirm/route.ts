import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getSafeSameOriginPath } from "@/lib/security/redirect";
import { getAppPath, getAppRedirectOrigin } from "@/lib/supabase/config";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirectOrigin = getAppRedirectOrigin(request);
  if (!redirectOrigin) {
    return NextResponse.json({ error: "The application origin is not configured." }, { status: 503 });
  }
  const tokenHash = url.searchParams.get("token_hash");
  const code = url.searchParams.get("code");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = getSafeSameOriginPath(url.searchParams.get("next"), request.url, getAppPath("/"));
  const client = await getSupabaseServerClient();

  if (!client || (!code && (!tokenHash || type !== "email"))) {
    return NextResponse.redirect(new URL(`${getAppPath("/login")}?error=invalid_link`, redirectOrigin));
  }

  const result = code
    ? await client.auth.exchangeCodeForSession(code)
    : await client.auth.verifyOtp({ token_hash: tokenHash as string, type: type as EmailOtpType });
  const { error } = result;
  if (error) {
    const errorCode = error.message.toLowerCase().includes("expired") ? "expired_link" : "invalid_link";
    return NextResponse.redirect(new URL(`${getAppPath("/login")}?error=${errorCode}`, redirectOrigin));
  }

  return NextResponse.redirect(new URL(next, redirectOrigin));
}
