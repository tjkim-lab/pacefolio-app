/* 가져오기 스테이징 서비스 — PS3 (docs/20 §4 · 지시서 §8)
   불변식: 미리보기(커밋) 전 운영 데이터 무변경 · 원본 행 영구 보존 ·
   자동 병합 금지(중복은 후보 제안만) · 같은 파일 중복 커밋 방지(fileHash) ·
   커밋 tx · 부분 성공 정책 = VALID+CREATE 행만 생성, INVALID/SKIP 은 남김 ·
   되돌리기 = batch 단위 archive(삭제 아님 — 과거 기록 보존). */
import { and, asc, eq, inArray } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import {
  parseCsv, autoMapColumns, normalizeRow, validateActivityRow, findDuplicateCandidates,
  type ColumnMapping, type NormalizedActivityRow,
} from "@pacefolio/domain";
import { newId, sha256Hex } from "../crypto";
import { recordAudit } from "../audit";
import type { Db } from "../sessions/service";

const isOwner = (roles: readonly string[]) => roles.includes("OWNER");
const FORBIDDEN = { kind: "FORBIDDEN" as const, reason: "가져오기는 원장만(PS3)" };

interface Actor { actorUserId: string; actorRoles: readonly string[]; academyId: string }

/* 학원의 현재 지식(영역 이름·활동 이름) — 검증·중복 후보의 기준 */
async function academyKnowledge(db: Db, academyId: string) {
  const domains = await db.select().from(s.growthDomains)
    .where(and(eq(s.growthDomains.academyId, academyId), eq(s.growthDomains.active, true)));
  const acts = await db.select().from(s.activities)
    .where(eq(s.activities.academyId, academyId));
  const revIds = acts.map((a) => a.currentRevisionId).filter((x): x is string => !!x);
  const revs = revIds.length
    ? await db.select().from(s.activityRevisions).where(inArray(s.activityRevisions.id, revIds))
    : [];
  const revName = new Map(revs.map((r) => [r.id, r.name]));
  return {
    domainNames: new Set(domains.map((d) => d.name)),
    domainByLower: new Map(domains.map((d) => [d.name.toLowerCase(), d.id])),
    existingActivities: acts
      .filter((a) => a.currentRevisionId && revName.has(a.currentRevisionId))
      .map((a) => ({ id: a.id, name: revName.get(a.currentRevisionId!)! })),
  };
}

function evaluateRow(
  normalized: NormalizedActivityRow,
  knowledge: Awaited<ReturnType<typeof academyKnowledge>>,
  inBatchNames: Map<string, number[]>, // lower name → 행 번호들(배치 내 중복)
  rowNumber: number,
) {
  const v = validateActivityRow(normalized, knowledge.domainNames);
  const dup = findDuplicateCandidates(normalized.name, knowledge.existingActivities);
  const key = normalized.name.toLowerCase();
  const sameInBatch = key ? (inBatchNames.get(key) ?? []).filter((n) => n !== rowNumber) : [];
  const messages = [...v.messages];
  if (sameInBatch.length) messages.push(`파일 안에 같은 이름 행이 또 있어요(행 ${sameInBatch.join(", ")})`);
  return { validation: { status: v.status, messages }, duplicateCandidateIds: dup };
}

