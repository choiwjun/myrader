import { redirect } from "next/navigation";

interface GapPageProps {
  searchParams: Promise<{ diagnosisId?: string }>;
}

export default async function GapPage({ searchParams }: GapPageProps) {
  const { diagnosisId } = await searchParams;
  const query = diagnosisId ? `?diagnosisId=${encodeURIComponent(diagnosisId)}` : "";
  redirect(`/rivals${query}`);
}
