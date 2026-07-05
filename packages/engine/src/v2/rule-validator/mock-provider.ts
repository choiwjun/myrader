/**
 * X-SAG Core Engine v2 — Mock Rule Semantic Validator Provider
 *
 * 테스트/오프라인 환경용 결정론적 룰 의미 검증기.
 * 미리 설정한 ruleId → issue 매핑을 그대로 반환한다.
 *
 * 활용:
 *   - 단위 테스트 (LLM 의존 없이 검증)
 *   - CLI 스크립트의 dry-run
 *   - 룰 메타 데이터 형식 검증 (provider 로직 외 부분 격리)
 */

import type {
	RuleDescriptor,
	RuleSemanticIssue,
	RuleSemanticReport,
	RuleSemanticValidator,
} from "./types.js";

export interface MockRuleSemanticValidatorOptions {
	/**
	 * 사전 설정 이슈 목록.
	 * 여기에 등록된 ruleId 가 validate() 입력에 포함되면 해당 이슈를 반환한다.
	 */
	preconfiguredIssues?: RuleSemanticIssue[];
	/**
	 * 배치당 룰 수 (테스트에서 배치 동작 검증용).
	 * 실제로는 mock 은 한 번에 전체를 처리하지만, 배치 분할 후 합치는 시나리오를
	 * 흉내내 입력 순서 보존성을 보일 수 있게 한다. 기본 5.
	 */
	batchSize?: number;
	/**
	 * 특정 배치 인덱스에서 "JSON parse fail" 을 시뮬레이션한다.
	 * 해당 배치의 룰들은 reviewed 카운트에서 제외되고 이슈도 무시된다.
	 */
	failBatchIndices?: number[];
}

const DEFAULT_BATCH_SIZE = 5;

export class MockRuleSemanticValidator implements RuleSemanticValidator {
	readonly name = "mock" as const;

	private readonly preconfiguredIssues: RuleSemanticIssue[];
	private readonly batchSize: number;
	private readonly failBatchIndices: Set<number>;

	constructor(options: MockRuleSemanticValidatorOptions = {}) {
		this.preconfiguredIssues = options.preconfiguredIssues ?? [];
		this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
		this.failBatchIndices = new Set(options.failBatchIndices ?? []);
		if (this.batchSize < 1) {
			throw new Error("batchSize must be >= 1");
		}
	}

	isAvailable(): boolean {
		return true;
	}

	async validate(rules: RuleDescriptor[]): Promise<RuleSemanticReport> {
		// 입력 순서 보존을 위해 ruleId 인덱스 맵을 만든 뒤 정렬한다.
		const orderIndex = new Map<string, number>();
		rules.forEach((r, i) => orderIndex.set(r.ruleId, i));

		const issues: RuleSemanticIssue[] = [];
		let reviewed = 0;

		// 배치 시뮬레이션
		const batches: RuleDescriptor[][] = [];
		for (let i = 0; i < rules.length; i += this.batchSize) {
			batches.push(rules.slice(i, i + this.batchSize));
		}

		for (let i = 0; i < batches.length; i++) {
			const batch = batches[i];
			if (!batch) continue;
			if (this.failBatchIndices.has(i)) {
				// 시뮬레이션 — 이 배치는 parse 실패로 간주, reviewed 에서 제외
				continue;
			}
			reviewed += batch.length;
			const batchIds = new Set(batch.map((r) => r.ruleId));
			for (const issue of this.preconfiguredIssues) {
				if (batchIds.has(issue.ruleId)) {
					issues.push(issue);
				}
			}
		}

		// 입력 순서 기준 정렬 (배치 결과 합산 후에도 순서 보존)
		issues.sort((a, b) => {
			const ai = orderIndex.get(a.ruleId) ?? Number.POSITIVE_INFINITY;
			const bi = orderIndex.get(b.ruleId) ?? Number.POSITIVE_INFINITY;
			return ai - bi;
		});

		return {
			totalRules: rules.length,
			reviewed,
			issues,
			summary: buildSummary(rules.length, reviewed, issues),
			// 결정론적 baseTime — 테스트 안정성
			validatedAt: "2025-01-01T00:00:00.000Z",
			source: this.name,
		};
	}
}

function buildSummary(
	total: number,
	reviewed: number,
	issues: RuleSemanticIssue[],
): string {
	const counts = { info: 0, warn: 0, critical: 0 };
	for (const i of issues) counts[i.severity] += 1;
	const skipped = total - reviewed;
	const skippedNote =
		skipped > 0 ? `, ${skipped}개 미검토(LLM 응답 파싱 실패)` : "";
	return `${total}개 룰 중 ${reviewed}개 검토 완료${skippedNote} — 이슈 ${issues.length}건 (critical ${counts.critical} / warn ${counts.warn} / info ${counts.info}).`;
}