/* ── 1. 업로드→스테이징 (운영 데이터 무변경) ── */
export async function stageImport(db: Db, input: Actor & {
  fileName: string;
  csvText: string;
  mapping?: ColumnMapping; // 명시 매핑이 자동 제안을 이김
}, nowISO: string) {
  if (!isOwner(input.actorRoles)) return FORBIDDEN;
  if (input.csvText.length > 2_000_000) return { kind: "INVALID" as const, reason: "파일이 너무 커요(2MB)" };
  const grid = parseCsv(input.csvText);
  if (grid.length < 2) return { kind: "INVALID" as const, reason: "헤더 + 1행 이상이 필요해요" };
  const header = grid[0];
  const mapping = input.mapping ?? autoMapColumns(header);
  if (mapping.name === undefined) {
    return { kind: "INVALID" as const, reason: "활동 이름 열을 찾지 못했어요 — 열 매핑을 지정해 주세요", header };
  }
  const dataRows = grid.slice(1);
  if (dataRows.length > 2000) return { kind: "INVALID" as const, reason: "한 번에 2,000행까지 가져올 수 있어요" };

  const knowledge = await academyKnowledge(db, input.academyId);
  const fileHash = sha256Hex(input.csvText);
  // 같은 파일이 이미 커밋됐는지 — 재업로드 감지(커밋은 commit 단계에서 최종 차단)
  const committedSame = (await db.select().from(s.importBatches).where(and(
    eq(s.importBatches.academyId, input.academyId),
    eq(s.importBatches.fileHash, fileHash),
    eq(s.importBatches.status, "COMMITTED"),
  )))[0];

  // 배치 내 중복 이름 지도
  const normalizedAll = dataRows.map((cells) => normalizeRow(cells, mapping));
  const inBatch = new Map<string, number[]>();
  normalizedAll.forEach((n, i) => {
    const key = n.name.toLowerCase();
    if (!key) return;
    inBatch.set(key, [...(inBatch.get(key) ?? []), i + 2]); // 헤더=1행
  });

  return db.transaction(async (tx) => {
    const batchId = newId("imb");
    await tx.insert(s.importBatches).values({
      id: batchId, academyId: input.academyId, fileName: input.fileName,
      fileHash, mapping: JSON.stringify(mapping),
      uploadedByUserId: input.actorUserId, createdAt: nowISO,
    });
    let valid = 0, invalid = 0, withDuplicates = 0;
    const rowValues = dataRows.map((cells, i) => {
      const rowNumber = i + 2;
      const normalized = normalizedAll[i];
      const ev = evaluateRow(normalized, knowledge, inBatch, rowNumber);
      if (ev.validation.status === "VALID") valid++; else invalid++;
      if (ev.duplicateCandidateIds.length) withDuplicates++;
      return {
        id: newId("imr"), academyId: input.academyId, importBatchId: batchId,
        sourceRowNumber: rowNumber,
        rawPayload: JSON.stringify(cells),               // 원본 영구 보존
        normalizedPayload: JSON.stringify(normalized),   // 제안(수정 가능)
        validationStatus: ev.validation.status,
        validationMessages: JSON.stringify(ev.validation.messages),
        duplicateCandidateIds: JSON.stringify(ev.duplicateCandidateIds),
        updatedAt: nowISO,
      };
    });
    for (let i = 0; i < rowValues.length; i += 200) {
      await tx.insert(s.importRows).values(rowValues.slice(i, i + 200));
    }
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "OWNER",
      action: "import.staged", targetType: "ImportBatch", targetId: batchId,
      detail: { fileName: input.fileName, rows: dataRows.length, valid, invalid }, success: true,
    }, nowISO);
    return {
      kind: "STAGED" as const, batchId, mapping,
      total: dataRows.length, valid, invalid, withDuplicates,
      reuploadOfCommitted: !!committedSame,
    };
  });
}

/* ── 2. 미리보기 조회 ── */
export async function getImportBatch(db: Db, academyId: string, batchId: string) {
  const b = (await db.select().from(s.importBatches).where(and(
    eq(s.importBatches.id, batchId), eq(s.importBatches.academyId, academyId),
  )))[0];
  if (!b) return null;
  const rows = await db.select().from(s.importRows)
    .where(eq(s.importRows.importBatchId, b.id))
    .orderBy(asc(s.importRows.sourceRowNumber));
  return {
    batchId: b.id, fileName: b.fileName, status: b.status,
    mapping: JSON.parse(b.mapping) as ColumnMapping,
    committedAt: b.committedAt ?? undefined,
    revertedAt: b.revertedAt ?? undefined,
    rows: rows.map((r) => ({
      rowId: r.id, sourceRowNumber: r.sourceRowNumber,
      raw: JSON.parse(r.rawPayload) as string[],
      normalized: JSON.parse(r.normalizedPayload) as NormalizedActivityRow,
      validationStatus: r.validationStatus,
      validationMessages: JSON.parse(r.validationMessages) as string[],
      duplicateCandidateIds: JSON.parse(r.duplicateCandidateIds) as string[],
      resolution: r.resolution,
      committedEntityId: r.committedEntityId ?? undefined,
    })),
  };
}

export async function listImportBatches(db: Db, academyId: string) {
  const rows = await db.select().from(s.importBatches)
    .where(eq(s.importBatches.academyId, academyId))
    .orderBy(asc(s.importBatches.createdAt));
  return rows.map((b) => ({
    batchId: b.id, fileName: b.fileName, status: b.status,
    createdAt: b.createdAt, committedAt: b.committedAt ?? undefined,
  }));
}

