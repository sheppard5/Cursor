import { sanitizeRefresh } from "@/lib/endpoint";
import { TunerError } from "@/lib/errors";
import { endpointFrom, readJson, withErrors } from "@/lib/http";
import type { RefreshRestore } from "@/lib/plan";
import { restoreDevice } from "@/lib/tuner";

function refreshFrom(body: Record<string, unknown>): RefreshRestore | undefined {
  if (body.restoreRefresh !== true) return undefined;
  const peak = sanitizeRefresh(body.peakRefresh);
  const min = sanitizeRefresh(body.minRefresh);
  if (!peak.ok || !min.ok) {
    throw new TunerError("Частота екрана для відновлення має бути числом від 1 до 165.", 400);
  }
  return { peak: peak.value, min: min.value };
}

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return withErrors(async () => {
    const body = await readJson(request);
    const endpoint = endpointFrom(body);
    const result = await restoreDevice(endpoint.host, endpoint.port, body.screenOffTimeoutMs, refreshFrom(body));
    return {
      ok: result.results.every((step) => step.ok),
      results: result.results,
      device: result.device,
    };
  });
}
