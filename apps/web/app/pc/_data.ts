/* =========================================================
   PACEFOLIO — 원장 PC 콘솔 어댑터 (DB 없음, 프로토타입)
   ---------------------------------------------------------
   B4 전환: 겹치는 엔티티(원생·반·프로그램·코치·청구 금액)는 공용
   fixture(lib/fixtures)에서 파생 — 이름·정원·금액이 코치/학부모 앱과 일치.
   콘솔 화면 전용 장식(필터·시간표·공지·Q&A·설정·KPI·마법사 카피)은 여기 로컬.
   비-"use client" 모듈 — 서버/클라이언트 양쪽에서 import 가능.
   ========================================================= */
import * as fx from "@/lib/fixtures";

export const fmt = (n: number) => n.toLocaleString("ko-KR");
/* 청구서 표기용 금액 — 음수는 화면 표기 규칙(−) 따름 */
const money = (n: number) => (n < 0 ? `−${fmt(-n)}` : fmt(n));

/* ---- fixture 조회 도우미 (정본 → 콘솔 관점) ---- */
type Cls = (typeof fx.classes)[number];
const userById = new Map(fx.users.map((u) => [u.id as string, u]));
const classById = new Map(fx.classes.map((c) => [c.id as string, c]));
const programById = new Map(fx.programs.map((p) => [p.id as string, p]));
const coachNm = (c: Cls) => userById.get(c.coachUserId as string)?.name ?? "";
const DIV_KO: Record<string, string> = { BRAIN: "브레인", ACTIVE: "액티브" };

function primaryClassOf(pid: string): Cls | undefined {
  const en = fx.enrollments.find((e) => (e.participantId as string) === pid);
  return en ? classById.get(en.classId as string) : undefined;
}
function invoiceOf(pid: string) {
  return fx.invoices.find((i) => (i.participantId as string) === pid);
}
function lineAmt(lineId: string): number {
  return fx.invoiceLines.find((l) => (l.id as string) === lineId)?.amount ?? 0;
}
/* 보호자 연락처 = fixture 정본 전화번호 마스킹 + 관계 호칭 */
function parentLabel(pid: string): string {
  const link = fx.guardianLinks.find((l) => (l.participantId as string) === pid);
  const g = link && fx.guardians.find((x) => x.id === link.guardianId);
  const u = g && userById.get(g.userId as string);
  if (!link || !u?.phone) return "";
  const rel = link.relationshipType === "FATHER" ? "아버님" : "어머님";
  return `010-****-${u.phone.slice(-4)} (${rel})`;
}
/* 형제 = 같은 보호자를 공유하는 다른 원생 (도담·서준이 코치/학부모 앱과 일치) */
function siblingName(pid: string): string | undefined {
  const link = fx.guardianLinks.find((l) => (l.participantId as string) === pid);
  const sibLink =
    link &&
    fx.guardianLinks.find(
      (l) => l.guardianId === link.guardianId && (l.participantId as string) !== pid,
    );
  return sibLink
    ? fx.participants.find((p) => p.id === sibLink.participantId)?.name
    : undefined;
}

export type PayKind = "완납" | "미납" | "일할 청구";
export type KidStatus = "재원" | "체험" | "휴원" | "퇴원 예정";

export interface Kid {
  id: string;
  nm: string;
  em: string;
  age: number;
  cls: string;
  coach: string;
  status: KidStatus;
  parent: string;
  sib?: string;
  pay: PayKind;
  payDetail: string;
  total: string;
  bill: [string, string][];
  makeup: number;
  veh: { ride: string; drop: string; seat: string } | null;
  alert?: string;
  makeups?: { t: string; s: string; done?: boolean; record?: string }[];
  gender?: "남" | "여" | "미입력";
}

/* 청구 상태(fixture Invoice.status) → 콘솔 수납 뱃지 */
const PAY_OF: Record<string, PayKind> = { PAID: "완납", OVERDUE: "미납", ISSUED: "일할 청구" };

/* 원생별 콘솔 뷰 장식(도메인 필드 아님) — 이름·반·금액은 fixture에서 파생.
   bill의 label은 콘솔 표기, line은 fixture invoiceLines의 정본 금액 참조. */
