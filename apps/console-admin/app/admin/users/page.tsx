import { AdminShell } from "../_shell";
import { PrepPlaceholder } from "../_prep";

export default function AdminUsers() {
  return (
    <AdminShell title="사용자 · 권한">
      <PrepPlaceholder
        name="사용자 · 권한 관리"
        desc="운영자 역할·접근 제어 — 누가 어떤 학원의 무엇을 볼 수 있는지 관리."
        points={[
          "지원 보기(Support View)는 비밀번호 우회 없이 읽기전용·마스킹·시간 제한으로만 접근",
          "개인정보 접근·정책 변경 등 민감 행위는 전부 감사 로그에 기록",
        ]}
      />
    </AdminShell>
  );
}
