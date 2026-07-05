/**
 * X-SAG Core Engine — 버전 상수 일관성 회귀 테스트
 *
 * 배경 (QA 2026-06-11): env ENGINE_VERSION/SCORING_VERSION=2.0.0 이
 * 코드 상수(2.1.0)를 덮어써 완료 리포트에 stale 버전이 기록됐다.
 * 수정으로 모든 기록 경로가 @boina/contracts 상수를 사용한다.
 * 이 테스트는 contracts(기록용 단일 진실)와 core-engine(채점 구현)의
 * 스코어링 버전이 어긋나는 스큐를 막는다.
 */

import {
	SCORING_VERSION as CONTRACTS_SCORING_VERSION,
	ENGINE_VERSION,
	SCHEMA_VERSION,
} from "@boina/contracts";
import { describe, expect, it } from "vitest";
import { SCORING_VERSION as ENGINE_SCORING_VERSION } from "../scoring.js";

describe("버전 상수 일관성 (contracts ↔ core-engine)", () => {
	it("contracts.SCORING_VERSION === core-engine scoring.SCORING_VERSION", () => {
		expect(CONTRACTS_SCORING_VERSION).toBe(ENGINE_SCORING_VERSION);
	});

	it("버전 상수는 semver 형식이다", () => {
		const semver = /^\d+\.\d+\.\d+$/;
		expect(ENGINE_VERSION).toMatch(semver);
		expect(CONTRACTS_SCORING_VERSION).toMatch(semver);
		expect(SCHEMA_VERSION).toMatch(semver);
	});
});
