import { getOptionalCreatorAccountId } from "@/lib/creator/account";
import { buildCreatorRadarSnapshot, previewCreatorTopic } from "@/lib/creator/service";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { readJson, topicSchema, validationError } from "../_shared";

export async function POST(request: Request) {
  const body = await readJson(request);
  const parsed = topicSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);
  const accountId = await getOptionalCreatorAccountId();

  const [preview, radar] = await Promise.all([
    previewCreatorTopic(parsed.data.topic),
    buildCreatorRadarSnapshot({
      accountId,
      topicName: parsed.data.topic,
      channelUrl: parsed.data.channelUrl ?? null,
    }),
  ]);

  return NextResponse.json({ success: true, data: { preview, radar } }, { status: 201 });
}

export function isTopicPayload(input: unknown): input is z.infer<typeof topicSchema> {
  return topicSchema.safeParse(input).success;
}
