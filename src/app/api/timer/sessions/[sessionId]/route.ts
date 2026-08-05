import { NextResponse } from "next/server";
import { googleErrorMessage, requireAuthenticatedGoogleContext } from "@/lib/google/server";
import { rejectCrossOriginMutation, rejectOversizedBody } from "@/lib/security/http";
import { correctSession, TimerOperationError } from "@/lib/timer/server";

export async function PATCH(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const originError = rejectCrossOriginMutation(request) ?? rejectOversizedBody(request);
  if (originError) return originError;
  const auth = await requireAuthenticatedGoogleContext();
  if (!auth) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { sessionId } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const startedAt = typeof body?.startedAt === "string" ? body.startedAt : "";
  const stoppedAt = typeof body?.stoppedAt === "string" ? body.stoppedAt : "";
  const reason = typeof body?.reason === "string" ? body.reason : "";
  try {
    return NextResponse.json(await correctSession({ userId: auth.user.id, sessionId, startedAt, stoppedAt, reason, request }));
  } catch (error) {
    if (error instanceof TimerOperationError) return NextResponse.json({ error: error.message, code: error.code, ...error.details }, { status: error.status });
    return NextResponse.json({ error: googleErrorMessage(error) }, { status: 502 });
  }
}