interface KidView {
  em: string;
  gender: NonNullable<Kid["gender"]>;
  status: KidStatus;
  payDetail: string;
  sibRel?: string; // 형제 호칭(형/동생) — 뷰 장식
  clsExtra?: string; // 다종목 표기 접미 — 뷰 장식
  bill: { label: string; line?: string; raw?: string }[];
  makeup: number;
  veh: Kid["veh"];
  alert?: string;
  makeups?: Kid["makeups"];
}
const KID_VIEW: Record<string, KidView> = {
  p_dodam: {
    em: "🧒", gender: "남", status: "재원", sibRel: "동생",
    payDetail: "원생별 분리 청구 · 보호자 합산 결제",
    bill: [{ label: "수강료", line: "il_dodam_tuition" }, { label: "차량비", line: "il_dodam_vehicle" }],
    makeup: 2,
    veh: { ride: "래미안아파트 정문 · 2:40 탑승", drop: "같은 곳 · 5:10 하원", seat: "주니어 카시트 필수 · 멀미 있어 앞좌석 선호" },
    makeups: [{ t: "10/13 (학원 휴무 대체)", s: "보강일 미지정 · 학부모 요청 있음" }, { t: "10/16 결석 (병원)", s: "긴급결석 처리됨 · 원장 처리 전" }],
  },
  p_seojun: {
    em: "👦", gender: "남", status: "재원", sibRel: "형",
    payDetail: "형제 20% 할인은 서준에게 적용",
    bill: [{ label: "수강료", line: "il_seojun_tuition" }, { label: "형제 20% 할인", line: "il_seojun_sib" }, { label: "차량비", line: "il_seojun_vehicle" }],
    makeup: 0,
    veh: { ride: "래미안아파트 정문 · 2:40 탑승 (형과 동승)", drop: "같은 곳 · 5:10 하원", seat: "주니어 카시트 필수" },
  },
  p_minjun: {
    em: "🧒", gender: "남", status: "재원",
    payDetail: "마감 6일 지남 · 리마인드 2회 · 오늘 결석 예정(아파요)",
    bill: [{ label: "수강료 (2분기 미납분)", line: "il_minjun_tuition" }, { label: "차량", raw: "미이용" }],
    makeup: 0, veh: null, alert: "⚠️ 견과류 알러지",
  },
  p_hayun: {
    em: "👧", gender: "여", status: "재원",
    payDetail: "자동결제",
    bill: [{ label: "수강료", line: "il_hayun_tuition" }, { label: "차량", raw: "미이용" }],
    makeup: 0, veh: null,
  },
  p_sua: {
    em: "👧", gender: "여", status: "재원", clsExtra: " + 인라인",
    payDetail: "다종목 10% — MAX 하나만 적용",
    bill: [{ label: "수강료 (축구+인라인)", line: "il_sua_tuition" }, { label: "다종목 10% 할인", line: "il_sua_multi" }, { label: "차량비", line: "il_sua_vehicle" }],
    makeup: 0,
    veh: { ride: "한빛초 후문 · 3:50 탑승", drop: "홈플러스 앞 · 6:20 하원", seat: "특이사항 없음" },
  },
  p_jiho: {
    em: "👦", gender: "남", status: "재원",
    payDetail: "플레이1→2 승급 반영",
    bill: [{ label: "수강료 (승급 반영)", line: "il_jiho_tuition" }, { label: "차량", raw: "미이용" }],
    makeup: 0, veh: null,
  },
  p_yerin: {
    em: "👧", gender: "여", status: "퇴원 예정",
    payDetail: "12월 퇴원 예정 · 부분 청구",
    bill: [{ label: "수강료 (부분 청구)", line: "il_yerin_tuition" }, { label: "차량", raw: "미이용" }],
    makeup: 0, veh: null,
  },
  p_ian: {
    em: "🧒", gender: "미입력", status: "재원",
    payDetail: "10/28 입회 · 남은 실제 수업 10회 기준 일할",
    bill: [{ label: "수강료 (일할 10/24회)", line: "il_ian_tuition" }, { label: "차량비 (일할 · 같은 구조)", line: "il_ian_vehicle" }],
    makeup: 0,
    veh: { ride: "강동도서관 앞 · 3:50 탑승", drop: "같은 곳 · 6:20 하원", seat: "신규 — 첫 주 동승 확인 필요" },
  },
};

/* 원생 8명 — 이름·나이·반·코치·보호자·형제·수납 상태·금액 전부 fixture 정본에서 파생 */
export const KIDS: Kid[] = fx.participants.map((p) => {
  const pid = p.id as string;
  const v = KID_VIEW[pid]!;
  const c = primaryClassOf(pid)!;
  const inv = invoiceOf(pid)!;
  const sibNm = siblingName(pid);
  return {
    id: pid.replace(/^p_/, ""),
    nm: p.name,
    em: v.em,
    age: parseInt(p.ageLabel, 10) || 0,
    cls: c.name + (v.clsExtra ?? ""),
    coach: coachNm(c),
    status: v.status,
    parent: parentLabel(pid),
    ...(sibNm && v.sibRel ? { sib: `${sibNm} (${v.sibRel}) · 같은 보호자 연결` } : {}),
    pay: PAY_OF[inv.status] ?? "완납",
    payDetail: v.payDetail,
    total: `${fmt(inv.total)}원`,
    gender: v.gender,
    bill: v.bill.map((b): [string, string] => [b.label, b.line ? money(lineAmt(b.line)) : b.raw ?? ""]),
    makeup: v.makeup,
    veh: v.veh,
    ...(v.alert ? { alert: v.alert } : {}),
    ...(v.makeups ? { makeups: v.makeups } : {}),
  };
});

