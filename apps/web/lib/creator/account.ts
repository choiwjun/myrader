export async function getOptionalCreatorAccountId(): Promise<string | null> {
  if (!process.env.DATABASE_URL) return null;

  try {
    const { getCurrentUser } = await import("@/lib/auth");
    const user = await getCurrentUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}
