import { getOptionalCreatorAccountId } from "@/lib/creator/account";
import { buildCreatorRadarSnapshot } from "@/lib/creator/service";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accountId = await getOptionalCreatorAccountId();
  const data = await buildCreatorRadarSnapshot({
    accountId,
    channelUrl: searchParams.get("channelUrl"),
    topicName: searchParams.get("topic") ?? undefined,
  });
  return NextResponse.json({ success: true, data });
}