/* 원생 도우미 */
export function programOf(cls: string) {
  if (cls.indexOf("플레이2") >= 0) return "플레이2";
  if (cls.indexOf("플레이3") >= 0) return "플레이3";
  if (cls.indexOf("축구") >= 0) return "유소년 축구";
  if (cls.indexOf("농구") >= 0) return "농구 특강";
  if (cls.indexOf("인라인") >= 0) return "인라인 기초";
  return "기타";
}
export function ageBand(a: number) { return a <= 6 ? "5~6세" : a <= 9 ? "7~9세" : "10~12세"; }
export function dayOf(cls: string) {
  if (cls.indexOf("월수") >= 0) return "월·수";
  if (cls.indexOf("화금") >= 0) return "화·금";
  if (cls.indexOf("유아") >= 0 || cls.indexOf("화목") >= 0) return "화·목";
  if (cls.indexOf("토") >= 0 || cls.indexOf("인라인") >= 0 || cls.indexOf("농구") >= 0) return "토";
  return "기타";
}
/* 반 선택지 = fixture 반 정본 (6개 반 이름·순서 일치) */
export const CLS_OPTS = fx.classes.map((c) => c.name);

/* 시간대 — fixture 반 시작시간 파생 (13B AudienceFilter 축) */
export function timeOf(cls: string): string {
  const c = fx.classes.find((x) => cls.indexOf(x.name.split(" ")[1] ?? x.name) >= 0 || cls.indexOf(x.name) >= 0);
  const h = parseInt(c?.time ?? "0", 10);
  if (h < 12) return "오전";
  return `${h - 12}시`;
}
/* 13B: AudienceFilter 정본 축 — 원생 조회·공지 대상·청구 대상·출결·대회·CSV 가
   같은 그룹 정의를 재사용한다 (화면별 재정의 금지, docs/13 §C) */
export const AF_GROUPS: { key: string; label: string; opts: string[] }[] = [
  { key: "day", label: "수업 요일 (복수 = 또는)", opts: ["월·수", "화·목", "화·금", "토"] },
  { key: "time", label: "시간대", opts: ["오전", "2시", "3시", "4시"] },
  { key: "prog", label: "프로그램", opts: ["플레이2", "플레이3", "유소년 축구", "농구 특강", "인라인 기초"] },
  { key: "cls2", label: "반", opts: CLS_OPTS },
  { key: "coach", label: "담당 코치", opts: ["김선재", "이창진", "이도현", "박정우"] },
  { key: "age", label: "연령대", opts: ["5~6세", "7~9세", "10~12세"] },
  { key: "gender", label: "성별 (선택 입력 · 운영 목적만 · 마케팅 타기팅 금지)", opts: ["남", "여", "미입력"] },
  { key: "pay", label: "수납", opts: ["완납", "미납", "일할 청구"] },
  { key: "veh", label: "차량", opts: ["이용", "미이용"] },
  { key: "safe", label: "안전정보", opts: ["있음", "없음"] },
];

/* 대시보드 반별 정원 — 인원·정원·퍼센트는 fixture 반 정본에서 파생, 라벨 문구·tone은 로컬 */
export interface Capacity { nm: string; sub: string; label: string; pct: number; tone: "accent" | "full" | "low"; }
const CAP_VIEW: Record<string, { label: (enrolled: number, cap: number, pct: number) => string; tone: Capacity["tone"] }> = {
  c_play2_mw: { label: (e, c) => `등록 12 · 재원 ${e} / 정원 ${c}`, tone: "accent" }, // 등록 12 = 재원 10 + 휴원 2(휴원은 뷰 장식)
  c_play2_ya: { label: (e, c) => `${e} / ${c} · 대기 1`, tone: "full" },
  c_soccer_tf: { label: (e, c) => `${e} / ${c} · 대기 2`, tone: "full" },
  c_play3_th: { label: (e, c) => `${e} / ${c}`, tone: "accent" },
  c_inline_sat: { label: (e, c, pct) => `${e} / ${c} · ${pct}%`, tone: "low" },
  c_basket_sat: { label: (e, c, pct) => `${e} / ${c} · ${pct}%`, tone: "accent" },
};
export const CAPACITY: Capacity[] = fx.classes.map((c) => {
  const v = CAP_VIEW[c.id as string]!;
  const pct = Math.round((c.enrolled / c.capacity) * 100);
  const pr = programById.get(c.programId as string)!;
  return {
    nm: c.name.replace(" ", " · "),
    sub: `${DIV_KO[pr.division] ?? ""} · ${coachNm(c)}`,
    label: v.label(c.enrolled, c.capacity, pct),
    pct,
    tone: v.tone,
  };
});

