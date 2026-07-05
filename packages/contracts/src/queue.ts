/**
 * Shared queue contracts.
 *
 * Queue producers and consumers live in separate apps, so retry semantics must
 * be defined in a package both sides can import without creating an app-to-app
 * dependency.
 */

export const ANALYZE_QUEUE_NAME = "analyze" as const;

export const DEFAULT_ANALYZE_JOB_OPTIONS = {
	attempts: 3,
	backoff: { type: "exponential", delay: 30_000 },
	removeOnComplete: { age: 3600, count: 100 },
	removeOnFail: { age: 86_400 },
} as const;
