import { NextResponse } from "next/server";
import { googleErrorMessage, requireAuthenticatedGoogleContext } from "@/lib/google/server";
import { rejectCrossOriginMutation, rejectOversizedBody } from "@/lib/security/http";
import { addTime, TimerOperationError } from "@/lib/timer/server";

export async function POST(request: Request) {
  const originError = rejectCrossOriginMutation(request) ?? rejectOversizedBody(request);
  if (originError) return originError;
  const context = await requireAuthenticatedGoogleContext();
  if (!context) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const minutes = typeof body?.minutes === "number" ? body.minutes : Number(body?.minutes);
  try {
    return NextResponse.json(await addTime({ userId: context.user.id, minutes, request, requestKey: typeof body?.requestKey === "string" ? body.requestKey : undefined }));
  } catch (error) {
    if (error instanceof TimerOperationError) return NextResponse.json({ error: error.message, code: error.code, ...error.details }, { status: error.status });
    return NextResponse.json({ error: googleErrorMessage(error) }, { status: 502 });
  }
}
