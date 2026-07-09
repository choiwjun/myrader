import { getCreatorWeeklyReport } from "@/lib/creator/service";
import { NextResponse } from "next/server";

export async function GET() {
  const data = await getCreatorWeeklyReport();
  return NextResponse.json({ success: true, data });
}
