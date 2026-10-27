import { readJson, withErrors } from "@/lib/http";
import { pollQrPairing, startQrPairing, stopQrPairing } from "@/lib/tuner";
import { TunerError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export function POST() {
  return withErrors(() => startQrPairing());
}

export function PUT(request: Request) {
  return withErrors(async () => {
    const body = await readJson(request);
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    if (!sessionId) throw new TunerError("Немає sessionId для опитування QR.", 400);
    return pollQrPairing(sessionId);
  });
}

export function DELETE(request: Request) {
  return withErrors(async () => {
    const body = await readJson(request).catch(() => ({} as Record<string, unknown>));
    const fromBody = typeof body.sessionId === "string" ? body.sessionId : "";
    const fromQuery = new URL(request.url).searchParams.get("sessionId") ?? "";
    const sessionId = fromBody || fromQuery;
    if (!sessionId) throw new TunerError("Немає sessionId для скасування.", 400);
    return stopQrPairing(sessionId);
  });
}
