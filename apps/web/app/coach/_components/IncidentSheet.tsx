"use client";

/* 특이사항·안전사고 기록 시트 — 필수(*) 채워야 저장. 원장 즉시 공유. */

import { useState } from "react";
import { useCoach } from "../_state";
import { useCoachLive } from "../_live";
import { KIDS, INC_TYPE, INC_SEV, INC_CONT, INC_FOLLOW, INC_NOTIFY } from "../_data";
import { Sheet, Chip, FieldLabel } from "./Bits";
import { Button } from "@/components/ui";

/* #32: 화면 한글 라벨 → 서버 enum (계약은 enum 만) */
const TYPE_MAP: Record<string, string> = {
  "가벼운 부상": "MINOR_INJURY", "컨디션 악화": "CONDITION", "수업 중단": "CLASS_HALT",
  "안전사고": "SAFETY_ACCIDENT", "기타": "OTHER",
};
const SEV_MAP: Record<string, string> = { "경미": "MINOR", "주의": "CAUTION", "중대": "SEVERE" };
const NOTIFY_MAP: Record<string, string> = {
  "연락 완료": "CONTACTED", "연락 필요": "NEEDED", "연락 불필요": "NOT_NEEDED",
};

const inputCls =
  "w-full rounded-xl border border-line bg-fill px-3 py-2.5 text-[12.5px] font-semibold text-ink focus:outline-none focus:border-accent focus:bg-surface";

export default function IncidentSheet() {
  const { incOpen, closeInc, saveInc, showToast } = useCoach();
  const live = useCoachLive();
  const [busy, setBusy] = useState(false);
  const [kid, setKid] = useState("");
  const [type, setType] = useState(INC_TYPE[0]);
  const [sev, setSev] = useState(INC_SEV[0]);
  const [memo, setMemo] = useState("");
  const [place, setPlace] = useState("");
  const [action, setAction] = useState("");
  const [cont, setCont] = useState(INC_CONT[0]);
  const [follow, setFollow] = useState(INC_FOLLOW[0]);
  const [notify, setNotify] = useState(INC_NOTIFY[0]);

  const submit = () => {
    if (!kid || !memo.trim()) {
      showToast("대상·유형·심각도·상황·수업 지속·후속 조치·보호자 연락은 필수예요");
      return;
    }
    /* #32: READY = 서버 정본 저장 — 발생 시각은 서버 기록, 원장 알림·감사 동반 */
    if (live.state === "READY") {
      const target = live.roster.find((r) => r.short === kid || r.name === kid);
      if (!target) { showToast("서버 명단에서 원생을 찾지 못했어요"); return; }
      if (busy) return;
      setBusy(true);
      void (async () => {
        const r = await live.reportIncident({
          participantId: target.participantId,
          type: TYPE_MAP[type] ?? "OTHER", severity: SEV_MAP[sev] ?? "MINOR",
          situation: memo.trim(),
          location: place.trim() || undefined, firstAid: action.trim() || undefined,
          classContinued: cont === "계속 진행", followUpNeeded: follow === "필요",
          guardianContact: NOTIFY_MAP[notify] ?? "NEEDED",
        });
        setBusy(false);
        showToast(r.message);
        if (!r.ok) return;
        const t = r.occurredAt
          ? new Date(r.occurredAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
          : "";
        const summary =
          "⚠ 안전기록(서버) [" + sev + "·" + type + "] " + kid + (place.trim() ? " @" + place.trim() : "") +
          " — " + memo.trim() + " / 발생 " + t;
        saveInc(summary, kid, sev); // 채팅 에코 — 정본은 서버 incidents
        setMemo(""); setPlace(""); setAction("");
      })();
      return;
    }
    const summary =
      "⚠ 안전기록 [" + sev + "·" + type + "] " + kid + (place.trim() ? " @" + place.trim() : "") +
      " — " + memo.trim() + (action.trim() ? " / 조치: " + action.trim() : "") +
      " / 수업 " + cont + " / 후속 " + follow + " / 보호자 " + notify + " · 발생 오후 3:05 (데모)";
    saveInc(summary, kid, sev);
    setMemo(""); setPlace(""); setAction("");
  };

  return (
    <Sheet
      open={incOpen}
      onClose={closeInc}
      z="z-[400]"
      title="특이사항·안전사고 기록 ⚠"
      sub="필수 항목(*)을 채워야 기록돼요 — 원장에게 즉시 공유되고 대상 원생 안전 기록에 남아요."
    >
      <FieldLabel>대상 원생 *</FieldLabel>
      <select className={inputCls} value={kid} onChange={(e) => setKid(e.target.value)}>
        <option value="">원생 선택</option>
        {live.state === "READY"
          ? live.roster.map((k) => (
              <option key={k.participantId} value={k.short}>{k.name} ({k.ageLabel})</option>
            ))
          : KIDS.map((k) => (
              <option key={k.n} value={k.n}>{k.n} ({k.a}세)</option>
            ))}
      </select>

      <FieldLabel>유형 *</FieldLabel>
      <div className="flex flex-wrap gap-1.5">
        {INC_TYPE.map((t) => <Chip key={t} on={type === t} onClick={() => setType(t)}>{t}</Chip>)}
      </div>

      <FieldLabel>심각도 *</FieldLabel>
      <div className="flex flex-wrap gap-1.5">
        {INC_SEV.map((t) => <Chip key={t} on={sev === t} onClick={() => setSev(t)}>{t}</Chip>)}
      </div>

      <FieldLabel>상황 *</FieldLabel>
      <textarea
        className={inputCls + " h-14 resize-none"}
        placeholder="언제·어디서·어떻게 일어났는지"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
      />

      <FieldLabel>발생 장소</FieldLabel>
      <input className={inputCls} placeholder="예: 본관 2층 매트존 (선택)" value={place} onChange={(e) => setPlace(e.target.value)} />

      <FieldLabel>현장 조치</FieldLabel>
      <textarea
        className={inputCls + " h-11 resize-none"}
        placeholder="응급 처치·휴식 등 취한 조치 (선택)"
        value={action}
        onChange={(e) => setAction(e.target.value)}
      />

      <FieldLabel>수업 지속 여부 *</FieldLabel>
      <div className="flex flex-wrap gap-1.5">
        {INC_CONT.map((t) => <Chip key={t} on={cont === t} onClick={() => setCont(t)}>{t}</Chip>)}
      </div>

      <FieldLabel>후속 조치 필요 *</FieldLabel>
      <div className="flex flex-wrap gap-1.5">
        {INC_FOLLOW.map((t) => <Chip key={t} on={follow === t} onClick={() => setFollow(t)}>{t}</Chip>)}
      </div>

      <FieldLabel>보호자 연락 *</FieldLabel>
      <div className="flex flex-wrap gap-1.5">
        {INC_NOTIFY.map((t) => <Chip key={t} on={notify === t} onClick={() => setNotify(t)}>{t}</Chip>)}
      </div>

      <div className="mt-2.5 text-[12.5px] text-ink3 font-medium">
        {live.state === "READY"
          ? <>발생 시각 <b className="text-ink">저장 시 서버가 자동 기록</b> — 감사·원장 알림 동반</>
          : <>발생 시각 <b className="text-ink">오후 3:05</b> · 자동 기록 (데모)</>}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <Button variant="ghost" onClick={closeInc}>취소</Button>
        <Button variant="primary" onClick={submit} disabled={busy}>
          {busy ? "서버 기록 중..." : "기록하고 원장에게 알리기"}
        </Button>
      </div>
    </Sheet>
  );
}
