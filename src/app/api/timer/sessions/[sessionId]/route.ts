import { NextResponse } from "next/server";
import { googleErrorMessage, requireAuthenticatedGoogleContext } from "@/lib/google/server";
import { isUuid, readJsonBody, rejectCrossOriginMutation } from "@/lib/security/http";
import { correctSession, deleteSession, TimerOperationError } from "@/lib/timer/server";

export async function PATCH(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const parsedBody = await readJsonBody<Record<string, unknown>>(request);
  if (parsedBody.errorResponse) return parsedBody.errorResponse;
  const auth = await requireAuthenticatedGoogleContext();
  if (!auth) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { sessionId } = await context.params;
  if (!isUuid(sessionId)) {
    return NextResponse.json({ error: "That work session is invalid." }, { status: 400 });
  }
  const body = parsedBody.data;
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

export async function DELETE(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const auth = await requireAuthenticatedGoogleContext();
  if (!auth) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { sessionId } = await context.params;
  if (!isUuid(sessionId)) {
    return NextResponse.json({ error: "That work session is invalid." }, { status: 400 });
  }
  try {
    return NextResponse.json(await deleteSession({ userId: auth.user.id, sessionId, request }));
  } catch (error) {
    if (error instanceof TimerOperationError) return NextResponse.json({ error: error.message, code: error.code, ...error.details }, { status: error.status });
    return NextResponse.json({ error: googleErrorMessage(error) }, { status: 502 });
  }
}
