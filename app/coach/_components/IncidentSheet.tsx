"use client";

/* 특이사항·안전사고 기록 시트 — 필수(*) 채워야 저장. 원장 즉시 공유. */

import { useState } from "react";
import { useCoach } from "../_state";
import { KIDS, INC_TYPE, INC_SEV, INC_CONT, INC_FOLLOW, INC_NOTIFY } from "../_data";
import { Sheet, Chip, FieldLabel } from "./Bits";
import { Button } from "@/components/ui";

const inputCls =
  "w-full rounded-xl border border-line bg-fill px-3 py-2.5 text-[12.5px] font-semibold text-ink focus:outline-none focus:border-accent focus:bg-surface";

export default function IncidentSheet() {
  const { incOpen, closeInc, saveInc, showToast } = useCoach();
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
    const summary =
      "⚠ 안전기록 [" + sev + "·" + type + "] " + kid + (place.trim() ? " @" + place.trim() : "") +
      " — " + memo.trim() + (action.trim() ? " / 조치: " + action.trim() : "") +
      " / 수업 " + cont + " / 후속 " + follow + " / 보호자 " + notify + " · 발생 오후 3:05";
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
        {KIDS.map((k) => (
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
        발생 시각 <b className="text-ink">오후 3:05</b> · 자동 기록
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <Button variant="ghost" onClick={closeInc}>취소</Button>
        <Button variant="primary" onClick={submit}>기록하고 원장에게 알리기</Button>
      </div>
    </Sheet>
  );
}
