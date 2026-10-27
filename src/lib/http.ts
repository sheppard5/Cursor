import { TunerError } from "./errors";
import { parseOptions } from "./options";
import { parseEndpoint } from "./endpoint";

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TunerError("Некоректний запит.", 400);
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof TunerError) throw error;
    throw new TunerError("Некоректний JSON.", 400);
  }
}

export function endpointFrom(body: Record<string, unknown>, portKey = "port") {
  const host = typeof body.host === "string" ? body.host : "";
  const rawPort = body[portKey];
  const port = typeof rawPort === "number" ? rawPort : Number(rawPort);
  return parseEndpoint(host, port);
}

export function optionsFrom(body: Record<string, unknown>) {
  return parseOptions(body.options);
}

export async function withErrors(work: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await work());
  } catch (error) {
    if (error instanceof TunerError) {
      return Response.json({ ok: false, message: error.message }, { status: error.status });
    }
    console.error(error);
    return Response.json({ ok: false, message: "Внутрішня помилка оптимізатора." }, { status: 500 });
  }
}
