/**
 * @TASK TASK-COPY-008 — medium priority 60룰 카피 시드 완전성 테스트
 * @TEST packages/contracts/src/copy/__tests__/medium-copy-completeness.test.ts
 * @SPEC docs/features/x-sag-diagnosis-engine/BACKLOG_FH_EXPANSION_DOCS.md#F.2
 *
 * MEDIUM_RULE_COPY_KO 의 5 슬롯 완전성, 톤·자연스러움, 외래어 비율,
 * 변수 사용, 카테고리 분포, RULE_COPY 통합을 검증.
 */

import { describe, it, expect } from "vitest";
import { MEDIUM_RULE_COPY_KO } from "../rule-copy-medium.ko.js";
import { RULE_COPY } from "../rule-copy.ko.js";
import { renderRuleCopy } from "../render.js";
import type { RuleCopyTemplate } from "../types.js";

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

const SLOT_KEYS = ["title", "harm", "action_self", "action_pro", "cta"] as const;
type SlotKey = (typeof SLOT_KEYS)[number];

const MEDIUM_IDS = Object.keys(MEDIUM_RULE_COPY_KO);

// 허용 외래어 (한국어로 자연스럽게 자리잡은 약어·표기)
const ALLOWED_FOREIGN_TOKENS = new Set([
  "SEO",
  "AEO",
  "GEO",
  "AI",
  "FAQ",
  "URL",
  "SNS",
  "OO",
  "OOO",
  "OOOO",
  "OO~OO",
  "OO원",
  "OO원부터",
  "X-SAG",
  "Tab",
  "YYYY-MM-DD",
]);

// 의료 효능·과장 금지 어휘 (clinic compliance — POLICY § medical guard 참조)
const MEDICAL_PROHIBITED = [
  "최고",
  "최선",
  "완치",
  "100%",
  "00%",
  "보장",
  "기적",
  "효능",
];

// 명령형·딱딱한 어조 금지 토큰 — 친근한 비서 톤 유지
const COMMAND_TONE_TOKENS = [
  "수행하세요",
  "최적화하기 위해",
  "최적화하기위해",
  "조치하십시오",
  "조치하시오",
];

// 금지 호칭 (정책: 사장님 직접 호칭만 허용)
const PROHIBITED_HONORIFICS = ["고객님", "귀하", "회원님"];

// ---------------------------------------------------------------------------
// 1. 5 슬롯 완전성 + ID 일치
// ---------------------------------------------------------------------------