/* 프로그램 — 이름·부문·연령·반수·원생수·정원은 fixture 파생, 나머지 운영 카피는 로컬
   (수강료는 fixture에 프로그램 단가 엔티티가 없어 콘솔 카피로 유지 — 청구 금액과 정합) */
export interface ProgramRow {
  id: string; nm: string; div: string; sport: string; age: string; cur: string; cls: string; kids: string; st: string;
  time: string; cap: string; min: string; fee: string; veh: string; mid: string; rep: string; perm: string; permd: string;
}
const PROGRAM_VIEW: { pid: string; id: string; sport: string; cur: string; st: string; time: string; min: string; fee: string; veh: string; mid: string; rep: string; perm: string; permd: string }[] = [
  { pid: "pr_play2", id: "p2", sport: "밸런스·리듬 통합", cur: "24회 · v2026-1", st: "운영 중", time: "60분", min: "6명", fee: "360,000 / 분기", veh: "45,000 별도 · 무할인", mid: "일할 계산 (실제 남은 수업일)", rep: "밸런스·리듬 등 5항목 + 사진", perm: "선택형", permd: "해당 회차 추천 활동 중 코치가 선택·순서 변경" },
  { pid: "pr_play3", id: "p3", sport: "협응·전략 통합", cur: "24회 · v2026-1", st: "운영 중", time: "60분", min: "6명", fee: "380,000 / 분기", veh: "45,000 별도 · 무할인", mid: "일할 계산 (실제 남은 수업일)", rep: "협응·집중 등 5항목 + 사진", perm: "선택형", permd: "해당 회차 추천 활동 중 코치가 선택·순서 변경" },
  { pid: "pr_soccer", id: "soc", sport: "축구", cur: "24회 · v2026-2", st: "운영 중", time: "70분", min: "8명", fee: "540,000 / 분기", veh: "45,000 별도 · 무할인", mid: "일할 계산 (실제 남은 수업일)", rep: "드리블·슈팅 등 6항목 + 사진", perm: "자율형", permd: "학원 활동 라이브러리 안에서 코치가 자유 구성" },
  { pid: "pr_basket", id: "bsk", sport: "농구", cur: "12회 · v2026-1", st: "운영 중", time: "60분", min: "6명", fee: "300,000 / 분기", veh: "미운행", mid: "일할 계산 (실제 남은 수업일)", rep: "드리블·패스·슛 등 4항목", perm: "자율형", permd: "학원 활동 라이브러리 안에서 코치가 자유 구성" },
  { pid: "pr_inline", id: "inl", sport: "인라인", cur: "12회 · v2026-1", st: "모집 중", time: "60분", min: "5명", fee: "300,000 / 분기", veh: "미운행", mid: "일할 계산 (실제 남은 수업일)", rep: "주행·제동 등 4항목", perm: "잠금형", permd: "원장 커리큘럼 그대로 — 코치는 완료·부분·미진행만 기록" },
];
export const PROGRAMS: ProgramRow[] = PROGRAM_VIEW.map((v) => {
  const pr = programById.get(v.pid)!;
  const cls = fx.classes.filter((c) => (c.programId as string) === v.pid);
  const kids = cls.reduce((s, c) => s + c.enrolled, 0);
  return {
    id: v.id,
    nm: pr.name,
    div: DIV_KO[pr.division] ?? "",
    sport: v.sport,
    age: pr.ageLabel,
    cur: v.cur,
    cls: `${cls.length}개 반`,
    kids: `${kids}명`,
    st: v.st,
    time: v.time,
    cap: `${cls[0]?.capacity ?? 0}명`,
    min: v.min,
    fee: v.fee,
    veh: v.veh,
    mid: v.mid,
    rep: v.rep,
    perm: v.perm,
    permd: v.permd,
  };
});
export const PERMD: Record<string, string> = {
  잠금형: "원장 커리큘럼 그대로 — 코치는 완료·부분·미진행만 기록",
  선택형: "해당 회차 추천 활동 중 코치가 선택·순서 변경",
  자율형: "학원 활동 라이브러리 안에서 코치가 자유 구성",
  승인형: "코치가 새 활동 제안 → 원장 승인 후 반영",
};

