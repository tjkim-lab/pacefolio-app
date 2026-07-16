"use client";

/* 수업 모드 (풀스크린) — ① 출석 → ② 활동·기록 → ③ 코치 한마디 → 발송 완료 */

import { useState } from "react";
import Link from "next/link";
import { useCoach, attCounts, uniqGuardians } from "../_state";
import { KIDS, CLASS_ACTS, SKIP_WHYS, PHOTO_SCOPE, ATT_TXT, type AttStatus } from "../_data";
import { Button, Card, cn } from "@/components/ui";
import { IconCheck, IconClock, IconSpark } from "@/components/ui/icons";
import { Chip } from "./Bits";

const STEP_TITLE: Record<number, string> = {
  1: "① 출석 체크",
  2: "② 활동 체크 · 기록",
  3: "③ 코치 한마디",
  4: "발송 완료",
};

const cellTone: Record<AttStatus, string> = {
  "": "border-line bg-surface",
  p: "border-accent bg-accent-weak",
  l: "border-warn bg-warn-weak",
  a: "border-danger bg-danger-weak",
};
const avatarTone: Record<AttStatus, string> = {
  "": "bg-fill text-ink2",
  p: "bg-accent text-white",
  l: "bg-warn text-white",
  a: "bg-danger text-white",
};

