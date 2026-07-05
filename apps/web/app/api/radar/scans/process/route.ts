import { processRadarScanQueue } from "@/lib/radar";
import { isProduction } from "@/lib/shared/runtime-env";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  let mismatch = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return mismatch === 0;
}

function isAuthorized(request: Request): boolean {
  const radarSecret = process.env.RADAR_PROCESS_SECRET ?? "";
  const cronSecret = process.env.CRON_SECRET ?? "";

  if (!radarSecret && !cronSecret) {
    return !isProduction();
  }

  const headerSecret = request.headers.get("x-radar-secret") ?? "";
  if (radarSecret && timingSafeEqual(headerSecret, radarSecret)) return true;

  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (cronSecret && timingSafeEqual(bearer, cronSecret)) return true;

  return false;
}

async function handle(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "Forbidden", code: "FORBIDDEN", success: false },
      { status: 403 },
    );
  }

  try {
    const result = await processRadarScanQueue();
    return NextResponse.json({ data: result, success: true });
  } catch (error) {
    console.error("/api/radar/scans/process error:", error);
    return NextResponse.json({ error: "Internal Server Error", success: false }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  return handle(request);
}

export async function GET(request: Request): Promise<NextResponse> {
  return handle(request);
}
