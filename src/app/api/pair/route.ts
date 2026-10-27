import { endpointFrom, readJson, withErrors } from "@/lib/http";
import { pairDevice } from "@/lib/tuner";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return withErrors(async () => {
    const body = await readJson(request);
    const endpoint = endpointFrom(body, "pairPort");
    const code = typeof body.code === "string" ? body.code : "";
    return pairDevice(endpoint.host, endpoint.port, code);
  });
}
