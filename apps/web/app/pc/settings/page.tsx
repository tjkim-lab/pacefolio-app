"use client";

/* PC 설정 (13B) — 모든 행이 실제 상세로 연결.
   공통 규격: 현재 값 · 설명 · 변경값 · 적용일 · 영향 범위 · 저장 · 되돌리기 · AuditLog */
import { useState } from "react";
import { PCShell } from "../_shell";
import { Card, Button } from "@/components/ui";
import { IconChevron, IconSettings } from "@/components/ui/icons";
import { Note, RL, useOverlays } from "../_ui";
import { SETTINGS_ROWS } from "../_data";

/* 행별 상세 정의 — 현재 값·영향 범위·변경 옵션 (목업: 저장 = AuditLog 문구) */
const DETAIL: Record<string, { cur: [string, string][]; scope: string; opts?: string[] }> = {
  "학원 정보": {
    cur: [["학원명", "원더짐 아카데미"], ["부문", "브레인 · 액티브"], ["프로그램", "6개"], ["테마 색", "#12B5A5 (틸)"]],
    scope: "앱 표시명·테마 — 전 화면 즉시",
  },
  "할인 규칙": {
    cur: [["기본 규칙", "형제20 · 다종목10 · 장기5 중 MAX 하나"], ["이벤트", "×5% 곱셈 중첩"], ["상한", "20% (헌법)"], ["차량비", "할인 제외"]],
    scope: "다음 청구 계산부터 — 확정 청구 불변",
    opts: ["정률 규칙 추가", "정액 규칙 추가", "개인 할인 (이유 필수)"],
  },
  "환불 규정": {
    cur: [["바닥", "적용 법령·계약 기준"], ["커스텀", "더 후하게만"], ["승인", "학부모+원장 상호 승인"], ["부분 승인", "금지 (전액만)"]],
    scope: "신규 환불 요청부터",
  },
  "수납 주기": {
    cur: [["주기", "3개월 단위"], ["시작 월", "3·6·9·12월"], ["차량비", "별도·무할인"]],
    scope: "다음 수납 기간부터",
  },
  "직원 권한": {
    cur: [["원장", "전체"], ["데스크", "원생·출결 + 제한 수납"], ["코치", "담당 반 원생·안전 정보"], ["차량", "해당 운행 탑승 정보"]],
    scope: "즉시 — 세션 접근 시 재평가",
  },
  "감사 로그": {
    cur: [["대상", "프로그램·시간표·청구·출결·리포트 수정"], ["기록", "작성자·시각·이전 값·사유"], ["보존", "법정 기준"]],
    scope: "조회 전용 — 끌 수 없음",
  },
};

export default function PCSettings() {
  const { confirm, toast, overlays } = useOverlays();
  const [open, setOpen] = useState<string | null>(null);

  const save = (label: string) =>
    confirm({
      title: `${label} 설정을 변경할까요?`,
      rows: [["적용일", "저장 즉시 (수납 주기·할인은 다음 기간)"], ["영향 범위", DETAIL[label]?.scope ?? "-"], ["기록", "변경자·시각·이전 값 AuditLog"]],
      warn: "저장 후에도 '되돌리기'로 이전 값 복원 가능 — 복원도 AuditLog 에 남아요.",
      label: "저장",
      onConfirm: () => toast(`${label} 저장 — AuditLog 기록 (목업 · API_REQUIRED)`),
    });

  return (
    <PCShell title="설정" actions={<span className="text-[12.5px] text-ink3 font-medium">원더짐 아카데미</span>}>
      <Card className="max-w-[640px]" pad={false}>
        {SETTINGS_ROWS.map((r) => {
          const opened = open === r.label;
          const d = DETAIL[r.label];
          return (
            <div key={r.label} className="border-b border-line2 last:border-0">
              <button
                onClick={() => setOpen(opened ? null : r.label)}
                aria-expanded={opened}
                className="w-full flex items-baseline justify-between gap-2.5 px-4 py-3 text-left hover:bg-fill transition"
              >
                <span className="text-[13px] text-ink2 font-medium">
                  {r.label}
                  <small className="block text-[11px] text-ink3 font-medium mt-0.5">{r.sub}</small>
                </span>
                <IconChevron size={15} className={`text-ink3 shrink-0 transition-transform ${opened ? "rotate-90" : ""}`} />
              </button>
              {opened && d && (
                <div className="px-4 pb-3.5">
                  {d.cur.map(([k, v]) => (
                    <RL key={k} label={k} amount={v} />
                  ))}
                  <RL label="영향 범위" amount={d.scope} tone="accent" />
                  {d.opts && (
                    <div className="flex gap-1.5 flex-wrap mt-2">
                      {d.opts.map((o) => (
                        <button key={o}
                          onClick={() =>
                            o.indexOf("개인 할인") >= 0
                              ? confirm({
                                  title: "개인 할인을 추가할까요?",
                                  rows: [["대상 원생", "선택 필요"], ["할인", "정액 또는 정률"], ["필수 기록", "이유 · 전후 금액 · 기간 · 입력자 · 승인자"], ["검증", "할인 후 음수 금지 · 정률 100% 초과 금지 · 최종 상한(C10-01)"]],
                                  warn: "개인 할인은 이유 없이 저장할 수 없어요 — 전부 AuditLog 에 남아요.",
                                  label: "개인 할인 추가",
                                  onConfirm: () => toast("개인 할인 초안 생성 — 이유·승인자 입력 후 적용 (목업)"),
                                })
                              : toast(`${o} — 할인명·값·대상·기간·중복 허용·최대 한도 입력 (목업)`)
                          }
                          className="px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold border border-line text-brand bg-surface">
                          {o}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 mt-2.5">
                    <Button variant="primary" className="h-9 px-4 text-[12px]" onClick={() => save(r.label)}>변경…</Button>
                    <Button variant="ghost" className="h-9 px-4 text-[12px]" onClick={() => toast("이전 값으로 되돌리기 — 복원도 AuditLog 기록 (목업)")}>되돌리기</Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </Card>

      <div className="max-w-[640px]">
        <Note icon={<IconSettings size={16} />}>
          원장: 전체 접근·수납·환불·권한 승인 / 데스크: 원생·출결 운영, 제한된 수납 / 코치: 담당 반 원생과 안전 정보만 / 차량 담당: 해당 운행 탑승 정보만. <b className="text-ink font-bold">금액은 개인정보</b> — 잠금화면·알림에 표시되지 않고, 채팅은 권한·context card 조건부(docs/12 개정).
        </Note>
      </div>
      {overlays}
    </PCShell>
  );
}
