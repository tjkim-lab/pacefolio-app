/* =========================================================
   PACEFOLIO fixtures — 공용 선택자(ViewModel 씨앗) + 정합성 검증
   앱들은 이 함수로 "같은 하나의 데이터"를 각자 관점으로 본다.
   (원장=할 일 / 코치=명단 / 학부모=청구서 — 데이터는 하나)
   ========================================================= */
import * as db from "./wondergym";
import type * as ID from "@pacefolio/domain";

export * from "./wondergym";

/* ── 코치 관점: 회차 명단 (예정 결석 + 실제 출결을 한 화면에, 별개 트랙) ── */
export function rosterForSession(sessionId: ID.ClassSessionId) {
  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) return null;
  const roster = db.enrollments
    .filter((e) => e.classId === session.classId && e.status === "ACTIVE")
    .map((e) => {
      const p = db.participants.find((x) => x.id === e.participantId)!;
      const notice = db.attendanceNotices.find(
        (n) => n.participantId === p.id && n.classSessionId === sessionId,
      );
      const record = db.attendanceRecords.find(
        (r) => r.participantId === p.id && r.classSessionId === sessionId,
      );
      return {
        participantId: p.id,
        name: p.name,
        expected: notice?.type ?? null, // 보호자 예정(통보)
        actual: record?.status ?? null, // 코치 확정(실제) — 없으면 미확정
      };
    });
  return { session, roster };
}

/* ── 원장 관점: 오늘 할 일 (2축 상태 그대로) ── */
export function ownerTasks(academyId: ID.AcademyId) {
  return db.operationalTasks.filter((t) => t.academyId === academyId);
}

/* ── 학부모 관점: 내 자녀들의 청구서 + 결제 상태 (합산결제 배분 반영) ── */
export function invoicesForGuardian(guardianId: ID.GuardianId) {
  const childIds = db.guardianLinks
    .filter((l) => l.guardianId === guardianId)
    .map((l) => l.participantId);
  return db.invoices
    .filter((inv) => childIds.includes(inv.participantId))
    .map((inv) => {
      const p = db.participants.find((x) => x.id === inv.participantId)!;
      const lines = db.invoiceLines.filter((l) => l.invoiceId === inv.id);
      const paid = db.paymentAllocations
        .filter((a) => a.invoiceId === inv.id)
        .reduce((s, a) => s + a.amount, 0);
      return { invoice: inv, participantName: p.name, lines, paid };
    });
}

/* ── 정합성 자가검증 (리뷰 데이터 일관성 🔴 직격) ──
   invoice.total = Σlines · payment.amount = Σallocations · 출결통보/기록이 실존 세션·원생 참조.
   깨지면 문자열 배열 반환(비어야 정상). dev에서 호출해 확인. */
export function checkConsistency(): string[] {
  const errs: string[] = [];

  for (const inv of db.invoices) {
    const sum = db.invoiceLines
      .filter((l) => l.invoiceId === inv.id)
      .reduce((s, l) => s + l.amount, 0);
    if (sum !== inv.total) errs.push(`Invoice ${inv.id}: total ${inv.total} ≠ Σlines ${sum}`);
  }

  for (const pay of db.payments) {
    const sum = db.paymentAllocations
      .filter((a) => a.paymentId === pay.id)
      .reduce((s, a) => s + a.amount, 0);
    if (sum !== pay.amount) errs.push(`Payment ${pay.id}: amount ${pay.amount} ≠ Σalloc ${sum}`);
  }

  const sIds = new Set(db.sessions.map((s) => s.id));
  const pIds = new Set(db.participants.map((p) => p.id));
  for (const n of db.attendanceNotices) {
    if (!sIds.has(n.classSessionId)) errs.push(`Notice ${n.id}: 없는 세션 ${n.classSessionId}`);
    if (!pIds.has(n.participantId)) errs.push(`Notice ${n.id}: 없는 원생 ${n.participantId}`);
  }
  for (const r of db.attendanceRecords) {
    if (!sIds.has(r.classSessionId)) errs.push(`Record ${r.id}: 없는 세션 ${r.classSessionId}`);
    if (!pIds.has(r.participantId)) errs.push(`Record ${r.id}: 없는 원생 ${r.participantId}`);
  }

  // 배분은 실존 청구서를 가리켜야
  const iIds = new Set(db.invoices.map((i) => i.id));
  for (const a of db.paymentAllocations) {
    if (!iIds.has(a.invoiceId)) errs.push(`Allocation ${a.id}: 없는 청구서 ${a.invoiceId}`);
  }

  return errs;
}
