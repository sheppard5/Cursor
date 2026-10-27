import { endpointFrom, readJson, withErrors } from "@/lib/http";
import { readDevice } from "@/lib/tuner";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return withErrors(async () => {
    const endpoint = endpointFrom(await readJson(request));
    const device = await readDevice(endpoint.host, endpoint.port);
    return { ok: true, device };
  });
}
