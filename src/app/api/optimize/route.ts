import { endpointFrom, optionsFrom, readJson, withErrors } from "@/lib/http";
import { applyOptimize } from "@/lib/tuner";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return withErrors(async () => {
    const body = await readJson(request);
    const endpoint = endpointFrom(body);
    const result = await applyOptimize(endpoint.host, endpoint.port, optionsFrom(body));
    return {
      ok: result.results.every((step) => step.ok),
      results: result.results,
      device: result.device,
    };
  });
}
