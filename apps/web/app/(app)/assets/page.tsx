import { redirect } from "next/navigation";

interface AssetsPageProps {
  searchParams: Promise<{
    diagnosisId?: string;
    type?: string;
    keyword?: string;
    radarKeywordId?: string;
  }>;
}

export default async function AssetsPage({ searchParams }: AssetsPageProps) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.diagnosisId) query.set("diagnosisId", params.diagnosisId);
  if (params.type) query.set("type", params.type);
  if (params.keyword) query.set("keyword", params.keyword);
  if (params.radarKeywordId) query.set("radarKeywordId", params.radarKeywordId);
  const suffix = query.toString();
  redirect(`/write${suffix ? `?${suffix}` : ""}`);
}
