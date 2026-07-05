// @TASK trust-set - 이용약관 페이지
// @SPEC docs/planning/05-design-system.md §5 (정직성: 빈 운영주체 정보 = "(오픈 전 등록 예정)")
//
// 정적 페이지 — DB 접근 없음. env 없이 빌드 가능.
// 최상단 초안 고지 박스 필수 (정직성).

import { SITE_META } from "@/lib/shared/site-meta";
import Link from "next/link";

const PLACEHOLDER = "(오픈 전 등록 예정)";
function val(v: string): string {
  return v.trim() !== "" ? v : PLACEHOLDER;
}

export const metadata = {
  title: "이용약관 | 보이나",
};

export default function TermsPage() {
  return (
    <main className="px-6 py-8 space-y-6 text-gray-800">
      {/* 뒤로 */}
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-blue-600">
        ← 홈으로
      </Link>

      {/* 초안 고지 박스 */}
      <div className="rounded-2xl border border-yellow-300 bg-yellow-50 px-5 py-4">
        <p className="text-sm font-semibold text-yellow-800">
          본 문서는 초안이며, 정식 오픈 전 최종 검토 예정입니다.
        </p>
      </div>

      <h1 className="text-2xl font-bold text-gray-900">이용약관</h1>
      <p className="text-xs text-gray-400">최종 업데이트: 2026년 6월</p>

      {/* 제1조 */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-gray-900">제1조 (목적)</h2>
        <p className="text-sm leading-relaxed text-gray-700">
          이 약관은 {val(SITE_META.companyName)}(이하 "회사")이 운영하는 보이나 서비스(이하
          "서비스")의 이용 조건 및 절차에 관한 사항을 규정함을 목적으로 합니다.
        </p>
      </section>

      {/* 제2조 */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-gray-900">제2조 (정의)</h2>
        <ul className="text-sm leading-relaxed text-gray-700 space-y-1 list-disc pl-4">
          <li>
            "서비스"란 회사가 제공하는 AI 기반 가게 검색 노출 진단 및 개선 제안 서비스를 말합니다.
          </li>
          <li>"이용자"란 이 약관에 동의하고 서비스를 이용하는 개인 또는 사업자를 말합니다.</li>
          <li>현재 서비스 범위에는 유료 결제 기능이 포함되지 않습니다.</li>
        </ul>
      </section>

      {/* 제3조 */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-gray-900">제3조 (약관의 효력 및 변경)</h2>
        <p className="text-sm leading-relaxed text-gray-700">
          이 약관은 서비스 화면에 게시하거나 이용자에게 통지함으로써 효력이 발생합니다. 회사는
          약관을 변경할 경우 변경 사유 및 적용일을 명시하여 서비스 내에 공지합니다.
        </p>
      </section>

      {/* 제4조 */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-gray-900">제4조 (서비스 내용)</h2>
        <ul className="text-sm leading-relaxed text-gray-700 space-y-1 list-disc pl-4">
          <li>무료 진단: 가게 이름·지역 입력 후 네이버·구글·AI 노출 현황 확인</li>
          <li>개선 제안 및 경쟁 분석: 서비스 화면에서 제공되는 범위 내에서 확인</li>
          <li>회사는 운영상 필요에 따라 서비스 내용을 변경하거나 종료할 수 있습니다.</li>
        </ul>
      </section>

      {/* 제5조 */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-gray-900">제5조 (이용자 의무)</h2>
        <ul className="text-sm leading-relaxed text-gray-700 space-y-1 list-disc pl-4">
          <li>이용자는 허위 정보를 입력하지 않아야 합니다.</li>
          <li>서비스를 상업적 목적으로 무단 재배포하거나 크롤링에 활용해서는 안 됩니다.</li>
          <li>타인의 가게 정보를 무단으로 조회하거나 악용해서는 안 됩니다.</li>
        </ul>
      </section>

      {/* 제6조 */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-gray-900">제6조 (요금 및 결제)</h2>
        <ul className="text-sm leading-relaxed text-gray-700 space-y-1 list-disc pl-4">
          <li>현재 서비스는 결제 기능을 제공하지 않습니다.</li>
          <li>결제 기능을 도입하는 경우 별도 약관과 고지로 이용 조건을 안내합니다.</li>
          <li>요금 관련 문의는 {val(SITE_META.contactEmail)}로 보내 주세요.</li>
        </ul>
      </section>

      {/* 제7조 */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-gray-900">제7조 (면책)</h2>
        <p className="text-sm leading-relaxed text-gray-700">
          서비스는 가게 노출 현황 정보 제공을 목적으로 하며, 검색 순위 상승·매출 증가를 보장하지
          않습니다. 서비스 결과는 참고 정보이며 최종 판단은 이용자가 합니다.
        </p>
      </section>

      {/* 제8조 */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-gray-900">제8조 (분쟁 해결)</h2>
        <p className="text-sm leading-relaxed text-gray-700">
          서비스 이용 관련 분쟁은 대한민국 법률을 준거법으로 하며, 소재지 관할 법원을 전속
          관할법원으로 합니다.
        </p>
      </section>

      {/* 운영주체 */}
      <section className="rounded-2xl bg-gray-50 px-5 py-4 space-y-1 text-xs text-gray-500">
        <p className="font-semibold text-gray-700">운영주체</p>
        <p>
          상호: {val(SITE_META.companyName)} · 대표: {val(SITE_META.ceoName)}
        </p>
        <p>사업자등록번호: {val(SITE_META.bizRegNo)}</p>
        <p>주소: {val(SITE_META.address)}</p>
        <p>문의: {val(SITE_META.contactEmail)}</p>
      </section>

      {/* 하단 링크 */}
      <div className="flex gap-4 text-xs text-gray-400 pb-4">
        <Link href="/privacy" className="underline underline-offset-2">
          개인정보처리방침
        </Link>
        <Link href="/" className="underline underline-offset-2">
          홈으로
        </Link>
      </div>
    </main>
  );
}
