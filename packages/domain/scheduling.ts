/* =========================================================
   수업 일정 도메인 — 기본선 1단계(#22, 경쟁 비교 반영)
   ---------------------------------------------------------
   수업 유형 3종(마이클럽 벤치마크):
   - FIXED_WEEKLY: 매주 같은 요일·같은 시간 (월·수 14:30)
   - VARIABLE_BY_WEEKDAY: 요일마다 다른 시간 (월 13:00 · 수 14:00)
   - PARTICIPANT_SPECIFIC: 원생별 개별 시간 (개인 레슨·소그룹)
   순수 함수 — 반복 일정 전개(회차 인스턴스 생성)와 검증.
   휴강은 세션 상태(CANCELED)로 다루고 회차 차감·보강은 청구 계산이 판단.
   ========================================================= */
import type { ClassScheduleType } from "./enums";

export interface WeeklySlot {
  weekday: number;        // 0=일 … 6=토
  startTime: string;      // "14:30" (HH:MM 24h)
  endTime: string;
  participantId?: string; // PARTICIPANT_SPECIFIC 전용
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateScheduleSlots(
  type: ClassScheduleType,
  slots: readonly WeeklySlot[],
): { ok: true } | { ok: false; reason: string } {
  if (slots.length === 0) return { ok: false, reason: "슬롯이 최소 1개 필요" };
  for (const s of slots) {
    if (!Number.isInteger(s.weekday) || s.weekday < 0 || s.weekday > 6) {
      return { ok: false, reason: `요일 범위 밖: ${s.weekday}` };
    }
    if (!TIME_RE.test(s.startTime) || !TIME_RE.test(s.endTime)) {
      return { ok: false, reason: "시간 형식은 HH:MM" };
    }
    if (s.startTime >= s.endTime) return { ok: false, reason: "종료가 시작보다 빨라요" };
  }
  if (type === "FIXED_WEEKLY") {
    const t0 = `${slots[0].startTime}-${slots[0].endTime}`;
    if (!slots.every((s) => `${s.startTime}-${s.endTime}` === t0)) {
      return { ok: false, reason: "FIXED_WEEKLY 는 모든 요일이 같은 시간이어야 해요 — 요일별 시간이 다르면 VARIABLE_BY_WEEKDAY" };
    }
    if (slots.some((s) => s.participantId)) {
      return { ok: false, reason: "단체반 슬롯에 원생 지정 불가 — 원생별 시간은 PARTICIPANT_SPECIFIC" };
    }
  }
  if (type === "VARIABLE_BY_WEEKDAY") {
    const days = slots.map((s) => s.weekday);
    if (new Set(days).size !== days.length) {
      return { ok: false, reason: "VARIABLE_BY_WEEKDAY 는 요일당 슬롯 1개" };
    }
    if (slots.some((s) => s.participantId)) {
      return { ok: false, reason: "단체반 슬롯에 원생 지정 불가" };
    }
  }
  if (type === "PARTICIPANT_SPECIFIC") {
    if (slots.some((s) => !s.participantId)) {
      return { ok: false, reason: "PARTICIPANT_SPECIFIC 슬롯은 원생 지정 필수" };
    }
  }
  return { ok: true };
}

export interface GeneratedSession {
  date: string;           // YYYY-MM-DD
  weekday: number;
  startTime: string;
  endTime: string;
  participantId?: string;
}

/** 반복 일정 전개 — [rangeStart, rangeEnd] 구간의 세션 인스턴스 목록(날짜 오름차순).
    시간대 함정 방지: 날짜는 UTC 정오로 파싱해 요일 계산(로컬 오프셋 무관). */
export function expandWeeklySchedule(input: {
  slots: readonly WeeklySlot[];
  rangeStart: string;
  rangeEnd: string;
}): GeneratedSession[] {
  const { slots, rangeStart, rangeEnd } = input;
  if (!DATE_RE.test(rangeStart) || !DATE_RE.test(rangeEnd) || rangeStart > rangeEnd) return [];
  const out: GeneratedSession[] = [];
  const start = new Date(`${rangeStart}T12:00:00Z`);
  const end = new Date(`${rangeEnd}T12:00:00Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const weekday = d.getUTCDay();
    const date = d.toISOString().slice(0, 10);
    for (const s of slots) {
      if (s.weekday !== weekday) continue;
      out.push({
        date, weekday, startTime: s.startTime, endTime: s.endTime,
        ...(s.participantId ? { participantId: s.participantId } : {}),
      });
    }
  }
  // 같은 날짜 안에서 시작 시간순 정렬 보장
  out.sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)));
  return out;
}
