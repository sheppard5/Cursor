import { withErrors } from "@/lib/http";
import { health } from "@/lib/tuner";

export const dynamic = "force-dynamic";

export function GET() {
  return withErrors(() => health());
}
