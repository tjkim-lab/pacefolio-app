/* =========================================================
   PACEFOLIO 공유 도메인 — 시간 비교 공통 모듈 (R4 P0-9)
   ---------------------------------------------------------
   ⚠️ ISO 문자열 직접 비교 금지. offset 표기가 섞이면 문자열 순서 ≠ 시간 순서:
     "2026-07-16T12:00:00+09:00" (= 03:00Z) 가 문자열로는
     "2026-07-16T04:00:00Z"      (= 04:00Z) 보다 큼 → 만료 후 접근 허용 사고.
   모든 시각 판정은 epoch ms 정규화 후 비교한다.

   fail-closed 원칙: 파싱 실패 시 각 함수는 "거부" 방향으로 수렴.
   - 자격증명(초대·세션·동의·MFA): 파싱 실패 = 만료 취급 → 접근 거부
   - 활성 구간(코치 배정): 파싱 실패 = 비활성 → 접근 거부
   - 멱등 dedup 레코드만 방향이 반대: 파싱 실패 = 아직 유효 → 중복 차단 유지
     (여기서 "거부"해야 할 위험 = 이중 처리이므로)
   ========================================================= */

/** ISO(offset 포함 가능) → epoch ms. 파싱 불가 시 null. */
export function toEpochMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/** 자격증명(초대코드·검증세션·Support View·동의) 만료 판정.
   파싱 실패 = 만료(true) → fail-closed 로 접근 거부. */
export function credentialExpired(
  expiresAtISO: string | null | undefined,
  nowISO: string,
): boolean {
  const exp = toEpochMs(expiresAtISO);
  const now = toEpochMs(nowISO);
  if (exp === null || now === null) return true; // fail-closed
  return exp <= now;
}

/** 활성 구간 [startedAt, endedAt) 판정 — 코치 배정 등.
   파싱 실패 = 비활성(false) → fail-closed 로 접근 거부. */
export function withinActiveWindow(
  startedAtISO: string,
  endedAtISO: string | null | undefined,
  nowISO: string,
): boolean {
  const start = toEpochMs(startedAtISO);
  const now = toEpochMs(nowISO);
  if (start === null || now === null) return false; // fail-closed
  if (now < start) return false;                    // 시작 전
  if (endedAtISO != null) {
    const end = toEpochMs(endedAtISO);
    if (end === null) return false;                 // fail-closed
    if (end <= now) return false;                   // 종료 후
  }
  return true;
}

/** 경과 시간(ms). 파싱 실패·미래 기록(음수) = null — 호출부는 null 을 거부로 처리.
   MFA freshness 등에 사용. */
export function ageMsOrNull(
  fromISO: string | null | undefined,
  nowISO: string,
): number | null {
  const from = toEpochMs(fromISO);
  const now = toEpochMs(nowISO);
  if (from === null || now === null) return null;
  const age = now - from;
  return age < 0 ? null : age; // 미래 시각 기록 = 무효
}

/** 멱등 dedup 레코드 만료 — 방향 반대: 파싱 실패 = 미만료(false).
   만료로 오판하면 PROCEED(재처리) → 이중 처리 위험이므로 차단 유지가 안전. */
export function dedupRecordExpired(expiresAtISO: string, nowISO: string): boolean {
  const exp = toEpochMs(expiresAtISO);
  const now = toEpochMs(nowISO);
  if (exp === null || now === null) return false; // fail-closed = 계속 차단
  return exp <= now;
}
