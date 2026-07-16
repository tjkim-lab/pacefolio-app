"use client";

import { useState } from "react";
import { AppHeader, AppScroll } from "@/components/mobile/MobileShell";
import { Card, cn } from "@/components/ui";
import { IconSpark } from "@/components/ui/icons";
import { useCoach } from "../../_state";
import { handoverSafety, type ByeKid } from "../../_data";

export default function CoachHandover() {
  const c = useCoach();
  return (
    <>
      <AppHeader title="작별 피드백 🌱" back="/coach/me" />
      <AppScroll>
        <div className="-mt-1 text-[11.5px] font-medium text-ink3">
          담당 12명 중 우선 4명 · {c.byeDone}/4 작성
        </div>

        <div className="flex items-start gap-2.5 rounded-xl border border-line px-3.5 py-3 text-[12.5px] font-medium leading-relaxed text-ink2">
          <span className="mt-0.5 shrink-0 text-brand"><IconSpark size={18} /></span>
          <span>
            <b className="text-ink">이 기록은 브리핑에 포함돼요</b> · 노하우는 학원에 남아요. 접근권한이 회수되기 전까지 쓸 수 있어요. 관찰된 행동 중심으로, 다음 코치가 바로 쓸 수 있게 적어주세요.
          </span>
        </div>

        {/* 안전 정보 (자동 인계) */}
        <Card className="border-danger-weak bg-danger-weak/40">
          <h4 className="text-[13.5px] font-bold text-ink">{handoverSafety.title}</h4>
          <div className="mt-1 text-[12.5px] font-medium leading-relaxed text-ink2">
            <b className="text-ink">{handoverSafety.who}</b>
            <br />
            {handoverSafety.detail}
            <br />
            <span className="text-[11px] text-ink3">{handoverSafety.meta}</span>
          </div>
        </Card>

        {c.byeKids.map((k) => (
          <ByeRow key={k.id} kid={k} />
        ))}

        <div className="flex items-start gap-2.5 rounded-xl border border-line px-3.5 py-3 text-[12px] font-medium leading-relaxed text-ink2">
          <span className="mt-0.5 shrink-0 text-brand"><IconSpark size={16} /></span>
          <span>
            인수인계 기록은 <b className="text-ink">학원의 원생 관리 기록</b>으로 저장돼요 — 권한이 있는 담당자만, 정해진 보관 정책에 따라 확인할 수 있어요. 퇴원·보호자 요청·보관 기간 종료 시 정책에 따라 처리돼요.
          </span>
        </div>
      </AppScroll>
    </>
  );
}

function ByeRow({ kid }: { kid: ByeKid }) {
  const c = useCoach();
  const [draft, setDraft] = useState("");

  if (kid.done) {
    return (
      <div className="rounded-2xl border border-accent bg-accent-weak p-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full bg-fill text-[12.5px] font-bold text-ink2">{kid.initial}</div>
          <div className="flex-1">
            <div className="text-[13.5px] font-bold text-ink">{kid.name}</div>
            <div className="text-[11px] font-medium text-ink3">{kid.sub}</div>
          </div>
          <span className="shrink-0 text-[11px] font-extrabold text-accent-ink">✓ 완료</span>
        </div>
        <div className="mt-2 text-[12.5px] font-medium leading-relaxed text-accent-ink">&ldquo;{kid.msg}&rdquo;</div>
      </div>
    );
  }

  const complete = () => {
    if (!draft.trim()) {
      setDraft(kid.def ?? "");
      c.showToast("추천 초안을 넣어뒀어요 — 확인·수정한 뒤 완료를 눌러주세요");
      return;
    }
    c.completeBye(kid.id, draft);
  };

  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <div className="flex items-center gap-2.5">
        <div className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full bg-fill text-[12.5px] font-bold text-ink2">{kid.initial}</div>
        <div className="flex-1">
          <div className="text-[13.5px] font-bold text-ink">{kid.name}</div>
          <div className="text-[11px] font-medium text-ink3">{kid.sub}</div>
        </div>
        <button
          onClick={complete}
          className={cn("shrink-0 rounded-lg bg-accent-strong px-3 py-2 text-[12px] font-bold text-white")}
        >
          완료
        </button>
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={2}
        placeholder={kid.placeholder}
        className="mt-2 w-full resize-none rounded-lg border border-line bg-fill px-3 py-2.5 text-[12.5px] font-medium text-ink focus:outline-none focus:border-accent focus:bg-surface"
      />
    </div>
  );
}
