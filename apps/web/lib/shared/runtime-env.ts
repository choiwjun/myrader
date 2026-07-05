export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function isMockFallbackAllowed(): boolean {
  return !isProduction();
}

export function assertMockAllowedOrThrow(feature: string): void {
  if (!isMockFallbackAllowed()) {
    throw new MockNotAllowedInProductionError(feature);
  }
}

export class MockNotAllowedInProductionError extends Error {
  readonly feature: string;
  constructor(feature: string) {
    super(`${feature}: real credentials are required in production (mock fallback is disabled).`);
    this.name = "MockNotAllowedInProductionError";
    this.feature = feature;
  }
}
