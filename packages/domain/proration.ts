/* =========================================================
   일할·회차 계산 — payment-engine 이식 (PC draft 정본화 #38)
   ---------------------------------------------------------
   원본: 저장소 루트 `payment-engine/`(session-counter.ts·engine.ts, 테스트 40/40).
   헌법 "결제계산 = payment-engine 재사용·정합" — 미러 CI 범위(pacefolio-app) 밖이라
   함수를 그대로 이식하고 원본 테스트 케이스를 포팅해 정합을 고정한다.
   순수 함수·DB 없음. 날짜 'YYYY-MM-DD', 요일 0(일)~6(토), UTC 고정(타임존 버그 방지).
   ========================================================= */

function parse(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function toISO(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}
/** 원 단위 반올림(원본 engine.ts won 과 동일 — 10원 반올림은 화면 정책, 정본은 원 단위) */
function won(n: number): number {
  return Math.round(n);
}

/** [startISO, endISO] 범위에서 해당 요일이면서 휴원일이 아닌 날의 수. */
export function countSessions(
  startISO: string, endISO: string, weekdays: number[], holidays: string[] = [],
): number {
  const start = parse(startISO).getTime();
  const end = parse(endISO).getTime();
  const wd = new Set(weekdays);
  const hol = new Set(holidays);
  let count = 0;
  for (let t = start; t <= end; t += 86400000) {
    const dt = new Date(t);
    if (wd.has(dt.getUTCDay()) && !hol.has(toISO(dt))) count++;
  }
  return count;
}

export interface ProrationTerm {
  startDate: string;
  endDate: string;
}

/** 등록 회차 = 학기 총 회차 + (입회일부터의) 남은 회차. 중간등록 일할의 분모/분자. */
export function enrollmentSessions(
  term: ProrationTerm, weekdays: number[], joinDate: string, holidays: string[] = [],
): { total: number; remaining: number } {
  const total = countSessions(term.startDate, term.endDate, weekdays, holidays);
  const effectiveStart = joinDate > term.startDate ? joinDate : term.startDate;
  const remaining = effectiveStart > term.endDate
    ? 0
    : countSessions(effectiveStart, term.endDate, weekdays, holidays);
  return { total, remaining };
}

/** 헌법: 일할 = 남은회차/전체회차 × 요금. 전액 조건(비활성·잔여≥전체) 시 원 요금. */
export function prorate(fee: number, remaining: number, total: number, enabled = true): number {
  if (!enabled || total <= 0 || remaining >= total) return won(fee);
  return won((fee * remaining) / total);
}