export default function ClassMode() {
  const c = useCoach();
  if (!c.classOpen) return null;

  return (
    <div className="absolute inset-0 z-[300] flex flex-col bg-surface">
      {/* 헤더 */}
      <div className="shrink-0 border-b border-line2 px-4 pt-3 pb-3">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              c.closeClass();
              c.showToast(
                c.reportSent
                  ? "수업 완료 ✓"
                  : "이 프로토타입을 닫기 전까지 진행 상태가 유지돼요 — 실제 앱은 단계별 자동 저장",
              );
            }}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-fill text-ink2"
            aria-label="닫기"
          >
            ✕
          </button>
          <div className="flex-1">
            <b className="block text-[15px] font-extrabold text-ink">{STEP_TITLE[c.classStep]}</b>
            <small className="text-[11.5px] font-medium text-ink3">
              플레이2 · 14회차 &quot;균형과 리듬 ②&quot; · 1~2분이면 리포트까지
            </small>
          </div>
        </div>
        <div className="mt-3 flex gap-1.5">
          {[1, 2, 3].map((i) => (
            <i
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                i <= Math.min(c.classStep, 3) ? "bg-accent" : "bg-line",
              )}
            />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[10.5px] font-bold text-ink3">
          {["출석", "활동·기록", "리포트"].map((lb, i) => (
            <span key={lb} className={i + 1 <= Math.min(c.classStep, 3) ? "text-accent-ink" : ""}>
              {lb}
            </span>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2">
        {c.classStep === 1 && <StepAttendance />}
        {c.classStep === 2 && <StepActivities />}
        {c.classStep === 3 && <StepReport />}
        {c.classStep === 4 && <StepDone />}
      </div>
    </div>
  );
}

/* ---------- STEP 1 ---------- */
function StepAttendance() {
  const c = useCoach();
  const counts = attCounts(c.att);

  return (
    <>
      <div className="mt-1 px-0.5 text-[11px] font-bold text-ink3">
        실제 출결 — 학부모 접수는 &apos;예정&apos; 정보, 최종 확정은 코치가 해요
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { v: counts.p, k: "출석 ○", t: "text-accent-ink" },
          { v: counts.l, k: "지각 △", t: "text-warn-ink" },
          { v: counts.a, k: "결석 ✕", t: "text-danger-ink" },
        ].map((s) => (
          <div key={s.k} className="rounded-xl border border-line bg-surface py-2.5 text-center">
            <div className={cn("text-[18px] font-extrabold", s.t)}>{s.v}</div>
            <div className="mt-0.5 text-[10.5px] font-semibold text-ink3">{s.k}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {KIDS.map((k) => {
          if (k.paused) {
            return (
              <div key={k.n} className="rounded-xl border border-line bg-surface px-1.5 py-2.5 text-center opacity-50">
                <div className="mx-auto grid h-[34px] w-[34px] place-items-center rounded-full bg-fill text-[13px] font-extrabold text-ink2">
                  {k.n[0]}
                </div>
                <div className="mt-1.5 text-[12px] font-bold text-ink">{k.n}</div>
                <div className="mt-0.5 text-[10px] font-bold text-ink3">휴원 · 대상 제외</div>
              </div>
            );
          }
          const st = (c.att[k.n] || "") as AttStatus;
          const planned = k.planned && !c.overridden[k.n] && !st;
          const stTxt = planned ? `학부모 결석 예정 · ${k.why} · 실제 미확인` : ATT_TXT[st];
          return (
            <button
              key={k.n}
              type="button"
              onClick={() => (planned ? c.openAbs(k.n) : c.cycleAtt(k.n))}
              className={cn("rounded-xl border px-1.5 py-2.5 text-center transition", cellTone[st])}
            >
              <div className={cn("mx-auto grid h-[34px] w-[34px] place-items-center rounded-full text-[13px] font-extrabold", avatarTone[st])}>
                {k.n[0]}
              </div>
              <div className="mt-1.5 text-[12px] font-bold text-ink">{k.n}</div>
              <div className={cn("mt-0.5 text-[10px] font-bold", st === "p" ? "text-accent-ink" : st === "l" ? "text-warn-ink" : st === "a" ? "text-danger-ink" : "text-ink3")}>
                {stTxt}
              </div>
              {k.safe ? (
                <div className="mt-1 inline-block max-w-full truncate rounded-md bg-danger-weak px-1.5 py-0.5 text-[9px] font-extrabold text-danger-ink">
                  {k.safe}
                </div>
              ) : k.cond ? (
                <div className="mt-1 inline-block max-w-full truncate rounded-md bg-warn-weak px-1.5 py-0.5 text-[9px] font-extrabold text-warn-ink">
                  {k.cond}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-2.5 flex justify-end">
        <button
          onClick={c.allPresent}
          className="rounded-full border border-dashed border-line bg-fill px-3 py-1.5 text-[11.5px] font-bold text-ink2"
        >
          안 누른 아이 모두 출석 ⚡
        </button>
      </div>

      {c.attLog.length > 0 && (
        <div className="mt-2.5 rounded-xl border border-dashed border-line px-3 py-2.5 text-[11.5px] font-medium text-ink2">
          <b className="text-ink">출결 변경 이력</b>
          {c.attLog.map((t, i) => (
            <div key={i} className="mt-0.5 text-[10.5px] text-ink3">{t}</div>
          ))}
        </div>
      )}

      <Note>
        민준이는 학부모가 접수한 <b className="text-ink">결석 예정(아파요)</b> — 아이가 실제로 오면 탭해서 바꿀 수 있어요(사유·이력이 남아요). 도담이는 <b className="text-ink">컨디션 주의</b>로 참석해요. 아이를 탭하면 출석○ → 결석✕ → 지각△ 순환.
      </Note>

      <div className="sticky bottom-0 -mx-4 mt-3 bg-gradient-to-t from-surface via-surface to-transparent px-4 pb-1 pt-3">
        <SaveAttButton counts={counts} />
      </div>
    </>
  );
}

function SaveAttButton({ counts }: { counts: { p: number; l: number; a: number; none: number } }) {
  const c = useCoach();
  if (c.reportSent)
    return <Button full disabled variant="primary" className="bg-accent-ink">최종 확정됨 · 리포트에 반영</Button>;
  if (c.attSaved)
    return <Button full disabled variant="primary" className="bg-accent-ink">임시 저장됨 ✓ · 수업 종료 전까지 수정할 수 있어요</Button>;
  if (counts.none === 0)
    return (
      <Button full variant="primary" onClick={c.saveAtt}>
        출석 임시 저장 ({counts.p}·{counts.l}·{counts.a})
      </Button>
    );
  return <Button full disabled variant="primary">모두 체크하면 저장할 수 있어요 ({counts.none}명 남음)</Button>;
}

/* ---------- STEP 2 ---------- */
function StepActivities() {
  const c = useCoach();
  const [recIn, setRecIn] = useState("");
  const [recBadge, setRecBadge] = useState<string | null>(null);

  return (
    <>
      <div className="px-0.5 pt-2 text-[12.5px] font-semibold text-ink3">
        오늘 활동 3개 — 완료를 누르고, 기록이 나오면 숫자만 적어주세요 ✍️
      </div>

      {CLASS_ACTS.map((a, i) => {
        const done = c.actsDone[i];
        const skip = !!c.actWhy[i];
        return (
          <div
            key={a.n}
            className={cn(
              "mt-2.5 rounded-2xl border p-3",
              done ? "border-accent bg-accent-weak" : skip ? "border-warn bg-warn-weak" : "border-line bg-surface",
            )}
          >
            <div className="flex items-center gap-3">
              <div className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl bg-fill text-[18px]">{a.e}</div>
              <div className="flex-1">
                <div className="text-[13.5px] font-bold text-ink">{a.n}</div>
                <div className="text-[11px] font-medium text-ink3">{a.sub}</div>
              </div>
              <button
                onClick={() => c.toggleAct(i)}
                className={cn(
                  "shrink-0 rounded-xl border px-3 py-2 text-[12px] font-bold transition",
                  done ? "border-accent bg-accent text-white" : "border-line bg-surface text-ink3",
                )}
              >
                {done ? "완료 ✓" : "완료"}
              </button>
            </div>

            {a.record && (
              <div className="mt-2.5 rounded-xl border border-line bg-fill px-3 py-2.5">
                <div className="text-[12px] font-semibold text-ink2">
                  🏅 {a.record.kid} — {a.record.label} <b className="text-ink">지난 기록 {a.record.last}초</b>{" "}
                  <span className="text-[10.5px] text-ink3">· {a.record.hint}</span>
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={300}
                    value={recIn}
                    onChange={(e) => setRecIn(e.target.value)}
                    placeholder="18"
                    aria-label="한발 서기 기록 (초)"
                    className="w-[74px] rounded-lg border border-line bg-surface px-2.5 py-2 text-center text-[14px] font-bold text-ink focus:outline-none focus:border-accent"
                  />
                  <span className="text-[12.5px] font-semibold text-ink3">초 (1~300)</span>
                  <button
                    onClick={() => {
                      const v = parseInt(recIn, 10);
                      const r = c.saveRecord(v);
                      if (r === "record") setRecBadge(`신기록! 🎉 ${a.record!.last}초 → ${v}초 · 다시 저장하면 수정돼요`);
                      else if (r === "coach") setRecBadge(`코치 기록 저장됨 · ${v}초 (지난 기록 ${a.record!.last}초)`);
                    }}
                    className="rounded-lg bg-accent-strong px-3.5 py-2 text-[12px] font-bold text-white"
                  >
                    기록 저장
                  </button>
                </div>
                {recBadge && (
                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-warn-weak px-3 py-1.5 text-[12px] font-extrabold text-warn-ink">
                    {recBadge}
                  </div>
                )}
              </div>
            )}

            {c.showWhy[i] && !done && (
              <div className="mt-2.5 rounded-xl border border-warn bg-warn-weak px-3 py-2.5">
                <div className="text-[12px] font-bold text-warn-ink">오늘 진행하지 않았어요 — 사유를 선택해주세요</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {SKIP_WHYS.map((w) => (
                    <Chip key={w} on={c.actWhy[i] === w} onClick={() => c.setWhy(i, w)}>
                      {w}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <Note icon="clock">
        진행 못 한 활동은 <b className="text-ink">사유를 직접 선택</b>해요 — &quot;다음 시간에 이어서&quot;는 코치가 고른 경우에만 다음 차시 계획에 연결돼요.
      </Note>

      <Button variant="ghost" full className="mt-2.5" onClick={c.openInc}>
        ⚠ 특이사항·안전사고 기록
      </Button>

      <div className="sticky bottom-0 -mx-4 mt-3 bg-gradient-to-t from-surface via-surface to-transparent px-4 pb-1 pt-3">
        <Button full variant="primary" onClick={c.requestStep3}>다음 — 코치 한마디</Button>
      </div>
    </>
  );
}

/* ---------- STEP 3 ---------- */
function StepReport() {
  const c = useCoach();
  return (
    <>
      <div className="px-0.5 pt-2 text-[12.5px] font-semibold text-ink3">
        리포트 기본 구조는 자동 조립됐어요 — 확인할 것만 확인하면 끝 🪄
      </div>

      <Card className="mt-2.5">
        <h4 className="text-[13.5px] font-bold text-ink">코치 공통 한마디 (선택)</h4>
        <div className="mt-0.5 text-[11.5px] font-medium text-ink3">
          모든 보호자에게 공통으로 실려요 — 개별 기록(도담 신기록 등)은 해당 보호자에게만 가요
        </div>
        <textarea
          className="mt-2.5 h-24 w-full resize-none rounded-xl border border-line bg-fill p-3 text-[13.5px] font-medium text-ink focus:outline-none focus:border-accent focus:bg-surface"
          placeholder="오늘은 균형 활동에 다들 잘 집중했어요. 다음 시간에는 리듬 스텝을 이어갑니다 👏"
          value={c.coachSay}
          onChange={(e) => c.setCoachSay(e.target.value)}
        />
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Chip on>출석·활동 자동 포함</Chip>
          {c.newRecord > 0 && <Chip on>🏅 도담 신기록 1건 — 도담 보호자에게만</Chip>}
        </div>
      </Card>

      <Card className="mt-2.5">
        <div className="flex items-center justify-between">
          <h4 className="text-[13.5px] font-bold text-ink">사진 3장</h4>
          <button
            onClick={c.checkPhoto}
            className="rounded-lg bg-accent-strong px-3 py-2 text-[12px] font-bold text-white"
          >
            {c.photoChecked ? "확인됨 ✓" : "사진 확인"}
          </button>
        </div>
        <div className="mt-1 text-[12px] font-medium text-ink2">
          {c.photoChecked
            ? `확인됨 ✓ · 원생 3명 포함 · 게시 동의 없는 원생 포함 사진 1장은 반 공유 제외 · 공개 범위: ${PHOTO_SCOPE[c.photoScope]}`
            : "발송 전에 사진 속 원생과 공개 범위를 확인해주세요."}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.entries(PHOTO_SCOPE).map(([key, label]) => (
            <Chip key={key} on={c.photoScope === key} onClick={() => c.setPhotoScope(key)}>
              {label}
            </Chip>
          ))}
        </div>
        <div className="mt-2 text-[11.5px] font-semibold text-warn-ink">
          게시 동의가 없는 원생이 포함된 사진은 반 공유에서 자동 제외돼요.
        </div>
      </Card>

      <Note>
        발송하면 원생별 리포트가 각 보호자 앱으로 가고, <b className="text-ink">반 채팅방엔 공통 완료 카드만</b> 올라가요 👏
      </Note>

      <div className="sticky bottom-0 -mx-4 mt-3 bg-gradient-to-t from-surface via-surface to-transparent px-4 pb-1 pt-3">
        <Button full variant="primary" disabled={c.sending} onClick={c.requestSend}>
          {c.sending ? "발송 중..." : "발송 전 검토"}
        </Button>
      </div>
    </>
  );
}

/* ---------- STEP 4 ---------- */
function StepDone() {
  const c = useCoach();
  const counts = attCounts(c.att);
  const doneActs = c.actsDone.filter(Boolean).length;
  const reports = counts.p + counts.l;
  const guardians = uniqGuardians();
  const stats = [
    { v: `${counts.p}명`, k: "실제 출석", t: "text-accent-ink" },
    { v: `${doneActs}/3`, k: "활동 완료", t: "text-ink" },
    { v: c.newRecord ? "1건" : "0건", k: "신기록 🏅", t: "text-warn-ink" },
  ];
  return (
    <div className="pt-11 text-center">
      <div className="mx-auto grid h-[84px] w-[84px] place-items-center rounded-full bg-accent-weak text-accent-ink">
        <IconCheck size={40} />
      </div>
      <h2 className="mt-4 text-[21px] font-extrabold text-ink">리포트 발송 완료 🎉</h2>
      <div className="mt-1.5 text-[13px] font-medium leading-relaxed text-ink2">
        <b className="text-ink">원생 리포트 {reports}건 생성 · 보호자 {guardians}명 알림 발송</b>
        <br />
        반 채팅방엔 공통 완료 카드만 게시됐어요
        {counts.a > 0 && (
          <>
            <br />결석 원생에겐 리포트 대신 &quot;오늘 수업 요약&quot;이 가요
          </>
        )}
      </div>
      <div className="mt-5 flex gap-2">
        {stats.map((s) => (
          <div key={s.k} className="flex-1 rounded-xl border border-line bg-fill py-3 text-center">
            <div className={cn("text-[16px] font-extrabold", s.t)}>{s.v}</div>
            <div className="mt-0.5 text-[10.5px] font-semibold text-ink3">{s.k}</div>
          </div>
        ))}
      </div>
      <div className="mt-3.5 text-[13px] font-medium text-ink2">
        수업 모드 소요 시간 <b className="text-ink">{c.elapsedText || "—"}</b> ⏱️
      </div>
      <Link href="/coach/chat/class" onClick={c.closeClass} className="mt-4 block">
        <Button full variant="primary">반 채팅방 반응 보기 👏</Button>
      </Link>
      <button
        onClick={() => {
          c.closeClass();
          c.showToast("오늘 수업 완료 ✓ — 고생하셨어요!");
        }}
        className="mt-2 w-full rounded-xl bg-fill px-4 py-3 text-[15px] font-semibold text-ink2"
      >
        홈으로 돌아가기
      </button>
    </div>
  );
}

/* ---------- 공용 note ---------- */
function Note({ children, icon = "bulb" }: { children: React.ReactNode; icon?: "bulb" | "clock" }) {
  return (
    <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-line px-3.5 py-3 text-[12.5px] font-medium leading-relaxed text-ink2">
      <span className="mt-0.5 shrink-0 text-brand">
        {icon === "clock" ? <IconClock size={18} /> : <IconSpark size={18} />}
      </span>
      <span>{children}</span>
    </div>
  );
}
