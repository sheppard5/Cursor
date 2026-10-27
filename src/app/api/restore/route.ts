import { endpointFrom, readJson, withErrors } from "@/lib/http";
import { restoreDevice } from "@/lib/tuner";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return withErrors(async () => {
    const body = await readJson(request);
    const endpoint = endpointFrom(body);
    const result = await restoreDevice(endpoint.host, endpoint.port, body.screenOffTimeoutMs);
    return {
      ok: result.results.every((step) => step.ok),
      results: result.results,
      device: result.device,
    };
  });
}
