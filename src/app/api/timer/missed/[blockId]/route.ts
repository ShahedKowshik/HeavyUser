import { NextResponse } from "next/server";
import { googleErrorMessage, requireAuthenticatedGoogleContext } from "@/lib/google/server";
import { rejectCrossOriginMutation } from "@/lib/security/http";
import { rescheduleMissedBlock, TimerOperationError } from "@/lib/timer/server";

export async function POST(request: Request, context: { params: Promise<{ blockId: string }> }) {
  const originError = rejectCrossOriginMutation(request);
  if (originError) return originError;
  const auth = await requireAuthenticatedGoogleContext();
  if (!auth) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { blockId } = await context.params;
  if (!blockId || blockId.length > 240) return NextResponse.json({ error: "That missed block is invalid." }, { status: 400 });
  try {
    return NextResponse.json(await rescheduleMissedBlock({ userId: auth.user.id, blockId, request }));
  } catch (error) {
    if (error instanceof TimerOperationError) return NextResponse.json({ error: error.message, code: error.code, ...error.details }, { status: error.status });
    return NextResponse.json({ error: googleErrorMessage(error) }, { status: 502 });
  }
}