/* 운영 중인 반 — 반·프로그램·요일·시작시간·코치·인원은 fixture 파생, 강의실·종료시간·라벨은 로컬 */
export interface ClsRow { nm: string; prog: string; time: string; room: string; coach: string; cap: string; }
const OP_VIEW: Record<string, { room: string; end: string; cap: (enrolled: number, cap: number) => string }> = {
  c_play2_mw: { room: "본관 2층", end: "15:30", cap: (e, c) => `등록 12 · 재원 ${e} / ${c}` },
  c_play2_ya: { room: "본관 1층", end: "11:20", cap: (e, c) => `${e} / ${c}` },
  c_soccer_tf: { room: "실내체육관", end: "17:10", cap: (e, c) => `${e} / ${c} · 대기 2` },
  c_play3_th: { room: "본관 2층", end: "16:00", cap: (e, c) => `${e} / ${c}` },
  c_inline_sat: { room: "야외 링크장", end: "12:00", cap: (e, c) => `${e} / ${c}` },
  c_basket_sat: { room: "실내체육관", end: "11:00", cap: (e, c) => `${e} / ${c}` },
};
export const CLASSES_OP: ClsRow[] = fx.classes.map((c) => {
  const v = OP_VIEW[c.id as string]!;
  return {
    nm: c.name.split(" ")[1] ?? c.name, // "플레이2 월수반" → "월수반"
    prog: programById.get(c.programId as string)!.name,
    time: `${c.daysLabel} ${c.time}~${v.end}`,
    room: v.room,
    coach: coachNm(c),
    cap: v.cap(c.enrolled, c.capacity),
  };
});
export const COACH_BUSY: Record<string, string> = { 김선재: "월·수", 이창진: "화·금", 이도현: "화·목", 박정우: "화·목·토" };

/* 시간표 — 주간. 세션 카드 = fixture 반 정본(이름·시간·코치) + 로컬 장식(강의실·종료시간) */
export interface WeekSess { name: string; sub: string; tone?: "active" | "off"; }
function weekSess(classId: string, tone?: WeekSess["tone"]): WeekSess {
  const c = classById.get(classId)!;
  const v = OP_VIEW[classId]!;
  return { name: c.name, sub: `${c.time}~${v.end} · ${v.room} · ${coachNm(c)}`, ...(tone ? { tone } : {}) };
}
export const WEEK: { day: string; sess: WeekSess[] }[] = [
  { day: "월", sess: [weekSess("c_play2_mw")] },
  { day: "화", sess: [weekSess("c_play2_ya"), weekSess("c_soccer_tf", "active"), weekSess("c_play3_th")] },
  { day: "수", sess: [weekSess("c_play2_mw")] },
  { day: "목", sess: [weekSess("c_play2_ya"), weekSess("c_play3_th")] },
  { day: "금", sess: [weekSess("c_soccer_tf", "active")] },
  { day: "토", sess: [weekSess("c_basket_sat"), weekSess("c_inline_sat", "active")] },
];
/* 월간 Session 규칙(요일 0=일) + 예외 */
export const TT_RECUR: Record<number, string[]> = { 0: [], 1: ["플레이2 월수반"], 2: ["플레이2 유아반", "축구 화금반", "플레이3 화목반"], 3: ["플레이2 월수반"], 4: ["플레이2 유아반", "플레이3 화목반"], 5: ["축구 화금반"], 6: ["농구 토요특강", "인라인 토요반"] };
export const TT_EXC: Record<string, { cls: string; st: string; lb: string }> = {
  "10/31": { cls: "축구 화금반", st: "cx", lb: "학원 휴무 취소" },
  "12/25": { cls: "플레이3 화목반", st: "cx", lb: "공휴일 취소" },
  "12/30": { cls: "축구 화금반", st: "ex", lb: "추가 수업" },
  "11/14": { cls: "축구 화금반", st: "sc", lb: "예정 (취소 데모 대상)" },
};
export const TT_DOW = ["일", "월", "화", "수", "목", "금", "토"];
/* Session 상태 → 미터/도트 tone (token 클래스로 매핑) */
export const TT_TONE: Record<string, "accent" | "ink3" | "danger" | "warn"> = { cf: "accent", sc: "ink3", cx: "danger", ex: "warn" };

/* 시간표 예외 · Session 상태 리스트 (탭3 우측) */
export const TT_EXC_LIST: { title: string; sub: string; pill: string; tone: "muted" | "accent" }[] = [
  { title: "10/31 (금) 축구 화금반", sub: "학원 행사 — 회차 차감 · 보강 건 생성됨", pill: "학원 휴무 취소", tone: "muted" },
  { title: "12/25 (목) 플레이3 화목반", sub: "성탄절 — 회차 차감", pill: "공휴일 취소", tone: "muted" },
  { title: "12/30 (화) 축구 화금반", sub: "보충 수업 — 회차 +1", pill: "추가 수업", tone: "accent" },
];

