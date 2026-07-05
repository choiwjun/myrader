/**
 * X-SAG Core Engine v2 — GapAnalyzer
 *
 * TRD § 19.2.5: 자기 진단 vs 경쟁사 진단 갭 매트릭스 생성.
 *
 * 알고리즘:
 *   1. ruleId 별 자기 vs 경쟁사 pass 여부 비교
 *   2. gap = 경쟁사 pass율 - 자기 pass율 (양수 = 경쟁사 우위)
 *   3. Top 5 선정: gap × priorityWeight × actionTypeBonus
 *   4. 자기 우위 항목 (자기 통과, 경쟁사 절반 이하 통과)
 *   5. 시장 평균 점수 계산
 */

import type {
	CompetitorReport,
	GapInput,
	GapMatrixRow,
	GapResult,
	PriorityGap,
	ScoreSnapshot,
} from "./types.js";

const PRIORITY_WEIGHT: Record<string, number> = {
	high: 3,
	medium: 2,
	low: 1,
};

const ACTION_BONUS: Record<string, number> = {
	self_fix: 1.5,
	snippet_action: 1.3,
	vendor_action: 1.0,
	si_action: 0.7,
};

export class GapAnalyzer {
	/**
	 * 갭 분석 실행 — GapInput → GapResult
	 */
	analyze(input: GapInput): GapResult {
		const matrix = this.buildMatrix(input);
		const priorities = this.selectTop5(matrix);
		const selfStrengths = this.extractStrengths(matrix);
		const marketAverage = this.computeAverage(input.competitors);

		return { matrix, priorities, selfStrengths, marketAverage };
	}

	// ---------------------------------------------------------------------------
	// Private helpers
	// ---------------------------------------------------------------------------

	private buildMatrix(input: GapInput): GapMatrixRow[] {
		const ruleMap = new Map<string, GapMatrixRow>();

		// 자기 진단 항목으로 초기화
		for (const item of input.selfReport.diagnosisItems) {
			ruleMap.set(item.ruleId, {
				ruleId: item.ruleId,
				category: item.category,
				selfPassed: item.passed,
				competitorPassedCount: 0,
				competitorTotal: input.competitors.length,
				gap: 0,
				actionType: item.actionType,
				priority: item.priority,
			});
		}

		// 경쟁사별 pass 횟수 집계
		for (const comp of input.competitors) {
			for (const item of comp.diagnosisItems) {
				const row = ruleMap.get(item.ruleId);
				if (!row) continue;
				if (item.passed) row.competitorPassedCount++;
			}
		}

		// gap 계산: 경쟁사 pass율 - 자기 pass율
		for (const row of ruleMap.values()) {
			const selfPassRate = row.selfPassed ? 1 : 0;
			const compPassRate =
				row.competitorPassedCount / Math.max(1, row.competitorTotal);
			row.gap = compPassRate - selfPassRate;
		}

		// gap 내림차순 정렬 (경쟁사 우위 항목 상위)
		return [...ruleMap.values()].sort((a, b) => b.gap - a.gap);
	}

	private selectTop5(matrix: GapMatrixRow[]): PriorityGap[] {
		const scored = matrix
			.filter((r) => r.gap > 0) // 경쟁사 우위 항목만
			.map((r) => {
				const priorityScore = PRIORITY_WEIGHT[r.priority] ?? 1;
				const actionBonus = ACTION_BONUS[r.actionType] ?? 1.0;
				return { row: r, score: r.gap * priorityScore * actionBonus };
			})
			.sort((a, b) => b.score - a.score)
			.slice(0, 5);

		return scored.map((s, i) => ({
			rank: (i + 1) as 1 | 2 | 3 | 4 | 5,
			ruleId: s.row.ruleId,
			reason: this.buildReason(s.row),
			actionType: s.row.actionType,
			expectedImpact:
				s.row.priority === "high"
					? "high"
					: s.row.priority === "medium"
						? "medium"
						: "low",
		}));
	}

	private buildReason(row: GapMatrixRow): string {
		const actionLabel = {
			self_fix: "직접 수정 가능",
			snippet_action: "스니펫 적용",
			vendor_action: "전문가 의뢰",
			si_action: "컨설팅 필요",
		}[row.actionType];

		return `경쟁사 ${row.competitorPassedCount}/${row.competitorTotal}이 통과한 항목인데 본인은 미통과. ${actionLabel}.`;
	}

	private extractStrengths(matrix: GapMatrixRow[]): string[] {
		return matrix
			.filter(
				(r) => r.selfPassed && r.competitorPassedCount < r.competitorTotal / 2,
			)
			.map((r) => r.ruleId);
	}

	private computeAverage(competitors: CompetitorReport[]): ScoreSnapshot {
		if (competitors.length === 0) {
			return { seo: 0, aeo: 0, geo: 0, perf: 0, overall: 0 };
		}

		const sum = { seo: 0, aeo: 0, geo: 0, perf: 0, overall: 0 };
		for (const c of competitors) {
			sum.seo += c.seoScore ?? 0;
			sum.aeo += c.aeoScore ?? 0;
			sum.geo += c.geoScore ?? 0;
			sum.perf += c.perfScore ?? 0;
			sum.overall += c.overallScore ?? 0;
		}

		const n = competitors.length;
		return {
			seo: sum.seo / n,
			aeo: sum.aeo / n,
			geo: sum.geo / n,
			perf: sum.perf / n,
			overall: sum.overall / n,
		};
	}
}
