"use client";

/* 리포트 발송 전 검토 시트 */

import { useCoach, attCounts, uniqGuardians } from "../_state";
import { PHOTO_SCOPE, CLASS_ACTS } from "../_data";
import { Sheet } from "./Bits";
import { Button } from "@/components/ui";

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2.5 border-b border-line2 py-1.5 text-[12.5px] font-medium text-ink2 last:border-0">
      <span>{k}</span>
      <b className="text-ink text-right">{v}</b>
    </div>
  );
}
function Head({ children }: { children: string }) {
  return <div className="mt-3 mb-0.5 px-0.5 text-[11px] font-extrabold text-ink3">{children}</div>;
}

export default function ReviewSheet() {
  const { reviewOpen, closeReview, confirmSend, att, actsDone, actWhy, photoScope, coachSay } =
    useCoach();
  const c = attCounts(att);
  const doneActs = actsDone.filter(Boolean).length;
  const partial = actsDone
    .map((d, i) => (!d ? i : -1))
    .filter((i) => i >= 0);
  const whys = partial.map((i) => actWhy[i] || "사유 미선택").join(", ");
  const reports = c.p + c.l + c.e;
  const guardians = uniqGuardians();
  const scope = PHOTO_SCOPE[photoScope];

  return (
    <Sheet
      open={reviewOpen}
      onClose={closeReview}
      z="z-[400]"
      title="수업 리포트를 발송할까요?"
      sub="발송하면 각 보호자 앱에 공식 기록으로 남아요."
    >
      <Head>출결 (실제)</Head>
      <Row k="출석 · 지각 · 결석 · 조퇴" v={`${c.p}명 · ${c.l}명 · ${c.a}명 · ${c.e}명`} />
      <Head>수업 내용</Head>
      <Row k="완료 활동" v={`${doneActs}개`} />
      {partial.length > 0 && <Row k="미진행 활동" v={`${partial.length}개 (${whys})`} />}
      <Row k="활동 영역 누적" v={doneActs > 0 ? CLASS_ACTS.filter((_, i) => actsDone[i]).map((a) => a.area).join(" · ") : "없음"} />
      <Row k="사진" v={`3장 · ${scope}`} />
      <Row k="코치 공통 한마디" v={coachSay.trim() ? "입력됨" : "미입력(선택)"} />
      <Head>발송</Head>
      <Row k="원생 리포트" v={`${reports}건`} />
      {c.a > 0 && <Row k="결석 원생 수업 요약" v={`${c.a}건`} />}
      <Row k="알림 수신 보호자" v={`${guardians}명 (관계 기반 · 도담·서준 형제 합산)`} />
      <Row k="반 전체방" v="공통 완료 카드만 게시 — 개별 이름·기록 없음" />

      <div className="grid grid-cols-2 gap-2 mt-3">
        <Button variant="ghost" onClick={closeReview}>취소</Button>
        <Button variant="primary" onClick={confirmSend}>확인하고 발송</Button>
      </div>
    </Sheet>
  );
}
