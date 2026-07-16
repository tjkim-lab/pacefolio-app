import { AdminShell } from "../_shell";
import { PrepPlaceholder } from "../_prep";

export default function AdminBilling() {
  return (
    <AdminShell title="PACEFOLIO 구독">
      <PrepPlaceholder
        name="PACEFOLIO 구독 관리"
        desc="학원 과금·플랜·MRR — 학원이 PACEFOLIO에 내는 구독료 흐름."
        points={[
          "수강료(학부모→학원)·구독(학원→PACEFOLIO)·커머스 직영 — 돈 흐름 3종은 메뉴에서 분리 유지",
          "가격정책(원장 과금)은 미정 · 결제선생형 정산 벤치마크 검토중",
        ]}
      />
    </AdminShell>
  );
}
