import { redirect } from "next/navigation";

interface ActionsPageProps {
  searchParams: Promise<{
    diagnosisId?: string;
    tier?: string;
    actionId?: string;
    keyword?: string;
    radarKeywordId?: string;
  }>;
}

export default async function ActionsPage({ searchParams }: ActionsPageProps) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.diagnosisId) query.set("diagnosisId", params.diagnosisId);
  if (params.tier) query.set("tier", params.tier);
  if (params.actionId) query.set("actionId", params.actionId);
  if (params.keyword) query.set("keyword", params.keyword);
  if (params.radarKeywordId) query.set("radarKeywordId", params.radarKeywordId);
  const suffix = query.toString();
  redirect(`/write${suffix ? `?${suffix}` : ""}`);
}
