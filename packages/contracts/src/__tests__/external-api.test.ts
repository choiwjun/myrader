import { describe, expect, it } from "vitest";
import {
	ExternalAnalyzeRequestSchema,
	ExternalAnalyzeResponseSchema,
	ExternalPdfResponseSchema,
	ExternalReportResponseSchema,
	ExternalUsageResponseSchema,
} from "../external-api";

const baseExternalAnalyzeRequest = {
	websiteUrl: "https://example.com",
	businessName: "Example Cafe",
	industry: "cafe",
	region: "Seoul",
	mainServices: ["coffee"],
	targetKeywords: ["cafe"],
	modules: ["seo"],
};

describe("ExternalAnalyzeRequestSchema", () => {
	it("inherits enableJsRendering default false from AnalyzeRequestSchema", () => {
		const parsed = ExternalAnalyzeRequestSchema.parse(
			baseExternalAnalyzeRequest,
		);

		expect(parsed.enableJsRendering).toBe(false);
	});

	it("accepts explicit JS rendering requests for partner diagnostics", () => {
		const parsed = ExternalAnalyzeRequestSchema.parse({
			...baseExternalAnalyzeRequest,
			enableJsRendering: true,
		});

		expect(parsed.enableJsRendering).toBe(true);
	});
});

describe("ExternalAnalyzeResponseSchema", () => {
	it("accepts the 90s ETA returned for JS-rendered partner diagnostics", () => {
		const parsed = ExternalAnalyzeResponseSchema.parse({
			reportId: "8b1b3d9e-6c2a-4f0a-8a5e-2c5b1c8d4a01",
			status: "queued",
			etaSeconds: 90,
			pollingUrl:
				"/v1/external/reports/8b1b3d9e-6c2a-4f0a-8a5e-2c5b1c8d4a01",
			webhookConfirmed: false,
		});

		expect(parsed.etaSeconds).toBe(90);
	});
});

describe("ExternalReportResponseSchema", () => {
	it("accepts running report polling responses", () => {
		const parsed = ExternalReportResponseSchema.parse({
			reportId: "report-1",
			status: "running",
			message: "Report is being processed. Poll again in a few seconds.",
			pollingUrl: "/v1/external/reports/report-1",
		});

		expect(parsed.status).toBe("running");
	});

	it("accepts completed report summary responses", () => {
		const parsed = ExternalReportResponseSchema.parse({
			reportId: "report-1",
			status: "completed",
			websiteUrl: "https://example.com",
			overallScore: 87,
			seoScore: 90,
			aeoScore: 80,
			geoScore: 82,
			rawJsonUrl: null,
			completedAt: "2026-05-24T00:00:00.000Z",
			engineVersion: "1.0.0",
			scoringVersion: "1.0.0",
		});

		expect(parsed.status).toBe("completed");
		if (parsed.status !== "completed") {
			throw new Error("expected completed response");
		}
		expect(parsed.overallScore).toBe(87);
	});
});

describe("ExternalPdfResponseSchema", () => {
	it("accepts queued white-label PDF responses", () => {
		const parsed = ExternalPdfResponseSchema.parse({
			status: "rendering",
			jobId: "report-pdf-wl:partner:report-1",
			message: "PDF rendering is queued.",
			pollingUrl: "/v1/external/reports/report-1",
		});

		expect(parsed.status).toBe("rendering");
	});

	it("accepts available PDF responses", () => {
		const parsed = ExternalPdfResponseSchema.parse({
			status: "available",
			jobId: "report-pdf-wl:partner:report-1",
			pdfUrl: "https://cdn.example.com/report.pdf",
			pdfSizeBytes: 12345,
		});

		expect(parsed.status).toBe("available");
	});
});

describe("ExternalUsageResponseSchema", () => {
	it("accepts partner quota usage responses", () => {
		const parsed = ExternalUsageResponseSchema.parse({
			apiClientId: "api-client-a",
			clientName: "Partner",
			apiKeyPrefix: "sk_xsag_0000",
			status: "active",
			usage: {
				monthlyQuota: 100,
				monthlyUsed: 30,
				monthlyRemaining: 70,
				rateLimitPerMin: 10,
				resetAt: "2026-06-01T00:00:00.000Z",
			},
			webhookUrl: null,
			createdAt: "2026-05-24T00:00:00.000Z",
		});

		expect(parsed.usage.monthlyRemaining).toBe(70);
	});

	it("rejects undeclared partner client statuses", () => {
		expect(() =>
			ExternalUsageResponseSchema.parse({
				apiClientId: "api-client-a",
				clientName: "Partner",
				apiKeyPrefix: "sk_xsag_0000",
				status: "paused",
				usage: {
					monthlyQuota: 100,
					monthlyUsed: 30,
					monthlyRemaining: 70,
					rateLimitPerMin: 10,
					resetAt: "2026-06-01T00:00:00.000Z",
				},
				webhookUrl: null,
				createdAt: "2026-05-24T00:00:00.000Z",
			}),
		).toThrow();
	});
});
