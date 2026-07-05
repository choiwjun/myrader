// @TASK trust-set - 사이트 푸터 (서버 컴포넌트, 정적)
// @SPEC docs/planning/05-design-system.md §2 (모바일·작은 회색 글씨)
// @SPEC docs/planning/05-design-system.md §5 (정직성: 빈 필드 = "(오픈 전 등록 예정)", 가짜값 0)
//
// SITE_META 단일 출처. 빈 필드는 가짜값 없이 명확히 표시.
// env 없이 빌드 가능 (정적 상수).

import { SITE_META } from "@/lib/shared/site-meta";
import Link from "next/link";

const PLACEHOLDER = "(오픈 전 등록 예정)";

function val(v: string): string {
  return v.trim() !== "" ? v : PLACEHOLDER;
}

export function SiteFooter() {
  return (
    <footer className="mt-8 border-t border-gray-100 px-6 py-8 text-xs text-gray-400 space-y-1">
      {/* 서비스명 */}
      <p className="font-semibold text-gray-500 text-sm">{SITE_META.serviceName}</p>

      {/* 운영주체 */}
      <p>
        상호: {val(SITE_META.companyName)}
        {" · "}
        대표: {val(SITE_META.ceoName)}
      </p>

      {/* 사업자등록번호 */}
      <p>사업자등록번호: {val(SITE_META.bizRegNo)}</p>

      {/* 통신판매업번호 — 값 있을 때만 표시 */}
      {SITE_META.mailOrderNo.trim() !== "" && <p>통신판매업 신고번호: {SITE_META.mailOrderNo}</p>}

      {/* 주소 */}
      <p>주소: {val(SITE_META.address)}</p>

      {/* 문의 이메일 */}
      <p>
        문의:{" "}
        {SITE_META.contactEmail.trim() !== "" ? (
          <a href={`mailto:${SITE_META.contactEmail}`} className="underline underline-offset-2">
            {SITE_META.contactEmail}
          </a>
        ) : (
          PLACEHOLDER
        )}
      </p>

      {/* 약관 링크 */}
      <div className="flex gap-4 pt-2">
        <Link href="/terms" className="underline underline-offset-2">
          이용약관
        </Link>
        <Link href="/privacy" className="underline underline-offset-2">
          개인정보처리방침
        </Link>
      </div>

      {/* 저작권 */}
      <p className="pt-1">ⓒ 2026 보이나</p>
    </footer>
  );
}
