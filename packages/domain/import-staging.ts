/* 스프레드시트 가져오기 — 순수 스테이징 로직 (docs/20 §4 · 지시서 §8)
   원본을 바로 운영 테이블에 넣지 않는다: 파싱→열 매핑→정규화→검증→중복 후보까지가
   이 모듈(순수 함수). 커밋은 서비스 tx 의 몫.
   adapter 분리: 이 모듈은 "행렬(문자열 2차원)" 입력을 받는다 — CSV 는 parseCsv 로,
   XLSX 는 미래 어댑터가 같은 행렬을 만들어 주면 된다(파서 교체 지점). */

/* ── CSV 파서 — 따옴표·이스케이프("")·개행 포함 필드 지원 ── */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, ""); // BOM 제거
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cur); cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      rows.push(row); row = [];
    } else cur += ch;
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row); }
  // 완전 빈 행 제거(스프레드시트 꼬리 공백행)
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/* ── 열 자동 매핑 — 원더짐형 헤더 인식(제안일 뿐, 명시 매핑이 이김) ── */
export interface ColumnMapping {
  name?: number;              // 활동 이름 열 index
  description?: number;
  primaryDomain?: number;     // 대표 성장영역(예: Key FMS)
  secondaryDomains?: number[]; // 보조 태그 열들
  difficultyLabel?: number;
  recommendedAgeLabel?: number;
}

const NAME_HEADERS = ["name", "이름", "활동명", "activity", "activity name"];
const DESC_HEADERS = ["설명", "description", "내용", "desc"];
const PRIMARY_HEADERS = ["key fms", "대표", "primary", "대표영역", "key"];
const DIFFICULTY_HEADERS = ["level", "난이도", "difficulty"];
const AGE_HEADERS = ["age", "연령", "대상연령"];

export function autoMapColumns(header: readonly string[]): ColumnMapping {
  const norm = header.map((h) => h.trim().toLowerCase());
  const find = (cands: string[]) => {
    const i = norm.findIndex((h) => cands.includes(h));
    return i >= 0 ? i : undefined;
  };
  const m: ColumnMapping = {};
  const name = find(NAME_HEADERS);
  if (name !== undefined) m.name = name;
  const desc = find(DESC_HEADERS);
  if (desc !== undefined) m.description = desc;
  const primary = find(PRIMARY_HEADERS);
  if (primary !== undefined) m.primaryDomain = primary;
  const diff = find(DIFFICULTY_HEADERS);
  if (diff !== undefined) m.difficultyLabel = diff;
  const age = find(AGE_HEADERS);
  if (age !== undefined) m.recommendedAgeLabel = age;
  return m;
}

/* ── 정규화 — 원본은 보존, 정규화 결과는 "제안"(지시서: 자동 확정 금지) ── */
export function normalizeCell(v: string | undefined): string {
  return (v ?? "").replace(/\s+/g, " ").trim(); // 앞뒤·중복 공백 정리
}

export interface NormalizedActivityRow {
  name: string;
  description?: string;
  primaryDomainName?: string;
  secondaryDomainNames: string[];
  difficultyLabel?: string;
  recommendedAgeLabel?: string;
}

export function normalizeRow(cells: readonly string[], mapping: ColumnMapping): NormalizedActivityRow {
  const at = (i?: number) => (i === undefined ? undefined : normalizeCell(cells[i]));
  const secondary = (mapping.secondaryDomains ?? [])
    .map((i) => normalizeCell(cells[i]))
    .filter((v) => v !== "");
  const r: NormalizedActivityRow = {
    name: at(mapping.name) ?? "",
    secondaryDomainNames: [...new Set(secondary)],
  };
  const d = at(mapping.description); if (d) r.description = d;
  const p = at(mapping.primaryDomain); if (p) r.primaryDomainName = p;
  const diff = at(mapping.difficultyLabel); if (diff) r.difficultyLabel = diff;
  const age = at(mapping.recommendedAgeLabel); if (age) r.recommendedAgeLabel = age;
  return r;
}

/* ── 검증 — INVALID 는 커밋에서 제외(부분 성공 정책: docs/23) ── */
export interface RowValidation {
  status: "VALID" | "INVALID";
  messages: string[]; // 오류(INVALID 사유) + 경고(커밋은 가능)
}

export function validateActivityRow(row: NormalizedActivityRow, knownDomainNames: ReadonlySet<string>): RowValidation {
  const messages: string[] = [];
  let invalid = false;
  if (!row.name) { invalid = true; messages.push("활동 이름이 비어 있어요"); }
  if (row.name.length > 120) { invalid = true; messages.push("활동 이름이 너무 길어요(120자)"); }
  const lower = new Set([...knownDomainNames].map((n) => n.toLowerCase()));
  if (row.primaryDomainName && !lower.has(row.primaryDomainName.toLowerCase())) {
    messages.push(`대표 영역 '${row.primaryDomainName}' 을 찾지 못했어요 — 태그 없이 커밋돼요`);
  }
  for (const s of row.secondaryDomainNames) {
    if (!lower.has(s.toLowerCase())) {
      messages.push(`보조 영역 '${s}' 을 찾지 못했어요 — 해당 태그는 건너뛰어요`);
    }
  }
  return { status: invalid ? "INVALID" : "VALID", messages };
}

/** 중복 후보 — 같은 정규화 이름(대소문자 무시). 자동 병합 금지: 후보 "제안"만 */
export function findDuplicateCandidates(
  name: string,
  existing: readonly { id: string; name: string }[],
): string[] {
  const key = name.toLowerCase();
  if (!key) return [];
  return existing.filter((e) => e.name.toLowerCase() === key).map((e) => e.id);
}
