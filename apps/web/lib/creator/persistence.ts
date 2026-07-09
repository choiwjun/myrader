import { type DbClient, createDb } from "@boina/db/client";
import { creatorKeywords, creatorScans, creatorTopics } from "@boina/db/schema";
import type { CreatorRadarSnapshot } from "./types";

type PersistTrigger = "auto" | "manual" | "onboarding";

interface PersistOptions {
  readonly accountId: string | null;
  readonly trigger: PersistTrigger;
}

export async function maybePersistCreatorRadar(
  snapshot: CreatorRadarSnapshot,
  options: PersistOptions,
): Promise<CreatorRadarSnapshot> {
  if (!options.accountId || !process.env.DATABASE_URL) return snapshot;

  try {
    const db = createDb(process.env.DATABASE_URL);
    return await persistCreatorRadar(db, snapshot, options);
  } catch (error) {
    console.error("creator radar persistence failed:", error);
    return {
      ...snapshot,
      channels: snapshot.channels.map((channel) =>
        channel.name === "블로그"
          ? { ...channel, status: "failed", detail: "DB 저장 실패, 화면은 임시 스냅샷으로 표시" }
          : channel,
      ),
    };
  }
}

export async function persistCreatorRadar(
  db: DbClient,
  snapshot: CreatorRadarSnapshot,
  options: PersistOptions,
): Promise<CreatorRadarSnapshot> {
  if (!options.accountId) return snapshot;
  const [topic] = await db
    .insert(creatorTopics)
    .values({
      accountId: options.accountId,
      name: snapshot.topic.name,
      seedTokens: [snapshot.topic.name],
      channelUrl: snapshot.topic.channelUrl,
      plan: snapshot.topic.plan,
    })
    .returning({ id: creatorTopics.id });
  if (!topic) return snapshot;

  const [scan] = await db
    .insert(creatorScans)
    .values({
      topicId: topic.id,
      trigger: options.trigger,
      status: "done",
      stageDetail: snapshot.scan.stageDetail,
      startedAt: new Date(snapshot.scan.lastScannedAt),
      finishedAt: new Date(snapshot.scan.lastScannedAt),
    })
    .returning({ id: creatorScans.id });
  if (!scan) return { ...snapshot, topic: { ...snapshot.topic, id: topic.id } };

  if (snapshot.keywords.length > 0) {
    await db.insert(creatorKeywords).values(
      snapshot.keywords.map((keyword) => ({
        scanId: scan.id,
        text: keyword.text,
        clusterId: keyword.clusterId,
        naverScore: keyword.naverScore,
        aiScore: keyword.aiScore,
        verdict: keyword.verdict,
        naverEvidence: {
          docs: keyword.naverEvidence.docs,
          reasons: keyword.naverEvidence.reasons,
          saturation: keyword.naverEvidence.saturation,
          trend7d: keyword.naverEvidence.trend7d,
          volume: keyword.naverEvidence.volume,
        },
        aiEvidence: keyword.aiEvidence
          ? {
              blogGap: keyword.aiEvidence.blogGap,
              citedSources: keyword.aiEvidence.citedSources,
              methodology: keyword.aiEvidence.methodology,
              probeSummary: keyword.aiEvidence.probeSummary,
              queryText: keyword.aiEvidence.queryText,
            }
          : null,
      })),
    );
  }

  return {
    ...snapshot,
    topic: { ...snapshot.topic, id: topic.id },
    scan: { ...snapshot.scan, id: scan.id },
  };
}
