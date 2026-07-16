import { AdminShell } from "../_shell";
import { PrepPlaceholder } from "../_prep";

export default function AdminSettings() {
  return (
    <AdminShell title="플랫폼 설정 · 정책">
      <PrepPlaceholder
        name="플랫폼 설정 · 정책"
        desc="약관·개인정보·정책 기준값 관리. 환불 하한·할인 상한·분기 캘린더 등 플랫폼 공통 규칙."
        points={[
          "환불: 법정 기준이 바닥(더 후하게만 커스텀) · 학부모+원장 상호 승인 필수",
          "할인: 형제·다종목·장기 중 MAX 하나 × 이벤트 곱셈중첩, 상한 20%",
          "분기제(3·6·9·12 달력고정) · 기본값 월납 · 차량비 별도·무할인",
        ]}
      />
    </AdminShell>
  );
}
