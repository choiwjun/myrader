// @TASK trust-set - 개인정보처리방침 페이지
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
  title: "개인정보처리방침 | 보이나",
};

export default function PrivacyPage() {
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

      <h1 className="text-2xl font-bold text-gray-900">개인정보처리방침</h1>
      <p className="text-xs text-gray-400">최종 업데이트: 2026년 6월</p>
      <p className="text-sm leading-relaxed text-gray-700">
        {val(SITE_META.companyName)}(이하 "회사")은 이용자의 개인정보를 소중히 여기며, 개인정보
        보호법 등 관련 법령을 준수합니다.
      </p>

      {/* 제1조 */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-gray-900">제1조 (수집하는 개인정보 항목)</h2>
        <div className="text-sm leading-relaxed text-gray-700 space-y-2">
          <p className="font-medium">무료 진단 이용 시</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>가게 이름, 지역(시/구 단위)</li>
            <li>네이버 플레이스 URL (선택)</li>
          </ul>
          <p className="font-medium">문의 및 계정 안내 시</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>이메일 주소</li>
            <li>결제 정보는 현재 수집하지 않습니다.</li>
          </ul>
        </div>
      </section>

      {/* 제2조 */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-gray-900">제2조 (수집 목적)</h2>
        <ul className="text-sm leading-relaxed text-gray-700 space-y-1 list-disc pl-4">
          <li>가게 검색 노출 현황 진단 및 개선 제안 제공</li>
          <li>문의 응대 및 계정 안내 이메일 전송</li>
          <li>서비스 품질 개선 및 오류 대응</li>
        </ul>
      </section>

      {/* 제3조 */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-gray-900">제3조 (보유 및 이용 기간)</h2>
        <ul className="text-sm leading-relaxed text-gray-700 space-y-1 list-disc pl-4">
          <li>진단 정보: 서비스 이용 목적 달성 후 즉시 삭제 (또는 최대 1년)</li>
          <li>결제 정보: 현재 수집하지 않음</li>
          <li>이용자가 삭제를 요청하면 지체 없이 파기합니다.</li>
        </ul>
      </section>

      {/* 제4조 */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-gray-900">제4조 (제3자 제공)</h2>
        <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-700 space-y-1">
          <p>
            현재 서비스 범위에서는 결제 대행사나 외부 알림 사업자에게 개인정보를 제공하지 않습니다.
          </p>
        </div>
        <p className="text-xs text-gray-500">
          위 경우 외에는 이용자 동의 없이 제3자에게 개인정보를 제공하지 않습니다.
        </p>
      </section>

      {/* 제5조 */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-gray-900">제5조 (이용자의 권리)</h2>
        <ul className="text-sm leading-relaxed text-gray-700 space-y-1 list-disc pl-4">
          <li>개인정보 열람, 정정, 삭제, 처리 정지를 요청할 수 있습니다.</li>
          <li>요청은 {val(SITE_META.contactEmail)}로 보내주시면 지체 없이 처리합니다.</li>
          <li>만 14세 미만 아동의 개인정보는 수집하지 않습니다.</li>
        </ul>
      </section>

      {/* 제6조 */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-gray-900">제6조 (개인정보 보호 책임자)</h2>
        <div className="rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-700 space-y-1">
          <p>
            <span className="font-medium">책임자:</span> {val(SITE_META.ceoName)}
          </p>
          <p>
            <span className="font-medium">문의 이메일:</span> {val(SITE_META.contactEmail)}
          </p>
        </div>
        <p className="text-xs text-gray-500">
          개인정보 처리에 관한 불만·문의는 위 이메일로 연락해 주세요. 개인정보 침해 신고는
          개인정보보호위원회(privacy.go.kr) 또는 한국인터넷진흥원(118)에 할 수 있습니다.
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
        <Link href="/terms" className="underline underline-offset-2">
          이용약관
        </Link>
        <Link href="/" className="underline underline-offset-2">
          홈으로
        </Link>
      </div>
    </main>
  );
}
