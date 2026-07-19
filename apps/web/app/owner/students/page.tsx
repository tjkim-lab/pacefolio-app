"use client";

/* owner 원생 목록(#51) — READY = listParticipants 서버 정본(이름·상태·반·미납,
   PII 미포함). #52: 상세도 서버 정본이 생겨 행 이동 개방. FIXTURE = 기존 데모 유지. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppScroll } from "@/components/mobile/MobileShell";
import { Card, Tag, cn } from "@/components/ui";
import { IconBell, IconSearch, IconChevron, IconUsers } from "@/components/ui/icons";
import { Greeting } from "../_kit";
import { KIDS, type Kid, type KidStatus } from "../_data";
import { OwnerLiveProvider, useOwnerLive } from "../../pc/_live";

const FILTERS: ("all" | KidStatus)[] = ["all", "재원", "체험", "휴원", "퇴원 예정"];
/* 서버 상태 → 화면 라벨 (도메인 ParticipantStatus 4종 — "퇴원 예정"은 서버 상태 아님) */
const ST_KO: Record<string, KidStatus | "퇴원"> = {
  ENROLLED: "재원", TRIAL: "체험", ON_BREAK: "휴원", WITHDRAWN: "퇴원",
};

function badge(k: Kid) {
  if (k.makeup > 0) return <Tag tone="warn">보강 {k.makeup}</Tag>;
  if (k.pay === "미납") return <Tag tone="danger">미납</Tag>;
  if (k.status !== "재원") return <Tag tone="muted">{k.status}</Tag>;
  if (k.pay === "일할 청구") return <Tag tone="accent">신규</Tag>;
  return null;
}

export default function OwnerStudents() {
  return (
    <OwnerLiveProvider>
      <OwnerStudentsBody />
    </OwnerLiveProvider>
  );
}

function OwnerStudentsBody() {
  const router = useRouter();
  const live = useOwnerLive();
  const ready = live.state === "READY";
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | KidStatus | "퇴원">("all");

  const list = KIDS.filter((k) => {
    if (filter !== "all" && k.status !== filter) return false;
    const query = q.trim();
    return !query || (k.nm + k.cls + k.parent).includes(query);
  });

  /* READY — 서버 정본 필터·검색 (검색은 이름·반, 연락처는 PII 라 서버 미제공) */
  const liveList = live.participants.filter((p) => {
    const label = ST_KO[p.status] ?? p.status;
    if (filter !== "all" && label !== filter) return false;
    const query = q.trim();
    return !query || (p.name + p.classNames.join(" ")).includes(query);
  });

  return (
    <>
      <AppScroll>
        <Greeting
          title={<>원생 👦</>}
          sub={ready ? `전체 ${live.participants.length}명 · 서버 정본` : "전체 93명 · 아래는 샘플 8명"}
          bell={<IconBell size={20} />}
        />

        {/* 검색 */}
        <div className="flex items-center gap-2.5 rounded-[13px] border border-line bg-fill px-3.5 py-3">
          <IconSearch size={17} className="text-ink3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={ready ? "원생 검색 (이름·반)" : "원생 검색 (이름·반·학부모 연락처)"}
            placeholder={ready ? "이름·반 검색" : "이름·반·학부모 연락처 검색"}
            className="flex-1 bg-transparent text-[13.5px] font-medium text-ink outline-none placeholder:text-placeholder"
          />
        </div>

        {/* 상태 필터 — READY 는 서버 상태 4종("퇴원 예정"은 서버 상태 아님) */}
        <div className="flex flex-wrap gap-2" role="group" aria-label="원생 상태 필터">
          {(ready ? (["all", "재원", "체험", "휴원", "퇴원"] as const) : FILTERS).map((f) => (
            <button
              key={f}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "min-h-11 rounded-full border-[1.5px] px-3.5 text-[12.5px] font-semibold transition",
                filter === f ? "border-accent-strong bg-accent-strong text-white" : "border-line bg-surface text-ink2",
              )}
            >
              {f === "all" ? "전체" : f}
            </button>
          ))}
        </div>

        {/* 리스트 — READY = 서버 정본 · 행 이동 = 서버 상세(#52) */}
        <Card pad={false} className="px-4">
          {ready ? (
            liveList.length === 0 ? (
              <div className="py-5 text-center">
                <div className="text-[34px]">🔍</div>
                <div className="mt-1 text-[12px] font-medium text-ink3">
                  {q.trim() ? `"${q.trim()}" 검색 결과가 없어요` : "해당 상태의 원생이 없어요"}
                </div>
              </div>
            ) : (
              liveList.map((p) => (
                <button
                  key={p.participantId}
                  onClick={() => router.push(`/owner/students/${p.participantId}`)}
                  className="flex w-full items-center gap-3 border-b border-line2 py-3 text-left last:border-b-0 active:bg-fill"
                >
                  <div className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full bg-fill text-[19px]">
                    🧒
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold text-ink">
                      {p.name} ({p.ageLabel})
                    </div>
                    <div className="mt-0.5 text-[11.5px] font-medium text-ink3">
                      {p.classNames.length ? p.classNames.join(" · ") : "반 미배정"}
                    </div>
                  </div>
                  {p.unpaid ? (
                    <Tag tone="danger">미납</Tag>
                  ) : (ST_KO[p.status] ?? p.status) !== "재원" ? (
                    <Tag tone="muted">{ST_KO[p.status] ?? p.status}</Tag>
                  ) : null}
                  <IconChevron size={18} className="shrink-0 text-ink3" />
                </button>
              ))
            )
          ) : list.length === 0 ? (
            <div className="py-5 text-center">
              <div className="text-[34px]">🔍</div>
              <div className="mt-1 text-[12px] font-medium text-ink3">
                {q.trim() ? `"${q.trim()}" 검색 결과가 없어요` : "해당 상태의 원생이 없어요"}
              </div>
            </div>
          ) : (
            list.map((k) => (
              <button
                key={k.id}
                onClick={() => router.push(`/owner/students/${k.id}`)}
                className="flex w-full items-center gap-3 border-b border-line2 py-3 text-left last:border-b-0 active:bg-fill"
              >
                <div className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full bg-fill text-[19px]">
                  {k.em}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-bold text-ink">
                    {k.nm} ({k.age}세)
                  </div>
                  <div className="mt-0.5 text-[11.5px] font-medium text-ink3">
                    {k.cls} · {k.coach} 코치
                  </div>
                </div>
                {badge(k)}
                <IconChevron size={18} className="shrink-0 text-ink3" />
              </button>
            ))
          )}
        </Card>

        <div className="flex items-start gap-2.5 rounded-2xl border border-line px-3.5 py-3 text-[12.5px] font-medium leading-normal text-ink2">
          <IconUsers size={20} className="mt-0.5 shrink-0 text-accent" />
          <span>
            모든 관리는 <b className="font-bold text-ink">원생 기준</b>이에요 — 아이는 계정이 없고, 원장이 먼저 등록하면 학부모가 폰번호 클레임으로 연결돼요. 형제는 같은 보호자로 연결돼 <b className="font-bold text-ink">합산 결제만 편해질 뿐</b>, 수납·정산 기록은 원생별로 분리 저장됩니다.
          </span>
        </div>
      </AppScroll>
    </>
  );
}