/* 수납: 반별 청구 회차 */
export interface CalcRow { nm: string; days: string; plan: number; hol: number; holNote: string; off: number; offNote: string; extra: number; extraNote: string; fin: number; }
export const CALC: CalcRow[] = [
  { nm: "플레이2 · 월수반", days: "월·수", plan: 24, hol: 0, holNote: "수업 요일과 겹치는 공휴일 없음", off: 1, offNote: "10/13(월) 시설 점검", extra: 0, extraNote: "—", fin: 23 },
  { nm: "축구 · 화금반", days: "화·금", plan: 24, hol: 0, holNote: "10/9·12/25는 목요일 — 영향 없음", off: 1, offNote: "10/31(금) 학원 행사", extra: 1, extraNote: "12/30(화) 보충 수업", fin: 24 },
  { nm: "플레이3 · 화목반", days: "화·목", plan: 24, hol: 2, holNote: "10/9 한글날 · 12/25 성탄절 (목)", off: 0, offNote: "—", extra: 0, extraNote: "—", fin: 22 },
  { nm: "인라인 · 토요반", days: "토", plan: 13, hol: 0, holNote: "수업 요일과 겹치는 공휴일 없음", off: 1, offNote: "12/27(토) 연말 휴무", extra: 0, extraNote: "—", fin: 12 },
];
export const CYCLE_NEXT: Record<string, string> = { 월별: "12월 · 12/1~12/31", "2개월 단위": "12~1월 · 12/1~1/31", "3개월 단위": "4분기 · 12/1~2/28", "직접 설정": "직접 지정 — 시작일 선택" };
export const MJ_TOTAL = 24, MJ_FEE = 540000;
export const MJ_OPTS = [
  { r: 10, date: "10/28 (화)", sub: "남은 실제 수업 10회" },
  { r: 8, date: "11/4 (화)", sub: "남은 실제 수업 8회" },
  { r: 5, date: "11/14 (금)", sub: "남은 실제 수업 5회" },
];
/* 13B: 입회 계산기 반 선택 — 반을 고르면 요일·시간 자동(중복 입력 방지) */
export const MJ_CLASSES = [
  { nm: "축구 화금반", days: "화·금 16:00", total: 24, fee: 540000 },
  { nm: "플레이2 월수반", days: "월·수 14:30", total: 24, fee: 360000 },
  { nm: "인라인 토요반", days: "토 11:00", total: 12, fee: 300000 },
];
export const MJ_DISCOUNTS = [
  { nm: "할인 없음", pct: 0 },
  { nm: "형제 20%", pct: 20 },
  { nm: "다종목 10%", pct: 10 },
];

/* 13B: 휴무 등록 — event 로 등록하면 계산기가 회차를 재계산 (숫자 직접 수정 금지) */
export const OFF_TYPES = ["공휴일", "학원 방학", "학원 공사", "행사", "강사 개인 사유", "대회", "임시 휴무", "기타"];
export const OFF_SCOPES = ["전체 학원", "플레이2 월수반", "축구 화금반", "인라인 토요반"];

/* 13B: 부분 발송 그룹 — AudienceFilter(요일 축) 기반 · 대상 인원은 반 정본 파생 */
export const BILL_GROUPS = fx.classes
  .filter((c) => ["c_play2_mw", "c_soccer_tf", "c_play3_th", "c_inline_sat"].includes(c.id as string))
  .map((c) => ({
    id: c.id as string,
    nm: c.name,
    days: c.daysLabel,
    time: c.time,
    n: c.enrolled,
  }));

/* 13B: 환불 요청 목록 — 단일 카드 → 목록(접기/펼치기). 순서:
   계산 → 원장 제안 → 학부모 승인 → 원장 최종 승인 → PG → COMPLETED → 재계산 */
export const REFUND_LIST = [
  {
    id: "minjun", nm: "박민준", cls: "플레이2 월수반", stage: "원장 최종 승인 대기",
    tone: "warn" as const,
    detail: { tuition: "165,000", vehicle: "+26,250", total: "191,250원", done: 10, whole: 24, rule: "½ 경과 전 → ½ 반환 기준 (법정 바닥 · 학원은 더 후하게만)" },
    guardian: "민준 어머님 승인 완료 · 오전 10:20 “금액 확인했습니다”",
  },
  {
    id: "ian", nm: "최이안", cls: "축구 화금반", stage: "금액 확인 중 (원장 제안 단계)",
    tone: "muted" as const,
    detail: { tuition: "112,500", vehicle: "—", total: "112,500원 (예상)", done: 19, whole: 24, rule: "잔여 회차 비례 · 위약금 정책 확인 중" },
    guardian: "학부모 요청 접수 · 어제 — 원장 제안 대기",
  },
  {
    id: "sua", nm: "이수아", cls: "인라인 토요반", stage: "PG 처리 중",
    tone: "accent" as const,
    detail: { tuition: "75,000", vehicle: "—", total: "75,000원", done: 9, whole: 12, rule: "양측 승인 완료 · 웹훅 COMPLETED 대기" },
    guardian: "양측 승인 완료 · PG 환불 요청됨 (3영업일 내)",
  },
];

