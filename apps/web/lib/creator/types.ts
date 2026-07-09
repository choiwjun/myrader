export type CreatorPlan = "free" | "starter" | "pro";
export type CreatorScanStatus = "queued" | "expanding" | "scoring" | "probing" | "done" | "failed";
export type CreatorVerdict = "now" | "good" | "normal" | "watch";
export type CreatorAiStatus = "available" | "probing" | "complete" | "failed";
export type ChecklistStatus = "pass" | "weak" | "missing";
export type ChecklistImpact = "high" | "medium";

export interface CreatorTopicPreview {
  readonly seed: string;
  readonly keywords: readonly string[];
  readonly message: string;
  readonly warnings: readonly string[];
}

export interface CreatorNaverEvidence {
  readonly volume: number | null;
  readonly docs: number | null;
  readonly saturation: number | null;
  readonly trend7d: number | null;
  readonly reasons: readonly string[];
}

export interface CreatorAiEvidence {
  readonly probeSummary: string;
  readonly citedSources: number;
  readonly blogGap: "empty" | "thin" | "crowded";
  readonly queryText: string;
  readonly methodology: string;
}

export interface CreatorKeyword {
  readonly id: string;
  readonly text: string;
  readonly clusterId: string;
  readonly naverScore: number;
  readonly aiScore: number | null;
  readonly aiStatus: CreatorAiStatus;
  readonly verdict: CreatorVerdict;
  readonly naverEvidence: CreatorNaverEvidence;
  readonly aiEvidence: CreatorAiEvidence | null;
  readonly angle: string;
  readonly trendLabel: string;
}

export interface CreatorRadarSnapshot {
  readonly topic: {
    readonly id: string;
    readonly name: string;
    readonly channelUrl: string | null;
    readonly plan: CreatorPlan;
  };
  readonly scan: {
    readonly id: string;
    readonly status: CreatorScanStatus;
    readonly stageDetail: string;
    readonly lastScannedAt: string;
    readonly nextScanAt: string;
  };
  readonly quota: {
    readonly scansUsed: number;
    readonly scansLimit: number;
    readonly lookupsUsed: number;
    readonly lookupsLimit: number;
  };
  readonly channels: readonly {
    readonly name: string;
    readonly status: "good" | "wait" | "failed";
    readonly detail: string;
  }[];
  readonly topSignal: {
    readonly keyword: string;
    readonly reason: string;
  };
  readonly keywords: readonly CreatorKeyword[];
}

export interface CreatorLookupInput {
  readonly keyword: string;
  readonly includeAi?: boolean;
}

export interface CreatorArticleDiagnosis {
  readonly id: string;
  readonly url: string;
  readonly status: "completed" | "failed";
  readonly score: number;
  readonly grade: string;
  readonly checklist: readonly {
    readonly status: ChecklistStatus;
    readonly title: string;
    readonly fix: string;
    readonly impact: ChecklistImpact;
  }[];
  readonly methodology: string;
}

export interface CreatorCitationEvent {
  readonly id: string;
  readonly articleUrl: string;
  readonly model: string;
  readonly question: string;
  readonly excerpt: string;
  readonly kind: "url" | "brand" | "phrase";
  readonly foundAt: string;
}

export interface CreatorTrackedTarget {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly keyword: string;
  readonly registeredAt: string;
  readonly lastProbedAt: string;
  readonly citationCount: number;
  readonly status: "tracking" | "needs_fix";
}

export interface CreatorCitationSnapshot {
  readonly trackedCount: number;
  readonly weeklyCitationCount: number;
  readonly previousWeekDelta: number;
  readonly events: readonly CreatorCitationEvent[];
  readonly trackedTargets: readonly CreatorTrackedTarget[];
  readonly methodology: string;
}

export interface CreatorWeeklyReport {
  readonly week: string;
  readonly topKeywords: readonly CreatorKeyword[];
  readonly citationEvents: readonly CreatorCitationEvent[];
  readonly missedOpportunities: readonly string[];
  readonly archiveWeeks: readonly string[];
}
