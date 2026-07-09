import { buildCreatorRadarSnapshot } from "@/lib/creator/service";
import { CreatorRadarClient } from "./CreatorRadarClient";

export default async function CreatorRadarPage({
  searchParams,
}: {
  readonly searchParams?: Promise<{ readonly channelUrl?: string; readonly topic?: string }>;
}) {
  const params = await searchParams;
  const snapshot = await buildCreatorRadarSnapshot({
    channelUrl: params?.channelUrl ?? null,
    topicName: params?.topic,
  });
  return <CreatorRadarClient initialSnapshot={snapshot} />;
}