describe("MEDIUM_RULE_COPY_KO — 5 슬롯 완전성", () => {
  it("60개 룰이 등록되어 있다", () => {
    expect(MEDIUM_IDS.length).toBe(60);
  });

  it("각 룰의 ruleId 가 키와 일치한다", () => {
    for (const id of MEDIUM_IDS) {
      const tpl = MEDIUM_RULE_COPY_KO[id] as RuleCopyTemplate;
      expect(tpl.ruleId, `${id} ruleId 불일치`).toBe(id);
    }
  });

  it("각 룰의 defaultPriority 는 medium 이다", () => {
    for (const id of MEDIUM_IDS) {
      const tpl = MEDIUM_RULE_COPY_KO[id] as RuleCopyTemplate;
      expect(tpl.defaultPriority, `${id} priority`).toBe("medium");
    }
  });

  it("각 룰의 5 슬롯이 모두 5자 이상이다 (placeholder 방지)", () => {
    for (const id of MEDIUM_IDS) {
      const tpl = MEDIUM_RULE_COPY_KO[id] as RuleCopyTemplate;
      for (const slot of SLOT_KEYS) {
        if (slot === "cta") continue; // cta 는 짧음 (3~6자)
        const text = tpl.slots[slot as SlotKey];
        expect(
          text.trim().length,
          `${id}.${slot} 너무 짧음 (${text.trim().length}자): "${text}"`,
        ).toBeGreaterThanOrEqual(5);
      }
    }
  });

  it("cta 는 1~8자 이내다 (Zod schema 가드)", () => {
    for (const id of MEDIUM_IDS) {
      const tpl = MEDIUM_RULE_COPY_KO[id] as RuleCopyTemplate;
      const len = tpl.slots.cta.length;
      expect(len, `${id}.cta 길이: ${len}`).toBeGreaterThanOrEqual(1);
      expect(len, `${id}.cta 길이: ${len}`).toBeLessThanOrEqual(8);
    }
  });

  it("category 가 (seo|aeo|geo|self) 중 하나다", () => {
    const allowed = new Set(["seo", "aeo", "geo", "self"]);
    for (const id of MEDIUM_IDS) {
      const tpl = MEDIUM_RULE_COPY_KO[id] as RuleCopyTemplate;
      expect(allowed.has(tpl.category), `${id} category=${tpl.category}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. 길이 가드 — title ≤ 80자, harm/action ≤ 200자, schema 240자 미만
// ---------------------------------------------------------------------------

describe("MEDIUM_RULE_COPY_KO — 슬롯 길이 가드", () => {
  it("title 은 모두 80자 이내다", () => {
    const violations: string[] = [];
    for (const id of MEDIUM_IDS) {
      const tpl = MEDIUM_RULE_COPY_KO[id] as RuleCopyTemplate;
      if (tpl.slots.title.length > 80) {
        violations.push(`${id} (${tpl.slots.title.length}자): ${tpl.slots.title}`);
      }
    }
    expect(violations, violations.join("\n")).toHaveLength(0);
  });

  it("harm 은 모두 200자 이내다", () => {
    const violations: string[] = [];
    for (const id of MEDIUM_IDS) {
      const tpl = MEDIUM_RULE_COPY_KO[id] as RuleCopyTemplate;
      if (tpl.slots.harm.length > 200) {
        violations.push(`${id} (${tpl.slots.harm.length}자)`);
      }
    }
    expect(violations, violations.join("\n")).toHaveLength(0);
  });

  it("action_self / action_pro 는 모두 200자 이내다", () => {
    const violations: string[] = [];
    for (const id of MEDIUM_IDS) {
      const tpl = MEDIUM_RULE_COPY_KO[id] as RuleCopyTemplate;
      if (tpl.slots.action_self.length > 200) {
        violations.push(`${id}.action_self (${tpl.slots.action_self.length}자)`);
      }
      if (tpl.slots.action_pro.length > 200) {
        violations.push(`${id}.action_pro (${tpl.slots.action_pro.length}자)`);
      }
    }
    expect(violations, violations.join("\n")).toHaveLength(0);
  });

  it("모든 슬롯이 Zod schema 한계 (240자) 이내다", () => {
    for (const id of MEDIUM_IDS) {
      const tpl = MEDIUM_RULE_COPY_KO[id] as RuleCopyTemplate;
      expect(tpl.slots.title.length, `${id}.title`).toBeLessThanOrEqual(240);
      expect(tpl.slots.harm.length, `${id}.harm`).toBeLessThanOrEqual(240);
      expect(tpl.slots.action_self.length, `${id}.action_self`).toBeLessThanOrEqual(240);
      expect(tpl.slots.action_pro.length, `${id}.action_pro`).toBeLessThanOrEqual(240);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. 비서 톤 — "사장님" 호칭 ≥ 70%, 금지 호칭 0건
// ---------------------------------------------------------------------------

describe("MEDIUM_RULE_COPY_KO — 비서 톤 (DL-041)", () => {
  it("'사장님' 호칭이 룰의 70% 이상에 등장한다", () => {
    let count = 0;
    for (const id of MEDIUM_IDS) {
      const tpl = MEDIUM_RULE_COPY_KO[id] as RuleCopyTemplate;
      const allText =
        tpl.slots.title +
        tpl.slots.harm +
        tpl.slots.action_self +
        tpl.slots.action_pro;
      if (allText.includes("사장님")) count += 1;
    }
    const ratio = count / MEDIUM_IDS.length;
    expect(ratio, `사장님 호칭 비율 ${(ratio * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.7);
  });

  it("금지 호칭 (고객님·귀하·회원님) 0건", () => {
    const violations: string[] = [];
    for (const id of MEDIUM_IDS) {
      const tpl = MEDIUM_RULE_COPY_KO[id] as RuleCopyTemplate;
      const allText = Object.values(tpl.slots).join(" ");
      for (const word of PROHIBITED_HONORIFICS) {
        if (allText.includes(word)) {
          violations.push(`${id}: '${word}' 사용`);
        }
      }
    }
    expect(violations, violations.join("\n")).toHaveLength(0);
  });

  it("의료 효능·과장 어휘 0건 (clinic compliance)", () => {
    const violations: string[] = [];
    for (const id of MEDIUM_IDS) {
      const tpl = MEDIUM_RULE_COPY_KO[id] as RuleCopyTemplate;
      const allText = Object.values(tpl.slots).join(" ");
      for (const word of MEDICAL_PROHIBITED) {
        if (allText.includes(word)) {
          violations.push(`${id}: '${word}' 사용`);
        }
      }
    }
    expect(violations, violations.join("\n")).toHaveLength(0);
  });

  it("명령형·딱딱한 어조 토큰 0건", () => {
    const violations: string[] = [];
    for (const id of MEDIUM_IDS) {
      const tpl = MEDIUM_RULE_COPY_KO[id] as RuleCopyTemplate;
      const allText = Object.values(tpl.slots).join(" ");
      for (const token of COMMAND_TONE_TOKENS) {
        if (allText.includes(token)) {
          violations.push(`${id}: '${token}' 사용`);
        }
      }
    }
    expect(violations, violations.join("\n")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. 외래어 비율 — 허용 토큰 (SEO/AEO/GEO 등) 제외 ≤ 30%
// ---------------------------------------------------------------------------

describe("MEDIUM_RULE_COPY_KO — 외래어·로마자 비율", () => {
  it("title 슬롯의 로마자 토큰은 허용 외래어만 사용한다", () => {
    const violations: string[] = [];
    const latinTokenRe = /[A-Za-z][A-Za-z0-9-]*/g;
    for (const id of MEDIUM_IDS) {
      const tpl = MEDIUM_RULE_COPY_KO[id] as RuleCopyTemplate;
      // 변수 placeholder ({site} 등) 제거 후 검사
      const cleaned = tpl.slots.title.replace(/\{[^}]+\}/g, "");
      const tokens = cleaned.match(latinTokenRe) ?? [];
      for (const t of tokens) {
        if (!ALLOWED_FOREIGN_TOKENS.has(t) && !ALLOWED_FOREIGN_TOKENS.has(t.toUpperCase())) {
          violations.push(`${id}.title: '${t}'`);
        }
      }
    }
    expect(violations, violations.join("\n")).toHaveLength(0);
  });

  it("로마자 토큰 사용 룰 비율이 30% 이하다 (전체 5슬롯 합산)", () => {
    let rulesWithLatin = 0;
    const latinTokenRe = /[A-Za-z][A-Za-z0-9-]*/g;
    for (const id of MEDIUM_IDS) {
      const tpl = MEDIUM_RULE_COPY_KO[id] as RuleCopyTemplate;
      const allText = Object.values(tpl.slots).join(" ");
      // 변수 치환 자리는 제외
      const cleaned = allText.replace(/\{[^}]+\}/g, "");
      const tokens = cleaned.match(latinTokenRe) ?? [];
      const realLatin = tokens.filter(
        (t) => !ALLOWED_FOREIGN_TOKENS.has(t) && !ALLOWED_FOREIGN_TOKENS.has(t.toUpperCase()),
      );
      if (realLatin.length > 0) rulesWithLatin += 1;
    }
    const ratio = rulesWithLatin / MEDIUM_IDS.length;
    expect(ratio, `외래어 사용 룰 비율 ${(ratio * 100).toFixed(1)}%`).toBeLessThanOrEqual(0.3);
  });
});

// ---------------------------------------------------------------------------
// 5. 변수 placeholder 사용 보고 — {site}, {customer}, {name} 등
// ---------------------------------------------------------------------------

describe("MEDIUM_RULE_COPY_KO — 변수 placeholder 사용", () => {
  it("{site} 변수는 최소 80% 룰의 title 에 등장한다", () => {
    let count = 0;
    for (const id of MEDIUM_IDS) {
      const tpl = MEDIUM_RULE_COPY_KO[id] as RuleCopyTemplate;
      if (tpl.slots.title.includes("{site}")) count += 1;
    }
    const ratio = count / MEDIUM_IDS.length;
    expect(ratio, `{site} title 사용 비율 ${(ratio * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(0.8);
  });

  it("{comparison_phrase_anchor} 는 최소 70% 룰의 harm 에 등장한다", () => {
    let count = 0;
    for (const id of MEDIUM_IDS) {
      const tpl = MEDIUM_RULE_COPY_KO[id] as RuleCopyTemplate;
      if (tpl.slots.harm.includes("{comparison_phrase_anchor}")) count += 1;
    }
    const ratio = count / MEDIUM_IDS.length;
    expect(
      ratio,
      `{comparison_phrase_anchor} harm 사용 비율 ${(ratio * 100).toFixed(1)}%`,
    ).toBeGreaterThanOrEqual(0.7);
  });

  it("{est_cost_*} 변수는 모든 action_pro 슬롯에 등장한다", () => {
    const violations: string[] = [];
    for (const id of MEDIUM_IDS) {
      const tpl = MEDIUM_RULE_COPY_KO[id] as RuleCopyTemplate;
      const text = tpl.slots.action_pro;
      const hasCost = /\{est_cost_(low|mid|high)\}/.test(text);
      if (!hasCost) violations.push(`${id}.action_pro: '${text}'`);
    }
    expect(violations, violations.join("\n")).toHaveLength(0);
  });

  it("{vendor_type} 변수는 모든 action_pro 슬롯에 등장한다", () => {
    const violations: string[] = [];
    for (const id of MEDIUM_IDS) {
      const tpl = MEDIUM_RULE_COPY_KO[id] as RuleCopyTemplate;
      if (!tpl.slots.action_pro.includes("{vendor_type}")) {
        violations.push(`${id}.action_pro`);
      }
    }
    expect(violations, violations.join("\n")).toHaveLength(0);
  });

  it("{est_time_*} 변수는 action_self 의 90% 이상에 등장한다", () => {
    let count = 0;
    for (const id of MEDIUM_IDS) {
      const tpl = MEDIUM_RULE_COPY_KO[id] as RuleCopyTemplate;
      if (/\{est_time_(short|medium|long)\}/.test(tpl.slots.action_self)) {
        count += 1;
      }
    }
    const ratio = count / MEDIUM_IDS.length;
    expect(ratio, `{est_time_*} action_self 비율 ${(ratio * 100).toFixed(1)}%`).toBeGreaterThanOrEqual(
      0.9,
    );
  });
});

// ---------------------------------------------------------------------------
// 6. RULE_COPY 통합 — high 30 + medium 60 = 90 룰, ID 충돌 없음
// ---------------------------------------------------------------------------

describe("MEDIUM_RULE_COPY_KO — RULE_COPY 통합", () => {
  it("medium 60 룰 ID 가 기존 high 30 룰 ID 와 충돌하지 않는다", () => {
    // RULE_COPY 는 spread 병합이므로 충돌 시 medium 이 high 를 덮어쓴다.
    // medium ID 들이 high priority 30 룰 ID 목록과 교집합이 없어야 한다.
    const HIGH_30_IDS = [
      "SEO-TITLE-001",
      "SEO-META-001",
      "SEO-H1-001",
      "SEO-ROBOTS-001",
      "SEO-MOBILE-001",
      "SEO-HTTPS-001",
      "SEO-KEYWORD-001",
      "SEO-STRUCTURED-DATA-001",
      "SEO-OG-001",
      "SEO-REGION-001",
      "AEO-FAQ-001",
      "AEO-SERVICE-DESC-001",
      "AEO-QUESTION-FORMAT-001",
      "AEO-CONTACT-DIRECT-001",
      "AEO-DIRECT-ANSWER-001",
      "GEO-BUSINESS-NAME-001",
      "GEO-LOCAL-BUSINESS-SCHEMA-001",
      "GEO-REGION-001",
      "GEO-LLMS-TXT-001",
      "GEO-INDUSTRY-001",
      "PERF-LCP-001",
      "PERF-CLS-001",
      "PERF-FCP-001",
      "A11Y-IMAGE-ALT-001",
      "A11Y-COLOR-CONTRAST-001",
      "MOBILE-VIEWPORT-OK-001",
      "MOBILE-TAP-TARGET-001",
      "NLP-READABILITY-001",
      "NLP-KEYWORD-DENSITY-001",
      "SEO-IMG-ALT-001",
    ];
    const overlaps = MEDIUM_IDS.filter((id) => HIGH_30_IDS.includes(id));
    expect(overlaps, `overlap: ${overlaps.join(",")}`).toHaveLength(0);
  });

  it("RULE_COPY 통합 후 90 룰이 등록되어 있다", () => {
    expect(Object.keys(RULE_COPY).length).toBe(90);
  });

  it("RULE_COPY[mediumId] 는 medium 카피와 동일하다", () => {
    for (const id of MEDIUM_IDS) {
      expect(RULE_COPY[id], `${id} 미통합`).toEqual(MEDIUM_RULE_COPY_KO[id]);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. 산업별 렌더링 시뮬레이션 — cafe / restaurant / clinic 3산업 통과
// ---------------------------------------------------------------------------

describe("MEDIUM_RULE_COPY_KO — 산업 렌더링 시뮬레이션", () => {
  it("cafe 산업에서 60 룰 모두 미치환 변수 없이 렌더된다", () => {
    const failures: string[] = [];
    for (const id of MEDIUM_IDS) {
      const result = renderRuleCopy(id, "cafe");
      if (result === null) {
        failures.push(`${id}: null`);
        continue;
      }
      if (result.unrenderedVars.length > 0) {
        failures.push(`${id}: 미치환 ${result.unrenderedVars.join(",")}`);
      }
    }
    expect(failures, failures.join("\n")).toHaveLength(0);
  });

  it("restaurant 산업에서 60 룰 모두 미치환 변수 없이 렌더된다", () => {
    const failures: string[] = [];
    for (const id of MEDIUM_IDS) {
      const result = renderRuleCopy(id, "restaurant");
      if (result === null || result.unrenderedVars.length > 0) {
        failures.push(`${id}: ${result?.unrenderedVars.join(",") ?? "null"}`);
      }
    }
    expect(failures, failures.join("\n")).toHaveLength(0);
  });

  it("clinic 산업에서 60 룰 모두 의료 효능 어휘 없이 렌더된다", () => {
    const failures: string[] = [];
    for (const id of MEDIUM_IDS) {
      const result = renderRuleCopy(id, "clinic");
      if (result === null) continue;
      const allText = Object.values(result.rendered).join(" ");
      for (const word of MEDICAL_PROHIBITED) {
        if (allText.includes(word)) {
          failures.push(`${id}: '${word}'`);
        }
      }
    }
    expect(failures, failures.join("\n")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 8. 카테고리 분포 보고 (informational)
// ---------------------------------------------------------------------------

describe("MEDIUM_RULE_COPY_KO — 카테고리 분포", () => {
  it("category 분포가 SEO/AEO/GEO/self 모두 포함한다", () => {
    const counts: Record<string, number> = { seo: 0, aeo: 0, geo: 0, self: 0 };
    for (const id of MEDIUM_IDS) {
      const tpl = MEDIUM_RULE_COPY_KO[id] as RuleCopyTemplate;
      counts[tpl.category] = (counts[tpl.category] ?? 0) + 1;
    }
    const seo = counts.seo ?? 0;
    const aeo = counts.aeo ?? 0;
    const geo = counts.geo ?? 0;
    const self = counts.self ?? 0;
    expect(seo, "seo 카운트").toBeGreaterThan(0);
    expect(aeo, "aeo 카운트").toBeGreaterThan(0);
    expect(geo, "geo 카운트").toBeGreaterThan(0);
    expect(self, "self 카운트").toBeGreaterThan(0);
    // 합계 = 60
    expect(seo + aeo + geo + self).toBe(60);
  });
});
