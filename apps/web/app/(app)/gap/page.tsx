import { redirect } from "next/navigation";

interface GapPageProps {
  searchParams: Promise<{ diagnosisId?: string; businessId?: string; tier?: string }>;
}

export default async function GapPage({ searchParams }: GapPageProps) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.diagnosisId) query.set("diagnosisId", params.diagnosisId);
  if (params.businessId) query.set("businessId", params.businessId);
  if (params.tier) query.set("tier", params.tier);
  const suffix = query.toString();
  redirect(`/rivals${suffix ? `?${suffix}` : ""}`);
}