/* 13B: 강사 상세 4군 (기본 / 자격·안전 / 운영 / 권한) — 민감 인사는 PC·원장만 */
export const COACH_DETAIL: Record<string, { base: [string, string][]; cert: [string, string][]; ops: [string, string][]; perm: [string, string][] }> = {
  김선재: {
    base: [["연락처", "010-****-7712"], ["입사일", "2024-08-01"], ["재직 상태", "퇴사 예정 (마지막 근무 11/30)"], ["고용 형태", "정규"]],
    cert: [["자격증", "생활스포츠지도사 2급 · ~2027-05"], ["응급처치", "CPR 이수 · 2026-03"], ["안전교육", "이수 · 2026-01"], ["필수 서류", "완비"]],
    ops: [["담당 원생", "18명"], ["주간 수업", "3회"], ["대체 가능", "플레이2·농구"], ["인수인계", "작별 피드백 2/4 · 안전 정보 자동 인계"], ["미확인 필수 메시지", "0건"]],
    perm: [["원생·건강정보", "담당 반만"], ["사진", "담당 반 업로드"], ["학부모 채팅", "담당 보호자만"], ["출결 수정", "가능(이력)"], ["수납정보", "접근 불가"]],
  },
  이창진: {
    base: [["연락처", "010-****-3391"], ["입사일", "2026-07-16 (어제 가입)"], ["재직 상태", "재직"], ["고용 형태", "정규"]],
    cert: [["자격증", "축구지도자 C급 · ~2028-02"], ["응급처치", "CPR 이수 · 2026-06"], ["안전교육", "예정 (입사 30일 내)"], ["필수 서류", "1건 대기"]],
    ops: [["담당 원생", "16명"], ["주간 수업", "2회"], ["대체 가능", "축구"], ["인수인계", "—"], ["미확인 필수 메시지", "1건"]],
    perm: [["원생·건강정보", "담당 반만"], ["사진", "담당 반 업로드"], ["학부모 채팅", "담당 보호자만"], ["출결 수정", "가능(이력)"], ["수납정보", "접근 불가"]],
  },
  박정우: {
    base: [["연락처", "010-****-8845"], ["입사일", "2025-03-02"], ["재직 상태", "재직"], ["고용 형태", "정규"]],
    cert: [["자격증", "생활스포츠지도사 2급 · ~2026-11 ⚠ 만료 임박"], ["응급처치", "CPR 이수 · 2025-11"], ["안전교육", "이수"], ["필수 서류", "완비"]],
    ops: [["담당 원생", "16명"], ["주간 수업", "3회"], ["대체 가능", "플레이3·인라인"], ["인수인계", "—"], ["미확인 필수 메시지", "0건"]],
    perm: [["원생·건강정보", "담당 반만"], ["사진", "담당 반 업로드"], ["학부모 채팅", "담당 보호자만"], ["출결 수정", "가능(이력)"], ["수납정보", "접근 불가"]],
  },
};

/* 강사 — 이름은 fixture 코치 정본(멤버십 순서), 담당·상태 카피는 로컬 */
export interface Coach { init: string; nm: string; charge: string; status: string; tone: "ok" | "wait"; perm: string; swap?: boolean; }
const COACH_VIEW: Record<string, { charge: string; status: string; tone: Coach["tone"]; perm: string; swap?: boolean }> = {
  u_coach_ksj: { charge: "플레이2 월수반 · 농구 토요 특강", status: "퇴사 예정 · 11/30", tone: "wait", perm: "담당 반 원생 · 안전 정보", swap: true },
  u_coach_lcj: { charge: "축구 화금반", status: "재직", tone: "ok", perm: "담당 반 원생 · 안전 정보" },
  u_coach_park: { charge: "플레이3 화목반 · 인라인 토요반", status: "재직", tone: "ok", perm: "담당 반 원생 · 안전 정보" },
  // u_coach_lee(이도현·유아반)는 원본 콘솔 화면에 없음 — 화면 불변 위해 그대로 생략
};
export const COACHES: Coach[] = fx.memberships
  .filter((m) => m.roles.includes("COACH"))
  .flatMap((m) => {
    const u = userById.get(m.userId as string);
    const v = COACH_VIEW[m.userId as string];
    if (!u || !v) return [];
    return [{ init: u.name.slice(0, 1), nm: u.name, ...v }];
  });
export const SWAP_CLASSES = [
  { cls: "플레이2 월수반", kids: 10, sub: "재원 10명 (등록 12 · 휴원 2) · 알림 대상은 재원 10명 · 14개월 담당", def: true },
  { cls: "농구 토요 특강", kids: 8, sub: "8명 · 선택 안 하면 다른 코치에게 따로 배정", def: false },
];
export const SWAP_DATES = [
  { date: "12/1 (월)", sub: "추천 · 김선재 마지막 근무 다음 날" },
  { date: "11/17 (월)", sub: "즉시 교체 · 2주 동행 인수인계" },
];
export const SWAP_REVOKE = [
  { v: "마지막 수업일(11/30)에 회수", sub: "추천 · 작별 피드백 남길 시간을 줘요" },
  { v: "지금 바로 원더짐 권한 회수", sub: "이 학원 담당·접근만 즉시 회수 (다른 학원 권한은 유지) · 작별 피드백은 못 남겨요" },
];

