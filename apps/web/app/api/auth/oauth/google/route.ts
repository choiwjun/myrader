import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const returnTo = searchParams.get("returnTo") ?? "/";
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    return NextResponse.json(
      { success: false, code: "AUTH_PROVIDER_NOT_CONFIGURED", returnTo },
      { status: 501 },
    );
  }
  const url = new URL("/auth/v1/authorize", process.env.SUPABASE_URL);
  url.searchParams.set("provider", "google");
  url.searchParams.set("redirect_to", returnTo);
  return NextResponse.redirect(url);
}
