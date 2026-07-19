"use client";

/* 수업 모드 (풀스크린) — ① 출석 → ② 활동·기록 → ③ 코치 한마디 → 발송 완료 */

import Link from "next/link";
import { useState } from "react";
import { useCoach, attCounts, uniqGuardians } from "../_state";
import { useCoachLive, CoachLiveBadge } from "../_live";
import {
  KIDS, CLASS_ACTS, SKIP_WHYS, PHOTO_SCOPE, ATT_TXT, GROWTH_AREAS,
  TEMPLATE_MAX, TEMPLATE_VARS, type AttStatus, type Kid,
} from "../_data";

/* #25: 실연결 시 명단 = 서버 정본(enrollments) — fixture 는 데모 폴백 */
function useActiveKids(): Kid[] {
  const live = useCoachLive();
  if (live.state !== "READY") return KIDS;
  return live.roster.map((r) => ({ n: r.short, a: parseInt(r.ageLabel, 10) || 0 }));
}
import { Button, Card, Tag, cn } from "@/components/ui";
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
  e: "border-ink3 bg-fill",
};
const avatarTone: Record<AttStatus, string> = {
  "": "bg-fill text-ink2",
  p: "bg-accent text-white",
  l: "bg-warn text-white",
  a: "bg-danger text-white",
  e: "bg-ink3 text-white",
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
  const kids = useActiveKids();
  const counts = attCounts(c.att, kids);

  return (
    <>
      <div className="mt-1 px-0.5 text-[11px] font-bold text-ink3">
        실제 출결 — 학부모 접수는 &apos;예정&apos; 정보, 최종 확정은 코치가 해요
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {[
          { v: counts.p, k: "출석 ○", t: "text-accent-ink" },
          { v: counts.l, k: "지각 △", t: "text-warn-ink" },
          { v: counts.a, k: "결석 ✕", t: "text-danger-ink" },
          { v: counts.e, k: "조퇴 ◐", t: "text-ink2" },
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
              <div className={cn("mt-0.5 text-[10px] font-bold", st === "p" ? "text-accent-ink" : st === "l" ? "text-warn-ink" : st === "a" ? "text-danger-ink" : st === "e" ? "text-ink2" : "text-ink3")}>
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
        민준이는 학부모가 접수한 <b className="text-ink">결석 예정(아파요)</b> — 아이가 실제로 오면 탭해서 바꿀 수 있어요(사유·이력이 남아요). 아이를 탭하면 출석○ → 결석✕ → 지각△ → 조퇴◐ 순환 — 한 번의 탭으로 바꿔요. 결석·지각 사유는 선택 입력이에요.
      </Note>

      <div className="sticky bottom-0 -mx-4 mt-3 bg-gradient-to-t from-surface via-surface to-transparent px-4 pb-1 pt-3">
        <SaveAttButton counts={counts} />
      </div>
    </>
  );
}

function SaveAttButton({ counts }: { counts: { p: number; l: number; a: number; e: number; none: number } }) {
  const c = useCoach();
  const live = useCoachLive();
  const [busy, setBusy] = useState(false);
  /* #25: READY = 서버 recordAttendance 성공 후에만 저장 상태로 전진 —
     실패면 그대로 멈추고 서버 사유를 보여준다(저장된 척 금지) */
  const onSave = () => {
    if (live.state !== "READY") { c.saveAtt(); return; }
    if (busy) return;
    setBusy(true);
    void live.saveAttendance(c.att).then((r) => {
      setBusy(false);
      if (!r.ok) { c.showToast(r.message); return; }
      c.saveAtt();
      c.showToast(r.message);
    });
  };
  if (c.reportSent)
    return <Button full disabled variant="primary" className="bg-accent-ink">최종 확정됨 · 리포트에 반영</Button>;
  if (c.attSaved)
    return <Button full disabled variant="primary" className="bg-accent-ink">임시 저장됨 ✓ · 수업 종료 전까지 수정할 수 있어요</Button>;
  if (counts.none === 0)
    return (
      <Button full variant="primary" disabled={busy} onClick={onSave}>
        {busy ? "서버 저장 중..." : `출석 임시 저장 (${counts.p}·${counts.l}·${counts.a}·${counts.e})`}
      </Button>
    );
  /* C2 완료 검증: 미지정 원생이 있으면 저장 불가 경고 */
  return <Button full disabled variant="primary">모두 체크하면 저장할 수 있어요 ({counts.none}명 남음)</Button>;
}

/* ---------- STEP 2 (C2: 영역+활동명+완료만 — 분·초·측정값 제거) ---------- */
function StepActivities() {
  const c = useCoach();

  return (
    <>
      <div className="px-0.5 pt-2 text-[12.5px] font-semibold text-ink3">
        오늘의 프로그램 — 진행한 활동에 완료만 눌러주세요 (세부 측정은 프로그램 정책 확정 후)
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
                <div className="text-[13.5px] font-bold text-ink">
                  {a.area} — {a.n}
                </div>
                <div className="text-[11px] font-medium text-ink3">완료하면 원생별 활동 영역 기록에 누적돼요</div>
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

      {/* C2: 한 줄 액션 — 버튼 문구 짧게(줄바꿈 금지) · 안전사고는 원장 즉시 알림 */}
      <div className="mt-2.5 flex gap-2">
        <Button variant="ghost" full className="whitespace-nowrap text-[13px]" onClick={c.openInc}>
          ⚠ 기록
        </Button>
        <Button
          variant="primary"
          full
          className="whitespace-nowrap text-[13px]"
          onClick={() => {
            c.openInc();
            c.showToast("저장하면 원장에게 즉시 알림 — 원장 홈 확인 필요 영역에 떠요");
          }}
        >
          기록 후 원장 알림
        </Button>
      </div>

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
          모든 보호자에게 공통으로 실려요 — 개별 학생 피드백은 내 정보 › 담당 수업에서 따로 관리해요
        </div>
        {/* C3: 템플릿 최대 5 — 선택 후 수업에 맞게 수정, 발송 전 검토가 미리보기 */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {c.templates.map((t, i) => (
            <Chip
              key={i}
              on={c.coachSay === t}
              onClick={() => {
                c.setCoachSay(t);
                c.showToast("템플릿 적용 — 이 수업에 맞게 수정해도 템플릿 원본은 안 바뀌어요");
              }}
            >
              템플릿 {i + 1}
            </Chip>
          ))}
          <Chip
            on={false}
            onClick={() => {
              const r = c.saveTemplate(c.coachSay);
              c.showToast(
                r === "ok" ? `현재 문구를 템플릿으로 저장했어요 (${c.templates.length + 1}/${TEMPLATE_MAX})`
                : r === "full" ? `템플릿은 최대 ${TEMPLATE_MAX}개 — 내 정보 › 코치 설정에서 정리해주세요`
                : r === "dup" ? "이미 같은 템플릿이 있어요"
                : "저장할 문구를 먼저 적어주세요",
              );
            }}
          >
            + 현재 문구 저장
          </Chip>
        </div>
        {c.coachSay && c.templates.includes(c.coachSay) && (
          <div className="mt-1.5 text-[11px] font-medium text-ink3">“{c.coachSay}”</div>
        )}
        <textarea
          className="mt-2.5 h-24 w-full resize-none rounded-xl border border-line bg-fill p-3 text-[13.5px] font-medium text-ink focus:outline-none focus:border-accent focus:bg-surface"
          placeholder="오늘은 균형 활동에 다들 잘 집중했어요. 다음 시간에는 리듬 스텝을 이어갑니다 👏"
          value={c.coachSay}
          onChange={(e) => c.setCoachSay(e.target.value)}
        />
        <div className="mt-1.5 text-[10.5px] font-medium text-ink3">
          치환 변수(설계): {TEMPLATE_VARS} — 발송 시 원생·수업별 자동 치환 (API_REQUIRED)
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Chip on>출석·활동 자동 포함</Chip>
          <Chip on>완료 활동 → 영역 기록 누적</Chip>
        </div>
      </Card>

      <PhotoConsentCard c={c} />

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
  const doneAreas = CLASS_ACTS.filter((_, i) => c.actsDone[i]).map((a) => a.area);
  const reports = counts.p + counts.l + counts.e;
  const guardians = uniqGuardians();
  const stats = [
    { v: `${counts.p}명`, k: "실제 출석", t: "text-accent-ink" },
    { v: `${doneActs}/3`, k: "활동 완료", t: "text-ink" },
    { v: `${doneAreas.length}개`, k: "영역 누적 🌱", t: "text-warn-ink" },
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
      {doneAreas.length > 0 && (
        <div className="mt-3.5 rounded-xl border border-line bg-fill px-3 py-2.5 text-left text-[12px] font-medium text-ink2">
          <b className="text-ink">오늘 누적된 활동 영역</b> — 출석 원생 {reports}명의 활동 이력에 기록
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {GROWTH_AREAS.map((ar) => (
              <Tag key={ar} tone={doneAreas.includes(ar) ? "accent" : "muted"}>
                {ar} {doneAreas.includes(ar) ? "+1" : "—"}
              </Tag>
            ))}
          </div>
          <div className="mt-1.5 text-[10.5px] text-ink3">
            능력 진단·점수가 아니라 &quot;어떤 활동 경험이 쌓였는지&quot; 기록이에요 (저장은 API_REQUIRED)
          </div>
        </div>
      )}
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

/* #19 C3: 사진 동의 게이트 — READY 시 서버 finalize 로 차단 명단을 실 판정.
   "동의 없는 원생 자동 제외"가 안내 문구가 아니라 서버 응답이 된다. */
import { useState as usePhotoState } from "react";

function PhotoConsentCard({ c }: { c: ReturnType<typeof useCoach> }) {
  const live = useCoachLive();
  const [checking, setChecking] = usePhotoState(false);
  const [result, setResult] = usePhotoState<{ ok: boolean; message: string; blockedNames: string[] } | null>(null);

  const onCheck = () => {
    if (live.state !== "READY") { c.checkPhoto(); return; } // 데모 경로 유지
    if (checking) return;
    setChecking(true);
    void live.verifyPhotoConsent(c.photoScope === "class" ? "class" : "individual").then((r) => {
      setChecking(false);
      setResult(r);
      c.markPhotoChecked(); // 서버 판정 완료(통과·차단 모두 확인 수행) — 발송 가드 해제
    });
  };

  const liveMode = live.state === "READY";
  const checked = liveMode ? result !== null : c.photoChecked;
  return (
    <Card className="mt-2.5">
      <div className="flex items-center justify-between">
        <h4 className="text-[13.5px] font-bold text-ink">사진 3장</h4>
        <button
          onClick={onCheck}
          className="rounded-lg bg-accent-strong px-3 py-2 text-[12px] font-bold text-white"
        >
          {checking ? "서버 확인 중..." : checked ? "확인됨 ✓" : "사진 확인"}
        </button>
      </div>
      <div className="mt-1 text-[12px] font-medium text-ink2">
        {liveMode
          ? result
            ? result.ok
              ? `서버 동의 게이트 통과 ✓ · 명단 전원 게시 동의 확인 · 공개 범위: ${PHOTO_SCOPE[c.photoScope]}`
              : `${result.message}${result.blockedNames.length ? ` — 제외 대상: ${result.blockedNames.join(", ")}` : ""}`
            : "발송 전에 사진 속 원생과 공개 범위를 확인해주세요 — 판정은 서버 동의 게이트가 해요."
          : c.photoChecked
            ? `확인됨 ✓ · 원생 3명 포함 · 게시 동의 없는 원생 포함 사진 1장은 반 공유 제외 · 공개 범위: ${PHOTO_SCOPE[c.photoScope]} (데모)`
            : "발송 전에 사진 속 원생과 공개 범위를 확인해주세요."}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {Object.entries(PHOTO_SCOPE).map(([key, label]) => (
          <Chip
            key={key}
            on={c.photoScope === key}
            onClick={() => { c.setPhotoScope(key); if (liveMode) setResult(null); }}
          >
            {label}
          </Chip>
        ))}
      </div>
      <div className="mt-2 text-[11.5px] font-semibold text-warn-ink">
        게시 동의가 없는 원생이 포함된 사진은 반 공유에서 자동 제외돼요.
      </div>
    </Card>
  );
}
