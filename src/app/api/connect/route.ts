import { endpointFrom, readJson, withErrors } from "@/lib/http";
import { connectDevice } from "@/lib/tuner";

export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return withErrors(async () => {
    const endpoint = endpointFrom(await readJson(request));
    const connection = await connectDevice(endpoint.host, endpoint.port);
    return { ok: connection.status === "connected", ...connection };
  });
}
