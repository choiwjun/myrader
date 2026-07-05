/**
 * @TASK TASK-COPY-006 — vocab 완전성 테스트
 * @TEST packages/contracts/src/copy/__tests__/vocab-completeness.test.ts
 *
 * INDUSTRY_VOCAB 의 8 산업 × 12 필드 완전성 검증.
 */

import { describe, it, expect } from "vitest";
import { INDUSTRY_VOCAB, isCompleteVocab, getVocabOrFallback } from "../industry-vocab.ko.js";
import type { IndustryId } from "../types.js";

const ALL_INDUSTRY_IDS: IndustryId[] = [
  "cafe",
  "restaurant",
  "clinic",
  "academy",
  "salon",
  "workshop",
  "retail",
  "general",
];

describe("INDUSTRY_VOCAB — 8 산업 × 12 필드 완전성", () => {
  it("8개 산업 키가 모두 존재한다", () => {
    for (const id of ALL_INDUSTRY_IDS) {
      expect(INDUSTRY_VOCAB[id], `${id} 키 없음`).toBeDefined();
    }
  });

  it("각 산업 vocab은 isCompleteVocab 검사를 통과한다", () => {
    for (const id of ALL_INDUSTRY_IDS) {
      const vocab = INDUSTRY_VOCAB[id];
      expect(isCompleteVocab(vocab), `${id} vocab 불완전`).toBe(true);
    }
  });

  it("각 산업 vocab의 id 필드가 키와 일치한다", () => {
    for (const id of ALL_INDUSTRY_IDS) {
      expect(INDUSTRY_VOCAB[id].id).toBe(id);
    }
  });

  it("typical_fields 길이는 1~5 사이다", () => {
    for (const id of ALL_INDUSTRY_IDS) {
      const len = INDUSTRY_VOCAB[id].typical_fields.length;
      expect(len, `${id}.typical_fields 길이: ${len}`).toBeGreaterThanOrEqual(1);
      expect(len, `${id}.typical_fields 길이: ${len}`).toBeLessThanOrEqual(5);
    }
  });

  it("est_time_dictionary short/medium/long 모두 정의돼 있다", () => {
    for (const id of ALL_INDUSTRY_IDS) {
      const dic = INDUSTRY_VOCAB[id].est_time_dictionary;
      expect(dic.short, `${id}.est_time_dictionary.short`).toBeTruthy();
      expect(dic.medium, `${id}.est_time_dictionary.medium`).toBeTruthy();
      expect(dic.long, `${id}.est_time_dictionary.long`).toBeTruthy();
    }
  });

  it("est_cost_dictionary low/mid/high 모두 정의돼 있다", () => {
    for (const id of ALL_INDUSTRY_IDS) {
      const dic = INDUSTRY_VOCAB[id].est_cost_dictionary;
      expect(dic.low, `${id}.est_cost_dictionary.low`).toBeTruthy();
      expect(dic.mid, `${id}.est_cost_dictionary.mid`).toBeTruthy();
      expect(dic.high, `${id}.est_cost_dictionary.high`).toBeTruthy();
    }
  });

  it("general vocab은 안전값(name='가게', customer='고객', site='사이트', vendor_type='웹 전문가')을 갖는다", () => {
    const g = INDUSTRY_VOCAB.general;
    expect(g.name).toBe("가게");
    expect(g.customer).toBe("고객");
    expect(g.site).toBe("사이트");
    expect(g.vendor_type).toBe("웹 전문가");
  });

  it("clinic은 compliance_notes가 비어있지 않다 (의료법 주의사항 존재)", () => {
    expect(INDUSTRY_VOCAB.clinic.compliance_notes.length).toBeGreaterThan(0);
  });

  it("clinic compliance_notes에 의료법 관련 내용이 포함돼 있다", () => {
    const notes = INDUSTRY_VOCAB.clinic.compliance_notes.join(" ");
    expect(notes).toMatch(/의료법/);
  });

  it("모든 산업의 seasonal_concerns 배열이 존재한다 (빈 배열도 허용)", () => {
    for (const id of ALL_INDUSTRY_IDS) {
      expect(Array.isArray(INDUSTRY_VOCAB[id].seasonal_concerns), `${id}.seasonal_concerns is not array`).toBe(true);
    }
  });

  it("comparison_phrase_anchor는 비어있지 않다", () => {
    for (const id of ALL_INDUSTRY_IDS) {
      expect(INDUSTRY_VOCAB[id].comparison_phrase_anchor.length, `${id}.comparison_phrase_anchor 비어있음`).toBeGreaterThan(0);
    }
  });
});

describe("getVocabOrFallback — general 폴백 헬퍼", () => {
  it("유효한 산업 ID → 해당 vocab 반환", () => {
    for (const id of ALL_INDUSTRY_IDS) {
      const vocab = getVocabOrFallback(id);
      expect(vocab.id).toBe(id);
    }
  });

  it("undefined → general vocab 반환", () => {
    const vocab = getVocabOrFallback(undefined);
    expect(vocab.id).toBe("general");
  });

  it("알 수 없는 ID → general vocab 반환", () => {
    // 타입 캐스팅으로 잘못된 ID 테스트
    const vocab = getVocabOrFallback("unknown_industry" as IndustryId);
    expect(vocab.id).toBe("general");
  });

  it("cafe → cafe vocab 반환 (name=카페)", () => {
    const vocab = getVocabOrFallback("cafe");
    expect(vocab.name).toBe("카페");
    expect(vocab.customer).toBe("손님");
  });

  it("clinic → clinic vocab 반환 (customer=환자)", () => {
    const vocab = getVocabOrFallback("clinic");
    expect(vocab.customer).toBe("환자");
  });
});
