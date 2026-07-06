// @TASK P2-S6 - 생성물 (/assets) 화면 TDD
// @SPEC specs/screens/generated.yaml (S6: REQ-006)
// @SPEC docs/planning/05-design-system.md §5 (정직성 카피 가드)

import { afterEach, describe, expect, it, vi } from "vitest";
import { copyTextWithFallback } from "../../app/components/shared/BigCopyButton";
import {
  ASSET_TYPES,
  assertGeneratedAssetHonest,
  deriveGeneratedAssetViewFromPersisted,
  deriveGeneratedAssets,
} from "../../lib/diagnosis/generated-asset-service";
import { assetTypeToLabel } from "../../lib/shared/ui-labels";

const CAUSAL_FORBIDDEN = /1위|1등|매출|반드시|확실히|보장|무조건|효과 보장/;
const TECHNICAL_FORBIDDEN = /snippet|SEO|AEO|GEO|SERP|algorithm|structured data|schema markup/i;

function assetInput() {
  return {
    businessName: "테스트 한식당",
    category: "한식",
    region: "서울 마포구",
    faqs: [{ question: "영업시간이 어떻게 되나요?", answer: "매일 오전 10시에 열어요." }],
  };
}

function stubFallbackDocument(execCommand: ReturnType<typeof vi.fn>) {
  const textarea = {
    value: "",
    style: {} as Record<string, string>,
    focus: vi.fn(),
    select: vi.fn(),
  };
  const appendChild = vi.fn();
  const removeChild = vi.fn();

  vi.stubGlobal("document", {
    createElement: vi.fn(() => textarea),
    body: { appendChild, removeChild },
    execCommand,
  });

  return { textarea, appendChild, removeChild };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("P2-S6: 생성물 — production 생성 계약", () => {
  it("유료 전체 생성물은 4종 타입, copyable=true, 정직성 가드를 만족한다", () => {
    const assets = deriveGeneratedAssets(assetInput(), { isPaid: true });

    expect(new Set(assets.map((asset) => asset.type))).toEqual(new Set(ASSET_TYPES));
    for (const asset of assets) {
      assertGeneratedAssetHonest(asset);
      expect(asset.copyable).toBe(true);
      expect(asset.content.length).toBeGreaterThan(5);
      expect(asset.title).not.toMatch(TECHNICAL_FORBIDDEN);
      expect(`${asset.title}\n${asset.content}`).not.toMatch(CAUSAL_FORBIDDEN);
    }
  });

  it("무료 목록은 미리보기 타입만 보여주고, ?type 진입은 요청 타입만 보여준다", () => {
    const freeAssets = deriveGeneratedAssets(assetInput(), { isPaid: false });
    const selected = deriveGeneratedAssets(assetInput(), {
      isPaid: false,
      type: "vendor_prescription",
    });

    expect(freeAssets.map((asset) => asset.type).sort()).toEqual(["place_intro", "review_request"]);
    expect(selected).toHaveLength(1);
    expect(selected[0]?.type).toBe("vendor_prescription");
  });

  it("저장된 생성물 조회도 copyable과 타입 필터를 제품 함수에서 보장한다", () => {
    const view = deriveGeneratedAssetViewFromPersisted(
      [
        { type: "snippet", code: "Q. 영업시간이 어떻게 되나요?\nA. 매일 오전 10시에 열어요." },
        { type: "place_intro", code: "테스트 한식당은 서울 마포구에서 따뜻한 한식을 준비해요." },
      ],
      (type) => (type === "snippet" || type === "place_intro" ? type : null),
      { isPaid: true, type: "place_intro" },
    );

    expect(view.assets).toHaveLength(1);
    expect(view.assets[0]?.type).toBe("place_intro");
    expect(view.assets[0]?.copyable).toBe(true);
    expect(view.assets[0]?.title).toBe(assetTypeToLabel("place_intro").label);
  });
});

describe("P2-S6: BigCopyButton — 실제 복사 경로", () => {
  it("clipboard API가 성공하면 fallback 없이 성공한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const execCommand = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    stubFallbackDocument(execCommand);

    await expect(copyTextWithFallback("복사할 문구")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("복사할 문구");
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("clipboard API 실패 후 execCommand가 true이면 성공으로 처리한다", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("blocked"));
    const execCommand = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const fallback = stubFallbackDocument(execCommand);

    await expect(copyTextWithFallback("fallback 문구")).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(fallback.textarea.value).toBe("fallback 문구");
    expect(fallback.appendChild).toHaveBeenCalled();
    expect(fallback.removeChild).toHaveBeenCalled();
  });

  it("clipboard API 실패 후 execCommand가 false이면 성공으로 속이지 않는다", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("blocked"));
    const execCommand = vi.fn().mockReturnValue(false);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    stubFallbackDocument(execCommand);

    await expect(copyTextWithFallback("실패 문구")).resolves.toBe(false);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });
});