/* ── 3. 행 수정 → 재검증 (오류 행만 고쳐 다시 검사 가능) ── */
export async function updateImportRow(db: Db, input: Actor & {
  batchId: string; rowId: string;
  normalized?: Partial<NormalizedActivityRow>;
  resolution?: "CREATE" | "SKIP";
}, nowISO: string) {
  if (!isOwner(input.actorRoles)) return FORBIDDEN;
  const knowledge = await academyKnowledge(db, input.academyId);
  return db.transaction(async (tx) => {
    const b = (await tx.select().from(s.importBatches).where(and(
      eq(s.importBatches.id, input.batchId), eq(s.importBatches.academyId, input.academyId),
    )).for("update"))[0];
    if (!b) return { kind: "NOT_FOUND" as const };
    if (b.status !== "STAGED") return { kind: "INVALID" as const, reason: "커밋된 배치는 수정할 수 없어요" };
    const row = (await tx.select().from(s.importRows).where(and(
      eq(s.importRows.id, input.rowId), eq(s.importRows.importBatchId, b.id),
    )))[0];
    if (!row) return { kind: "NOT_FOUND" as const };
    const cur = JSON.parse(row.normalizedPayload) as NormalizedActivityRow;
    const next: NormalizedActivityRow = {
      ...cur, ...input.normalized,
      secondaryDomainNames: input.normalized?.secondaryDomainNames ?? cur.secondaryDomainNames,
    };
    const v = validateActivityRow(next, knowledge.domainNames);
    const dup = findDuplicateCandidates(next.name, knowledge.existingActivities);
    await tx.update(s.importRows).set({
      normalizedPayload: JSON.stringify(next),
      validationStatus: v.status,
      validationMessages: JSON.stringify(v.messages),
      duplicateCandidateIds: JSON.stringify(dup),
      ...(input.resolution ? { resolution: input.resolution } : {}),
      updatedAt: nowISO,
    }).where(eq(s.importRows.id, row.id));
    return { kind: "UPDATED" as const, validationStatus: v.status, messages: v.messages };
  });
}

