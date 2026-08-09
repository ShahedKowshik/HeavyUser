import { NextResponse } from "next/server";
import { googleErrorMessage, requireAuthenticatedGoogleContext } from "@/lib/google/server";
import { isUuid, readJsonBody, rejectCrossOriginMutation } from "@/lib/security/http";
import { stopTimer, TimerOperationError } from "@/lib/timer/server";

export async function POST(request: Request) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const parsedBody = await readJsonBody<Record<string, unknown>>(request);
  if (parsedBody.errorResponse) return parsedBody.errorResponse;
  const context = await requireAuthenticatedGoogleContext();
  if (!context) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const body = parsedBody.data;
  const action = body?.action === "finish" || body?.action === "keep_long" || body?.action === "split" ? body.action : undefined;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : undefined;
  if (sessionId && !isUuid(sessionId)) {
    return NextResponse.json({ error: "That work session is invalid." }, { status: 400 });
  }
  try {
    return NextResponse.json(await stopTimer({
      userId: context.user.id,
      request,
      sessionId,
      stoppedAt: typeof body?.stoppedAt === "string" ? body.stoppedAt : undefined,
      action,
      complete: body?.complete === true,
    }));
  } catch (error) {
    if (error instanceof TimerOperationError) {
      return NextResponse.json({ error: error.message, code: error.code, ...error.details }, { status: error.status });
    }
    return NextResponse.json({ error: googleErrorMessage(error) }, { status: 502 });
  }
}
