"use client";

/* 단일 데이터 소스 라이브 데모 — F5 증명 화면.
   "엄마가 결석 통보 → 코치 명단 반영 → 원장 할 일 → 코치 확정 → 해결"이
   lib/fixtures 하나에서 세 역할 뷰로 동시에 흐르는 것을 브라우저에서 시연.
   ⚠️ 제품 화면이 아니라 개발 검증/데모 surface (디자인은 별도 세션 소관). */

import { useMemo, useState } from "react";
import Link from "next/link";
import * as db from "@/lib/fixtures";
import type { AttendanceRecordStatus } from "@pacefolio/domain";

const SESSION_ID = "s_play2_1027"; // 10/27(월) 플레이2 월수반
const KID_ID = "p_dodam";          // 김도담(박서연 자녀)
const GUARDIAN_ID = "gd_psy";      // 박서연 → 도담·서준

export default function LiveSourceDemo() {
  // 클라이언트 상태 = 이 데모에서 조작 가능한 부분 (나머진 fixtures 그대로)
  const [noticeAbsent, setNoticeAbsent] = useState(true); // 엄마의 결석 통보
  const [record, setRecord] = useState<AttendanceRecordStatus | null>(null); // 코치 확정

  const session = db.sessions.find((s) => s.id === (SESSION_ID as never))!;
  const soccerEnroll = db.enrollments.filter(
    (e) => e.classId === session.classId && e.status === "ACTIVE",
  );

  // ── 세 역할이 "같은 데이터"를 각자 관점으로 ──
  const roster = soccerEnroll.map((e) => {
    const p = db.participants.find((x) => x.id === e.participantId)!;
    const isKid = p.id === (KID_ID as never);
    return {
      name: p.name,
      expected: isKid && noticeAbsent ? "결석 예정" : null,
      actual: isKid ? record : null,
    };
  });

  const ownerTask = useMemo(() => {
    if (!noticeAbsent) return null; // 통보 없으면 할 일 없음
    if (record) return { title: "김도담 10/27 결석 — 처리 완료", stage: "RESOLVED", result: "ACKNOWLEDGED" };
    return { title: "김도담 10/27 결석 통보 — 코치 반영 확인", stage: "IN_PROGRESS", result: "ACKNOWLEDGED" };
  }, [noticeAbsent, record]);

  const parentInvoices = db.invoicesForGuardian(GUARDIAN_ID as never);

  const consistency = db.checkConsistency();

  return (
    <div className="min-h-screen bg-[#0e1116] text-white px-5 py-8">
      <div className="max-w-6xl mx-auto">
        {/* 헤더 */}
        <div className="flex items-center gap-3 flex-wrap mb-1">
          <span className="text-xl">🔗</span>
          <h1 className="text-[19px] font-extrabold tracking-tight">단일 데이터 소스 — 라이브 연결 데모</h1>
          <span className="text-[11px] font-semibold text-emerald-300 bg-emerald-400/10 px-2 py-0.5 rounded-full">
            F5 증명
          </span>
          <div className="flex-1" />
          <Link href="/stage" className="text-[12px] font-semibold px-3 h-8 rounded-lg bg-white/10 hover:bg-white/15 flex items-center">← 스테이지</Link>
        </div>
        <p className="text-[13px] text-white/50 mb-5">
          아래 버튼을 누르면 <b className="text-white/80">lib/fixtures 하나</b>가 학부모·코치·원장 세 화면에 동시에 반영됩니다.
          같은 <code className="text-emerald-300">participantId=p_dodam</code> · <code className="text-emerald-300">sessionId=s_play2_1027</code> 로 연결.
        </p>

        {/* 조작 패널 */}
        <div className="flex flex-wrap gap-3 mb-6 p-4 rounded-2xl bg-white/[0.04] border border-white/10">
          <button
            onClick={() => { setNoticeAbsent((v) => !v); setRecord(null); }}
            className={`text-[13px] font-bold px-4 h-11 rounded-xl transition ${noticeAbsent ? "bg-amber-400/90 text-black" : "bg-white/10 text-white/80 hover:bg-white/15"}`}
          >
            👩 엄마: 김도담 10/27 결석 통보 {noticeAbsent ? "취소" : "하기"}
          </button>
          <button
            onClick={() => setRecord((v) => (v ? null : "ABSENT"))}
            disabled={!noticeAbsent}
            className={`text-[13px] font-bold px-4 h-11 rounded-xl transition disabled:opacity-30 ${record ? "bg-emerald-400/90 text-black" : "bg-white/10 text-white/80 hover:bg-white/15"}`}
          >
            🏃 코치: 실제 출결 {record ? "확정 취소" : "결석으로 확정"}
          </button>
        </div>

        {/* 세 역할 뷰 */}
        <div className="grid md:grid-cols-3 gap-4">
          {/* 학부모 */}
          <RoleCard tone="#3b82f6" emoji="👨‍👩‍👧" role="학부모 (박서연)">
            <div className="space-y-3">
              <Row label="김도담 · 10/27 플레이2">
                {noticeAbsent
                  ? <Pill tone="amber">결석 통보함 ✓</Pill>
                  : <Pill tone="slate">정상 등원 예정</Pill>}
              </Row>
              <div className="pt-2 border-t border-white/10">
                <div className="text-[11px] text-white/40 mb-1.5">우리 아이 청구서 (3분기)</div>
                {parentInvoices.map((iv) => (
                  <div key={iv.invoice.id} className="flex justify-between text-[12.5px] py-0.5">
                    <span className="text-white/70">{iv.participantName}</span>
                    <span className="tabular-nums">{iv.invoice.total.toLocaleString()}원 <span className="text-emerald-300">완납</span></span>
                  </div>
                ))}
              </div>
            </div>
          </RoleCard>

          {/* 코치 */}
          <RoleCard tone="#f97316" emoji="🏃" role="코치 (김선재)">
            <div className="text-[11px] text-white/40 mb-1.5">10/27(월) 플레이2 월수반 명단 · {roster.length}명</div>
            <div className="space-y-1.5">
              {roster.map((r) => (
                <div key={r.name} className="flex items-center justify-between text-[12.5px]">
                  <span className="text-white/80">{r.name}</span>
                  <span className="flex gap-1.5">
                    {r.expected && <Pill tone="amber">{r.expected}</Pill>}
                    {r.actual === "ABSENT" && <Pill tone="rose">결석 확정</Pill>}
                    {!r.actual && r.expected && <Pill tone="slate">미확정</Pill>}
                    {!r.actual && !r.expected && <span className="text-white/30 text-[11px]">—</span>}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[10.5px] text-white/30 mt-2">예정(엄마 통보) ≠ 실제(코치 확정) — 별개 트랙</p>
          </RoleCard>

          {/* 원장 */}
          <RoleCard tone="#12b5a5" emoji="🏫" role="원장 (김도윤)">
            <div className="text-[11px] text-white/40 mb-1.5">오늘 처리할 일</div>
            {ownerTask ? (
              <div className={`p-3 rounded-xl border ${ownerTask.stage === "RESOLVED" ? "bg-emerald-400/10 border-emerald-400/30" : "bg-white/[0.04] border-white/10"}`}>
                <div className="text-[12.5px] font-semibold text-white/90 leading-snug">{ownerTask.title}</div>
                <div className="flex gap-1.5 mt-2">
                  <Pill tone={ownerTask.stage === "RESOLVED" ? "emerald" : "slate"}>{ownerTask.stage}</Pill>
                  <Pill tone="slate">{ownerTask.result}</Pill>
                </div>
              </div>
            ) : (
              <div className="text-white/30 text-[12px] py-3">할 일 없음 ✓</div>
            )}
            <p className="text-[10.5px] text-white/30 mt-2">행동(발송) ≠ 문제해결 — 2축 상태</p>
          </RoleCard>
        </div>

        {/* 정합성 */}
        <div className="mt-5 text-[12px] flex items-center gap-2">
          <span className="text-white/40">데이터 정합성 검증:</span>
          {consistency.length === 0
            ? <span className="text-emerald-300 font-semibold">오류 0 ✅ (금액·참조 앞뒤 일치)</span>
            : <span className="text-rose-300">{consistency.length}건 불일치</span>}
        </div>
      </div>
    </div>
  );
}

function RoleCard({ tone, emoji, role, children }: { tone: string; emoji: string; role: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white/[0.04] border border-white/10 p-4" style={{ boxShadow: `inset 3px 0 0 ${tone}` }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">{emoji}</span>
        <span className="text-[13px] font-bold">{role}</span>
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12.5px] text-white/70">{label}</span>
      {children}
    </div>
  );
}

function Pill({ tone, children }: { tone: "amber" | "rose" | "emerald" | "slate"; children: React.ReactNode }) {
  const map = {
    amber: "bg-amber-400/20 text-amber-200",
    rose: "bg-rose-400/20 text-rose-200",
    emerald: "bg-emerald-400/20 text-emerald-200",
    slate: "bg-white/10 text-white/60",
  }[tone];
  return <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-md ${map}`}>{children}</span>;
}
