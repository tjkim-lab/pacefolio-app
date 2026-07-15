"use client";

/* 활동 골라담기 시트 — 코치는 쓰지 않고 고르기만. 편집 권한에 따라 풀 제한/제안. */

import { useCoach } from "../_state";
import { LIB, POLICIES } from "../_data";
import { Sheet } from "./Bits";
import { Button, Tag, cn } from "@/components/ui";
import { IconCheck } from "@/components/ui/icons";

export default function LibrarySheet() {
  const { libOpen, closeLib, policy, tomorrow, toggleTomorrow, proposeTag, setProposeTag, showToast } =
    useCoach();
  const pol = POLICIES[policy];
  const src = pol.full ? LIB : LIB.filter((a) => pol.pool.includes(a.id));
  const total = tomorrow.reduce((s, id) => s + (LIB.find((a) => a.id === id)?.d ?? 0), 0);

  const sub =
    policy === "SELECT"
      ? "농구 토요특강 · 추천 활동 중에서만 골라요 (라이브러리 전체는 잠김)"
      : policy === "APPROVAL"
        ? "농구 토요특강 · 라이브러리 + 새 활동 제안(원장 승인)"
        : "농구 토요특강 · 학원 활동 라이브러리 전체에서 골라요";

  return (
    <Sheet open={libOpen} onClose={closeLib} title="활동 골라담기 🏀" sub={sub}>
      <div className="space-y-2">
        {src.map((a) => {
          const on = tomorrow.includes(a.id);
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => toggleTomorrow(a.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition",
                on ? "border-accent bg-accent-weak" : "border-line bg-surface",
              )}
            >
              <span
                className={cn(
                  "grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md border-2",
                  on ? "border-accent bg-accent text-white" : "border-line text-transparent",
                )}
              >
                <IconCheck size={13} />
              </span>
              <span className="text-[17px] shrink-0">{a.e}</span>
              <span className="flex-1">
                <span className="block text-[13px] font-bold text-ink">{a.n}</span>
                <span className="block text-[11px] font-medium text-ink3">{a.d}분 · {a.tag}</span>
              </span>
              <Tag tone="accent">{a.tag}</Tag>
            </button>
          );
        })}

        {pol.propose && (
          <button
            type="button"
            onClick={() => {
              setProposeTag(true);
              showToast("새 활동 제안 접수 — 원장 승인 대기 (승인되면 반영돼요)");
            }}
            className="flex w-full items-center gap-3 rounded-xl border border-dashed border-line bg-surface p-3 text-left"
          >
            <span className="text-[17px]">➕</span>
            <span className="flex-1">
              <span className="block text-[13px] font-bold text-ink">새 활동 제안</span>
              <span className="block text-[11px] font-medium text-ink3">
                {proposeTag ? "⏳ 원장 승인 대기" : "원장 승인 후 이 수업에 반영"}
              </span>
            </span>
          </button>
        )}
      </div>

      <Button
        full
        className="mt-4"
        onClick={() => {
          if (tomorrow.length === 0) {
            showToast("활동을 1개 이상 선택해주세요");
            return;
          }
          if (total > 35) showToast("총 " + total + "분 — 권장(25~35분)보다 길어요. 그대로 쓰거나 줄여주세요");
          else showToast("활동 " + tomorrow.length + "개 담김 — 이대로 확정만 누르면 끝");
          closeLib();
        }}
      >
        이대로 담기 · {tomorrow.length}개 · {total}분
      </Button>
    </Sheet>
  );
}
