import { redirect } from "next/navigation";

interface ComparePageProps {
  searchParams: Promise<{ diagnosisId?: string }>;
}

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const { diagnosisId } = await searchParams;
  const query = diagnosisId ? `?diagnosisId=${encodeURIComponent(diagnosisId)}` : "";
  redirect(`/rivals${query}`);
}
