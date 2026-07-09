import { getCreatorCitations } from "@/lib/creator/service";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ success: true, data: getCreatorCitations() });
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetId = searchParams.get("targetId");
  if (!targetId) {
    return NextResponse.json({ success: false, code: "TARGET_REQUIRED" }, { status: 400 });
  }
  return NextResponse.json({
    success: true,
    data: { targetId, status: "queued", message: "manual citation probe queued" },
  });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetId = searchParams.get("targetId");
  if (!targetId) {
    return NextResponse.json({ success: false, code: "TARGET_REQUIRED" }, { status: 400 });
  }
  return NextResponse.json({ success: true, data: { targetId, deleted: true } });
}
