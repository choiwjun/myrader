// @TASK 수정R2-A-3 - 진단 핸들러 타임아웃 래퍼 (초과 시 TIMEOUT 실패 전이)
// @SPEC docs/planning/02-trd.md §3 (잡 상태 → diagnosis) / §7.3 (실패 사유 enum)
// @TEST apps/web/tests/diagnosis/with-timeout.test.ts
//
// 진단 파이프라인(크롤/LLM)은 외부 의존이라 멈출 수 있다. 한 잡이 영원히 running 으로
// 남으면 큐 슬롯·DB 행이 고착된다 → Promise.race 로 상한 시간을 강제하고, 초과 시
// TimeoutError 를 던져 핸들러가 markDiagnosisFailed(reason=TIMEOUT) 로 전이하게 한다.

/** 진단 핸들러 기본 타임아웃(ms). 엔진 스테이지 예산(crawl 120s 등) 합 + 영속화 여유. */
export const DEFAULT_DIAGNOSIS_TIMEOUT_MS = 180_000;

/** 타임아웃 초과 시 던지는 에러(핸들러가 TIMEOUT 사유로 매핑). */
export class DiagnosisTimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`diagnosis handler exceeded ${timeoutMs}ms timeout`);
    this.name = "DiagnosisTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/**
 * fn 을 timeoutMs 안에 완료하도록 강제한다. 초과하면 DiagnosisTimeoutError 로 reject.
 *
 * 주의(서버리스/Node 공통): JS 는 협력적이라 race 가 이긴다고 fn 의 진행을 *강제 중단*하진
 * 못한다(엔진은 자체 스테이지 타임아웃으로 멈춘다 — pipeline-stage-timeout). 여기선
 * "핸들러 전체가 상한을 넘으면 잡을 failed 로 마감"하는 상위 가드를 제공한다(고착 방지).
 * 타이머는 fn 정착 시 항상 정리한다(타이머 누수 0).
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number = DEFAULT_DIAGNOSIS_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new DiagnosisTimeoutError(timeoutMs)), timeoutMs);
  });
  try {
    return await Promise.race([fn(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