/* 대회 */
export const COMP_TEAMS_INIT = [
  { init: "원", nm: "원더짐 FC", sub: "주최", status: "확정" as const },
  { init: "송", nm: "송파리틀킥", status: "확정" as const },
  { init: "천", nm: "천호FC", status: "확정" as const },
  { init: "하", nm: "하남 Utd", status: "확정" as const },
];
export const COMP_INVITES = ["성내 유나이티드", "길동 리틀윙즈"];

/* 공지·소통 */
export const NT_CHIPS = [
  { label: "전체", n: 93, p: 87, sub: "원생 93명" },
  { label: "플레이2만", n: 22, p: 20, sub: "원생 22명" },
  { label: "축구만", n: 18, p: 17, sub: "원생 18명" },
  { label: "인라인만", n: 12, p: 12, sub: "원생 12명" },
];
export const COACH_CHIPS = ["김선재 코치", "이창진 코치", "박정우 코치"];
export const BANNERS_INIT = [
  { icon: "trophy", title: "가을 대회 참가 안내", sub: "노출 ~11/22 · 대상 전체 · 버튼: 참가 신청하기", pill: "게시 중", tone: "accent" as const },
  { icon: "mega", title: "겨울 캠프 사전 모집", sub: "노출 12/1~12/24 · 대상 축구·인라인 · 버튼: 자세히 보기", pill: "게시 예약", tone: "warn" as const },
];
export interface QaItem { q: string; a: string; cat: string; tgt: string; pub: boolean; }
export const QA_MGR: QaItem[] = [
  { q: "결석하면 보강은 어떻게 되나요?", a: "앱에서 결석 예정으로 접수되고, 보강과 회차 처리는 학원 운영 기준에 따라 안내해요(자동 예약은 아니에요).", cat: "결석·보강", tgt: "원더짐 아카데미 전체", pub: true },
  { q: "수강료는 언제·어떻게 내나요?", a: "분기제(3·6·9·12월 시작)가 기본이에요. 매 기간 시작 전 청구서가 앱으로 오고, 자동결제 등록 시 안내 후 자동 결제돼요.", cat: "수강료·결제", tgt: "원더짐 아카데미 전체", pub: true },
  { q: "형제·다종목 할인 되나요?", a: "형제·다종목·장기 중 가장 큰 하나 + 이벤트 할인이 얹혀요(최대 20%). 청구서에서 항목별로 확인돼요.", cat: "할인", tgt: "원더짐 아카데미 전체", pub: true },
  { q: "중간에 그만두면 환불은요?", a: "이용 회차·계약·적용 기준에 따라 예상액을 계산하고, 보호자·원장이 함께 확인해 처리해요.", cat: "환불", tgt: "원더짐 아카데미 전체", pub: true },
  { q: "준비물은 매번 뭘 챙기나요?", a: "수업 3시간 전 그날 진도·준비물을 자동으로 안내해요. 일정 탭에서 미리 볼 수 있어요.", cat: "준비물", tgt: "원더짐 아카데미 전체", pub: true },
  { q: "차량비는 어떻게 되나요?", a: "수강료와 별도이고 무할인이에요. 노선·탑승/하원 위치는 우리 아이 탭에서 확인해요.", cat: "차량", tgt: "차량 이용 원생", pub: false },
];
export const QA_CATS = ["결석·보강", "수강료·결제", "할인", "환불", "준비물", "차량", "기타"];

/* 설정 */
export const SETTINGS_ROWS = [
  { label: "학원 정보", sub: "원더짐 아카데미 · 브레인/액티브 2부문 · 6프로그램" },
  { label: "할인 규칙", sub: "형제20 · 다종목10 · 장기5 중 MAX 하나 × 이벤트5 · 상한 20%" },
  { label: "환불 규정", sub: "적용 법령·계약·등록 방식 기준 · 학원 정책에 따라 조정 · 양측 확인 기록" },
  { label: "수납 주기", sub: "3개월 단위 · 3·6·9·12월 시작 (원장 설정 · 변경 가능) · 차량비 별도·무할인" },
  { label: "직원 권한", sub: "원장 1 · 데스크 1 · 코치 3 — 역할별 원생·수납·차량 접근 범위 설정" },
  { label: "감사 로그", sub: "프로그램·시간표·청구·출결·리포트의 모든 수정에 작성자·시각·이전 값·사유 기록" },
];

/* 대시보드 KPI */
export const DASH_KPI = [
  { kk: "3분기 수납 현황", kv: "₩24,180,000", kd: "목표 대비 87% · 지난 분기 +12%", hero: true },
  { kk: "전체 원생", kv: "93명", kd: "신규 등록 +11명", tone: "up" as const },
  { kk: "이번 주 출석률", kv: "89%", kd: "긴급결석 1건 접수" },
];
