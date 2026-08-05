import { NextResponse } from "next/server";
import { googleErrorMessage, requireAuthenticatedGoogleContext } from "@/lib/google/server";
import { rejectCrossOriginMutation, rejectOversizedBody } from "@/lib/security/http";
import { startTimer, TimerOperationError } from "@/lib/timer/server";

export async function POST(request: Request) {
  const originError = rejectCrossOriginMutation(request) ?? rejectOversizedBody(request);
  if (originError) return originError;
  const context = await requireAuthenticatedGoogleContext();
  if (!context) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const taskId = typeof body?.taskId === "string" ? body.taskId.trim() : "";
  if (!taskId || taskId.length > 240) return NextResponse.json({ error: "Choose a task first." }, { status: 400 });

  try {
    return NextResponse.json(await startTimer({
      userId: context.user.id,
      taskId,
      request,
      startedAt: typeof body?.startedAt === "string" ? body.startedAt : undefined,
      choice: body?.choice === "overlap" || body?.choice === "next_free" ? body.choice : undefined,
      reopen: body?.reopen === true,
      missedBlockId: typeof body?.missedBlockId === "string" ? body.missedBlockId : undefined,
    }));
  } catch (error) {
    if (error instanceof TimerOperationError) {
      return NextResponse.json({ error: error.message, code: error.code, ...error.details }, { status: error.status });
    }
    return NextResponse.json({ error: googleErrorMessage(error) }, { status: 502 });
  }
}