/* ── 4. 커밋 — VALID+CREATE 행만 생성(부분 성공 정책 명시) ── */
export async function commitImport(db: Db, input: Actor & { batchId: string }, nowISO: string) {
  if (!isOwner(input.actorRoles)) return FORBIDDEN;
  return db.transaction(async (tx) => {
    const b = (await tx.select().from(s.importBatches).where(and(
      eq(s.importBatches.id, input.batchId), eq(s.importBatches.academyId, input.academyId),
    )).for("update"))[0]; // 동시 커밋 직렬화
    if (!b) return { kind: "NOT_FOUND" as const };
    if (b.status === "COMMITTED") return { kind: "CONFLICT" as const, reason: "이미 커밋된 배치예요" };
    if (b.status === "REVERTED") return { kind: "CONFLICT" as const, reason: "되돌린 배치는 다시 커밋할 수 없어요" };
    // 같은 파일 중복 커밋 방지(지시서 §8 필수)
    const committedSame = (await tx.select().from(s.importBatches).where(and(
      eq(s.importBatches.academyId, input.academyId),
      eq(s.importBatches.fileHash, b.fileHash),
      eq(s.importBatches.status, "COMMITTED"),
    )))[0];
    if (committedSame) {
      return { kind: "CONFLICT" as const, reason: `같은 파일이 이미 커밋됐어요(${committedSame.fileName})` };
    }
    const domains = await tx.select().from(s.growthDomains).where(and(
      eq(s.growthDomains.academyId, input.academyId), eq(s.growthDomains.active, true),
    ));
    const domainByLower = new Map(domains.map((d) => [d.name.toLowerCase(), d.id]));
    const rows = await tx.select().from(s.importRows)
      .where(eq(s.importRows.importBatchId, b.id))
      .orderBy(asc(s.importRows.sourceRowNumber));
    let created = 0, skipped = 0, invalid = 0;
    for (const row of rows) {
      if (row.validationStatus !== "VALID") { invalid++; continue; }
      if (row.resolution === "SKIP") { skipped++; continue; }
      const n = JSON.parse(row.normalizedPayload) as NormalizedActivityRow;
      const activityId = newId("act");
      const revisionId = newId("arv");
      await tx.insert(s.activities).values({
        id: activityId, academyId: input.academyId, currentRevisionId: revisionId,
        createdByUserId: input.actorUserId, createdAt: nowISO, updatedAt: nowISO,
      });
      await tx.insert(s.activityRevisions).values({
        id: revisionId, academyId: input.academyId, activityId, revisionNumber: 1,
        name: n.name, description: n.description ?? null,
        instructions: null, easyVariation: null, standardVariation: null,
        challengeVariation: null, coachingPoints: null, safetyNotes: null,
        difficultyLabel: n.difficultyLabel ?? null,
        recommendedAgeLabel: n.recommendedAgeLabel ?? null,
        recommendedMinutes: null, participantFormat: null, spaceRequirement: null,
        createdByUserId: input.actorUserId, createdAt: nowISO, updatedAt: nowISO,
      });
      // 태그 — 매칭되는 영역만(미지 영역은 검증 경고대로 건너뜀). 자동 영역 생성 금지.
      const tags: { growthDomainId: string; role: "PRIMARY" | "SECONDARY" }[] = [];
      if (n.primaryDomainName) {
        const id = domainByLower.get(n.primaryDomainName.toLowerCase());
        if (id) tags.push({ growthDomainId: id, role: "PRIMARY" });
      }
      for (const sn of n.secondaryDomainNames) {
        const id = domainByLower.get(sn.toLowerCase());
        if (id && !tags.some((t) => t.growthDomainId === id)) tags.push({ growthDomainId: id, role: "SECONDARY" });
      }
      if (tags.length) {
        await tx.insert(s.activityRevisionGrowthTags).values(tags.map((t) => ({
          id: newId("argt"), academyId: input.academyId,
          activityRevisionId: revisionId, growthDomainId: t.growthDomainId, role: t.role,
        })));
      }
      await tx.update(s.importRows).set({ committedEntityId: activityId, updatedAt: nowISO })
        .where(eq(s.importRows.id, row.id));
      created++;
    }
    await tx.update(s.importBatches).set({
      status: "COMMITTED", committedAt: nowISO, committedByUserId: input.actorUserId,
      version: b.version + 1,
    }).where(eq(s.importBatches.id, b.id));
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "OWNER",
      action: "import.committed", targetType: "ImportBatch", targetId: b.id,
      detail: { created, skipped, invalid }, success: true,
    }, nowISO);
    return { kind: "COMMITTED" as const, created, skipped, invalid };
  });
}

/* ── 5. 되돌리기 — batch 단위 archive(삭제 아님) ── */
export async function revertImport(db: Db, input: Actor & { batchId: string }, nowISO: string) {
  if (!isOwner(input.actorRoles)) return FORBIDDEN;
  return db.transaction(async (tx) => {
    const b = (await tx.select().from(s.importBatches).where(and(
      eq(s.importBatches.id, input.batchId), eq(s.importBatches.academyId, input.academyId),
    )).for("update"))[0];
    if (!b) return { kind: "NOT_FOUND" as const };
    if (b.status === "REVERTED") return { kind: "REVERTED" as const, archived: 0 }; // 멱등
    if (b.status !== "COMMITTED") return { kind: "INVALID" as const, reason: "커밋된 배치만 되돌릴 수 있어요" };
    const rows = await tx.select().from(s.importRows)
      .where(eq(s.importRows.importBatchId, b.id));
    const ids = rows.map((r) => r.committedEntityId).filter((x): x is string => !!x);
    let archived = 0;
    if (ids.length) {
      const acts = await tx.select().from(s.activities).where(and(
        inArray(s.activities.id, ids), eq(s.activities.academyId, input.academyId),
        eq(s.activities.status, "ACTIVE"),
      ));
      for (const a of acts) {
        await tx.update(s.activities).set({
          status: "ARCHIVED", archivedAt: nowISO, updatedAt: nowISO, version: a.version + 1,
        }).where(eq(s.activities.id, a.id));
        archived++;
      }
    }
    await tx.update(s.importBatches).set({
      status: "REVERTED", revertedAt: nowISO, revertedByUserId: input.actorUserId,
      version: b.version + 1,
    }).where(eq(s.importBatches.id, b.id));
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "OWNER",
      action: "import.reverted", targetType: "ImportBatch", targetId: b.id,
      detail: { archived }, success: true,
    }, nowISO);
    return { kind: "REVERTED" as const, archived };
  });
}
