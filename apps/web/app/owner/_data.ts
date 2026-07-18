/* =========================================================
   PACEFOLIO — 원장 앱 어댑터 (DB 없음, 프로토타입)
   ---------------------------------------------------------
   B4 전환: 겹치는 엔티티(원생·반·코치·보호자·청구 금액·예정결석)는
   공용 fixture(lib/fixtures)에서 파생 — 이름·형제 관계·금액이
   코치/학부모 앱과 단일 소스로 일치.
   원장 화면 전용 장식(이모지·재원상태·차량·보강·위저드 문구·설정 행)은
   여기 로컬. (plain 모듈 — "use client" 아님)
   ========================================================= */
import * as fx from "@/lib/fixtures";

export type KidStatus = "재원" | "체험" | "휴원" | "퇴원 예정";
export type PayLabel = "완납" | "미납" | "일할 청구";

export interface Veh {
  ride: string;
  drop: string;
  seat: string;
}
export interface Makeup {
  t: string;
  s: string;
}
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
  pay: PayLabel;
  payDetail: string;
  makeup: number;
  veh?: Veh | null;
  alert?: string;
  makeups?: Makeup[];
}

/* ---------- fixture 파생 헬퍼 ---------- */
const fmtWon = (n: number) => `₩${n.toLocaleString("ko-KR")}`;
/* "010-3000-1234" → "010-****-1234" (금액·연락처는 개인정보 — 마스킹 표시) */
function maskPhone(phone: string): string {
  const [a, , c] = phone.split("-");
  return `${a}-****-${c}`;
}
const REL_LABEL: Record<string, string> = { MOTHER: "어머님", FATHER: "아버님" };
/* 청구 상태 → 원장 화면 수납 라벨 */
const PAY_LABEL: Record<string, PayLabel> = {
  PAID: "완납",
  OVERDUE: "미납",
  ISSUED: "일할 청구",
};

/* 원장 화면 전용 뷰 플래그(도메인 필드 아님): 이모지·재원상태·차량·보강·
   수납 부가설명. 금액·이름·반·보호자는 fixture 정본에서 파생. */
interface OwnerViewFlags {
  em: string;
  status: KidStatus;
  payNote: string; // payDetail 뒷부분 설명 (금액 앞머리는 fixture invoice.total)
  makeup: number;
  veh: Veh | null;
  sibRel?: string; // 형제 관계 표기(동생/형) — 관계 자체는 guardianLinks 정본
  alert?: string;
  makeups?: Makeup[];
}
const OWNER_VIEW_FLAGS: Record<string, OwnerViewFlags> = {
  p_dodam: {
    em: "🧒", status: "재원", sibRel: "동생",
    payNote: "수강료 360,000 + 차량 45,000 · 원생별 분리 청구", makeup: 2,
    veh: { ride: "래미안아파트 정문 · 2:40 탑승", drop: "같은 곳 · 5:10 하원", seat: "주니어 카시트 필수 · 멀미 있어 앞좌석 선호" },
    makeups: [
      { t: "10/13 (학원 휴무 대체)", s: "보강일 미지정 · 학부모 요청 있음" },
      { t: "10/16 결석 (병원)", s: "긴급결석 처리됨 · 원장 처리 전" },
    ],
  },
  p_seojun: {
    em: "👦", status: "재원", sibRel: "형",
    payNote: "수강료 288,000(형제 20%) + 차량 45,000", makeup: 0,
    veh: { ride: "래미안아파트 정문 · 2:40 탑승 (형과 동승)", drop: "같은 곳 · 5:10 하원", seat: "주니어 카시트 필수" },
  },
  p_minjun: {
    em: "🧒", status: "재원",
    payNote: "마감 6일 지남 · 리마인드 2회", makeup: 0,
    veh: null, alert: "⚠️ 견과류 알러지",
  },
  p_hayun: {
    em: "👧", status: "재원",
    payNote: "자동결제", makeup: 0, veh: null,
  },
  p_sua: {
    em: "👧", status: "재원",
    payNote: "다종목 10% 적용가", makeup: 0,
    veh: { ride: "한빛초 후문 · 3:50 탑승", drop: "홈플러스 앞 · 6:20 하원", seat: "특이사항 없음" },
  },
  p_jiho: {
    em: "👦", status: "재원",
    payNote: "플레이1→2 승급 반영", makeup: 0, veh: null,
  },
  p_yerin: {
    em: "👧", status: "퇴원 예정",
    payNote: "12월 퇴원 예정 (부분 청구)", makeup: 0, veh: null,
  },
  p_ian: {
    em: "🧒", status: "재원",
    payNote: "10/28 입회 · 남은 실제 수업 10회", makeup: 0,
    veh: { ride: "강동도서관 앞 · 3:50 탑승", drop: "같은 곳 · 6:20 하원", seat: "신규 — 첫 주 동승 확인 필요" },
  },
};

/* 원생 8명 — 이름·나이·반·코치·보호자(형제 그룹)·금액은 fixture 정본에서 파생 */
export const KIDS: Kid[] = fx.participants.map((p) => {
  const v = OWNER_VIEW_FLAGS[p.id as string];

  /* 반·코치: 활성 등록 → 반 → 담당 코치. 다종목(수아)은 "주반 + 종목" 표기 */
  const ens = fx.enrollments.filter((e) => e.participantId === p.id && e.status === "ACTIVE");
  const classes = ens.map((e) => fx.classes.find((c) => c.id === e.classId)!);
  const extra = classes.slice(1).map((c) => {
    const pr = fx.programs.find((x) => x.id === c.programId);
    return ` + ${(pr?.name ?? c.name).split(" ")[0]}`; // "인라인 기초" → "인라인"
  });
  const cls = classes[0].name + extra.join("");
  const coach = fx.users.find((u) => u.id === classes[0].coachUserId)?.name ?? "";

  /* 보호자: guardianLinks 정본 → 마스킹 연락처 + 관계. 형제 = 같은 보호자 */
  const link = fx.guardianLinks.find((l) => l.participantId === p.id)!;
  const gUser = fx.users.find(
    (u) => u.id === fx.guardians.find((g) => g.id === link.guardianId)?.userId,
  )!;
  const parent = `${maskPhone(gUser.phone ?? "")} (${REL_LABEL[link.relationshipType] ?? "보호자"})`;
  const sibLink = fx.guardianLinks.find(
    (l) => l.guardianId === link.guardianId && l.participantId !== p.id,
  );
  const sibName = sibLink && fx.participants.find((x) => x.id === sibLink.participantId)?.name;

  /* 수납: fixture invoice 정본 — 합계·상태가 학부모 앱 청구서와 일치 */
  const inv = fx.invoices.find((i) => i.participantId === p.id)!;

  return {
    id: (p.id as string).replace(/^p_/, ""),
    nm: p.name,
    em: v.em,
    age: parseInt(p.ageLabel, 10) || 0,
    cls,
    coach,
    status: v.status,
    parent,
    ...(sibName ? { sib: `${sibName} (${v.sibRel}) · 같은 보호자 연결` } : {}),
    pay: PAY_LABEL[inv.status] ?? "완납",
    payDetail: `${fmtWon(inv.total)} · ${v.payNote}`,
    makeup: v.makeup,
    veh: v.veh,
    ...(v.alert ? { alert: v.alert } : {}),
    ...(v.makeups ? { makeups: v.makeups } : {}),
  };
});

export const kidById = (id: string) => KIDS.find((k) => k.id === id);

/* ───── 홈: 반별 정원 현황 — 반이름·정원·재원은 fixture classes 정본 ───── */
export type MeterTone = "ok" | "full" | "low";
export interface CapMeter {
  nm: string;
  sub: string;
  cur: number;
  cap: number;
  note: string;
  tone: MeterTone;
  recruit?: boolean;
  /* 13A: 요일 OR 필터·accordion 상세용 — fixture 정본(daysLabel·time) 파생 */
  days: string[];
  time: string;
  prog: string;
}
const DIV_LABEL: Record<string, string> = { BRAIN: "브레인", ACTIVE: "액티브" };
/* 원장 화면 전용 뷰 플래그: 톤·대기 표기·모집 배지. 수치는 fixture 정본 */
const CAP_VIEW_FLAGS: Record<string, { tone: MeterTone; noteSuffix?: string; recruit?: boolean; plainName?: boolean }> = {
  c_play2_mw: { tone: "ok" },
  c_play2_ya: { tone: "full" },
  c_soccer_tf: { tone: "full", noteSuffix: " · 대기 2" },
  c_play3_th: { tone: "ok" },
  c_inline_sat: { tone: "low", noteSuffix: " · 42%", recruit: true, plainName: true },
  c_basket_sat: { tone: "ok" },
};
export const CAP_METERS: CapMeter[] = fx.classes.map((c) => {
  const v = CAP_VIEW_FLAGS[c.id as string];
  const pr = fx.programs.find((x) => x.id === c.programId);
  const coach = fx.users.find((u) => u.id === c.coachUserId)?.name ?? "";
  return {
    nm: v.plainName ? c.name : c.name.replace(" ", " · "), // "플레이2 월수반" → "플레이2 · 월수반"
    sub: `${DIV_LABEL[pr?.division ?? ""] ?? ""} · ${coach}`,
    cur: c.enrolled,
    cap: c.capacity,
    note: `${c.enrolled} / ${c.capacity}${v.noteSuffix ?? ""}`,
    tone: v.tone,
    ...(v.recruit ? { recruit: true } : {}),
    days: c.daysLabel.split("·"),
    time: c.time,
    prog: pr?.name ?? c.name,
  };
});
export const CAP_DAYS = ["월", "화", "수", "목", "금", "토", "일"] as const;

/* ───── 홈: 수납 배너 명단 시트 (13A — 숫자는 버튼, 클릭 = 명단 + 다음 행동)
   배너 집계(81/7/5)는 원생 93명 기준 목업 — 시트 명단은 fixture 8명 정본에서
   파생하고 나머지는 "외 N명"으로 표시(가짜 이름 생성 금지). ───── */
export interface PayListRow {
  id: string;
  nm: string;
  cls: string;
  sub: string;   // 행동에 필요한 문맥(마감·열람·리마인드·연락 상태)
  amt?: string;  // 금액 — 명단을 연 후에만 표시(13A: 홈 첫 화면 금액 제거)
}
export interface PaySheet {
  title: string;
  count: number;
  sub: string;
  rows: PayListRow[];
  more?: string;
  actions: string[]; // 행동 버튼(동일 규격) — 목업: toast
  bulk?: string;     // 하단 일괄 행동
}
const amtOf = (k: Kid) => k.payDetail.split(" · ")[0];
const doneKids = KIDS.filter((k) => k.pay === "완납");
const waitKids = KIDS.filter((k) => k.pay === "일할 청구");
const overKids = KIDS.filter((k) => k.pay === "미납");
export const PAY_SHEETS: Record<"done" | "wait" | "over", PaySheet> = {
  done: {
    title: "결제 완료",
    count: 81,
    sub: "9월 시작 수납기간 · 원생 기준",
    rows: doneKids.map((k) => ({
      id: k.id, nm: k.nm, cls: k.cls,
      sub: "9/1 카드 결제 · 영수증 발급됨",
      amt: amtOf(k),
    })),
    more: `외 ${81 - doneKids.length}명 — 전체 명단은 실 API 연결 후`,
    actions: ["결제 상세", "영수증", "대화"],
  },
  wait: {
    title: "결제 대기",
    count: 7,
    sub: "청구서 발송됨 · 마감 12/1 전",
    rows: waitKids.map((k, i) => ({
      id: k.id, nm: k.nm, cls: k.cls,
      sub: `${k.parent.split(" ")[0]} · 마감 12/1 · ${i % 2 === 0 ? "청구서 열람함" : "미열람"} · 마지막 알림 어제`,
      amt: amtOf(k),
    })),
    more: `외 ${7 - waitKids.length}명 — 전체 명단은 실 API 연결 후`,
    actions: ["알림 보내기", "대화", "청구서"],
    bulk: "선택 대상 일괄 알림",
  },
  over: {
    title: "기한 초과",
    count: 5,
    sub: "마감 지남 · 리마인드·대화·입금 확인",
    rows: overKids.map((k) => ({
      id: k.id, nm: k.nm, cls: k.cls,
      sub: k.payDetail.split(" · ").slice(1).join(" · ") + " · 연락 무응답",
      amt: amtOf(k),
    })),
    more: "외 3명 · ₩804,000 — 전체 명단은 실 API 연결 후",
    actions: ["리마인드", "대화", "입금 확인"],
  },
};

/* ───── 홈: 공지 미열람 보호자 명단 (13B §7.1 — 숫자 클릭 → 명단 → 행동) ─────
   집계 6명은 보호자 87명 기준 목업 — 명단은 fixture 보호자 파생 + "외 N명" */
export const NOTICE_UNREAD = {
  title: "가을 대회 참가 안내",
  count: 6,
  rows: [
    { id: "g_dodam", nm: "도담·서준 보호자", sub: "관련 원생 2명(형제) · 마지막 알림 어제 오후 · 알림톡 미열람" },
    { id: "g_sua", nm: "수아 보호자", sub: "관련 원생 1명 · 마지막 알림 어제 오후 · 알림톡 미열람" },
  ],
  more: "외 4명 — 전체 명단은 실 API 연결 후",
};

/* ───── 홈: 오늘 처리할 일 ─────
   미납 합계 = fixture OVERDUE 청구(민준 330,000 + 수아 531,000 정본)
   + 목업 전용 로컬 미납 3명(fixture 밖) — 정본 금액이 바뀌면 합계도 따라감 */
const overdueInvoices = fx.invoices.filter((i) => i.status === "OVERDUE");
const UNPAID_LOCAL = { count: 3, amount: 804000 }; // 목업 전용 미납분(원생 미표시)
const UNPAID_COUNT = overdueInvoices.length + UNPAID_LOCAL.count;
const UNPAID_TOTAL = overdueInvoices.reduce((s, i) => s + i.total, 0) + UNPAID_LOCAL.amount;
/* 긴급결석 = fixture attendanceNotices 정본(박민준 · "아파요") — 코치 앱과 동일 건 */
const absNotice = fx.attendanceNotices.find((n) => n.type === "ABSENCE");
const absKidName =
  fx.participants.find((p) => p.id === absNotice?.participantId)?.name ?? "";

export type TodoKey = "notice" | "unpaid" | "event" | "absence";
export interface TodoDef {
  key: TodoKey;
  icon: "mega" | "card" | "trophy" | "alert";
  hot?: boolean;
  title: string;
  sub: string;
  action: string;
  after: string;
  afterSub: string;
  bn: string; // 배너 리스트 완료 라벨
}
export const TODOS: TodoDef[] = [
  {
    key: "notice", icon: "mega", title: "공지 안 본 보호자 6명",
    sub: '"가을 대회 참가 안내" · 어제 발송 · 보호자 87명 중 6명',
    action: "다시 알림", after: "재알림 발송 완료 · 추적 중", afterSub: "다음 확인: 내일 오전 10시", bn: "재알림 ✓",
  },
  {
    key: "unpaid", icon: "card", title: `수강료 기한 초과 ${UNPAID_COUNT}명`,
    sub: `9월 시작 수납기간 ${fmtWon(UNPAID_TOTAL)} · 전원 마감 지남(연체)`,
    action: "리마인드", after: "리마인드 발송 완료 · 결제 대기", afterSub: "결제 완료 아님 — 입금 시 자동 확인", bn: "발송 ✓",
  },
  {
    key: "event", icon: "trophy", title: "대회 미응답 4명",
    sub: "강동 유소년 챔피언십 · 신청 마감 D-3",
    action: "재발송", after: "재발송 완료 · 응답 대기", afterSub: "응답이 오면 알려드려요", bn: "재발송 ✓",
  },
  {
    key: "absence", icon: "alert", hot: true, title: `긴급결석 1건 — ${absKidName}`,
    sub: `오늘 2:30 플레이2 · 사유: "${absNotice?.reason ?? ""}" · 학부모 접수`,
    action: "확인", after: "긴급결석 확인 완료", afterSub: "학부모에게 '확인했어요' 전달 — 보강 자동 생성 아님", bn: "확인 ✓",
  },
];

/* 확인 시트 내용 (notice/unpaid/event 는 시트 경유, absence 는 직접 처리) */
export const TODO_CONFIRM: Record<
  "notice" | "unpaid" | "event",
  { title: string; rows: [string, string][]; warn?: string; label: string; toast: string }
> = {
  notice: {
    title: "공지 재알림",
    rows: [["공지", "가을 대회 참가 안내"], ["안 읽은 보호자", "6명"], ["관련 원생", "7명"]],
    warn: "안 읽은 보호자에게만 다시 보냅니다.",
    label: "보호자 6명에게 다시 알림",
    toast: "재알림 발송 완료 — 안 읽은 보호자 6명",
  },
  unpaid: {
    title: "미납 리마인드",
    rows: [["대상 원생(기한 초과)", `${UNPAID_COUNT}명`], ["미납 합계", `${UNPAID_TOTAL.toLocaleString("ko-KR")}원`], ["발송 채널", "알림톡 우선 · 실패 시 SMS 대체"]],
    label: "리마인드 발송",
    toast: "리마인드 발송 완료 · 결제 대기",
  },
  event: {
    title: "대회 안내 재발송",
    rows: [["대회", "강동 유소년 챔피언십"], ["대상 원생", "4명"], ["신청 마감", "D-3"]],
    label: "4명에게 재발송",
    toast: "재발송 완료 · 응답 대기",
  },
};

/* ───── 수납: 수납 주기 옵션 ───── */
export const CYCLE_OPTS: { cy: string; label: string; sub: string }[] = [
  { cy: "월별", label: "월별", sub: "매월 1일 시작" },
  { cy: "2개월 단위", label: "2개월", sub: "격월 시작" },
  { cy: "3개월 단위", label: "3개월", sub: "현재 설정" },
  { cy: "직접 설정", label: "직접 설정", sub: "시작일 직접 지정" },
];
export const CYCLE_NEXT: Record<string, string> = {
  월별: "12월 · 12/1~12/31",
  "2개월 단위": "12~1월 · 12/1~1/31",
  "3개월 단위": "12월 시작 · 12/1~2/28",
  "직접 설정": "직접 지정 — 아래에서 입력",
};

/* ───── 수납: 반별 청구 회차 (12월 시작 기간) ───── */
export interface BillClass {
  nm: string;
  days: string;
  plan: number;
  hol: number;
  holNote: string;
  off: number;
  offNote: string;
  extra: number;
  extraNote: string;
  fin: number;
}
export const BILL_CLASSES: BillClass[] = [
  { nm: "플레이2 · 월수반", days: "월·수", plan: 24, hol: 2, holNote: "설날 2/16(월)·2/18(수)", off: 1, offNote: "12/29(월) 연말 휴무", extra: 0, extraNote: "—", fin: 21 },
  { nm: "축구 · 화금반", days: "화·금", plan: 26, hol: 1, holNote: "설날 2/17(화)", off: 1, offNote: "12/26(금) 연말 휴무", extra: 0, extraNote: "—", fin: 24 },
  { nm: "플레이3 · 화목반", days: "화·목", plan: 24, hol: 2, holNote: "성탄절 12/25(목)·설날 2/17(화)", off: 0, offNote: "—", extra: 0, extraNote: "—", fin: 22 },
  { nm: "인라인 · 토요반", days: "토", plan: 13, hol: 0, holNote: "수업 요일과 겹치는 공휴일 없음", off: 1, offNote: "12/27(토) 연말 휴무", extra: 0, extraNote: "—", fin: 12 },
];

/* ───── 수납: 청구 초안 특이 케이스 (금액 = fixture 정본과 동일) ───── */
export interface BillFlag {
  ini: string;
  gold?: boolean;
  name: string;
  sub: string;
  tag: string;
  tagTone: "warn" | "accent";
  amt: string;
}
export const BILL_FLAGS: BillFlag[] = [
  { ini: "지", gold: true, name: "최지호 — 반 변경", sub: "플레이1 → 플레이2 승급 (연령 배정)", tag: "+90,000", tagTone: "warn", amt: "₩450,000" },
  { ini: "예", gold: true, name: "한예린 — 12월 퇴원 예정", sub: "남은 회차만 부분 청구 (일할)", tag: "부분", tagTone: "warn", amt: "₩240,000" },
  { ini: "수", name: "이수아 — 다종목 할인 적용", sub: "축구+인라인 · MAX 10% 하나만", tag: "10%↓", tagTone: "accent", amt: "₩531,000" },
];

/* ───── 수납: 중간입회 계산기 ───── */
export const MJ_TOTAL = 24;
export const MJ_FEE = 540000;
export const MJ_DATES: { r: number; d: string }[] = [
  { r: 10, d: "10/28 (화)" },
  { r: 8, d: "11/4 (화)" },
  { r: 5, d: "11/14 (금)" },
];

/* ───── 수납: 미납 리마인드 타임라인 ───── */
export const REMIND_TIMELINE: { d: string; icon: "clock" | "mega" | "card" | "bell"; t: string; s: string }[] = [
  { d: "D-3", icon: "clock", t: "마감 3일 전 알림톡", s: "미결제 원생의 보호자에게만 · 11/28 예약" },
  { d: "당일", icon: "mega", t: "마감일 최종 안내", s: "12/1 (월)" },
  { d: "D+3", icon: "card", t: "문자로 전환", s: "알림톡 안 읽는 학부모 대응" },
  { d: "D+7", icon: "bell", t: "원장님께 전화 리스트", s: "이때부터만 사람이 개입해요" },
];

/* ───── 학원: 공지 대상 칩 ───── */
export const NOTICE_TARGETS: { label: string; n: number; p: number }[] = [
  { label: "전체", n: 93, p: 87 },
  { label: "플레이2만", n: 22, p: 20 },
  { label: "축구만", n: 18, p: 17 },
  { label: "인라인만", n: 12, p: 12 },
];

/* ───── 학원: 강사 — 이름은 fixture users 정본, 상태 장식은 로컬 ───── */
const COACH_ORDER = ["u_coach_ksj", "u_coach_lcj", "u_coach_park"];
const COACH_VIEW_FLAGS: Record<string, { gold?: boolean; sub: string; swap?: boolean; state?: string }> = {
  u_coach_ksj: { gold: true, sub: "플레이2 월수반 · 퇴사 예정 (마지막 근무 11/30)", swap: true },
  u_coach_lcj: { sub: "축구 화금반 · 어제 가입 완료", state: "재직" },
  u_coach_park: { sub: "플레이3 화목반 · 인라인 토요반", state: "재직" },
};
export const COACHES: { ini: string; gold?: boolean; name: string; sub: string; swap?: boolean; state?: string }[] =
  COACH_ORDER.flatMap((id) => {
    const u = fx.users.find((x) => x.id === (id as never));
    if (!u) return [];
    const v = COACH_VIEW_FLAGS[id];
    return [{
      ini: u.name[0],
      ...(v.gold ? { gold: true } : {}),
      name: `${u.name} 코치`, // 실명(정본) + 호칭(화면) 분리 — R8 피드백
      sub: v.sub,
      ...(v.swap ? { swap: true } : {}),
      ...(v.state ? { state: v.state } : {}),
    }];
  });

/* ───── 학원: 설정 항목 ───── */
export const SETTINGS_ROWS: { label: string; sub: string }[] = [
  { label: "학원 정보", sub: "원더짐 아카데미 · 브레인/액티브 2부문 · 6프로그램" },
  { label: "할인 규칙", sub: "형제20 · 다종목10 · 장기5 중 MAX 하나 × 이벤트5 · 상한 20%" },
  { label: "환불 규정", sub: "기본 환불 기준 · 적용 업종·계약 조건에 따라 확인 필요" },
  { label: "수납 주기", sub: "3개월 단위 · 3·6·9·12월 시작 (원장 설정 · 변경 가능) · 차량비 별도·무할인" },
  { label: "직원 권한", sub: "원장 1 · 데스크 1 · 코치 3 — 역할별 원생·수납·차량 접근 범위 설정" },
];

/* ───── 학원: 강사 교체 마법사 ───── */
export const SWAP_CLASSES: { cls: string; kids: number; sub: string; def: boolean }[] = [
  { cls: "플레이2 월수반", kids: 10, sub: "재원 10명 (정원 12) · 14개월 담당", def: true },
  { cls: "농구 토요 특강", kids: 8, sub: "8명 · 선택 안 하면 다른 코치에게 따로 배정", def: false },
];
export const SWAP_DATES: { date: string; prev: string; sub: string; early?: boolean }[] = [
  { date: "12/1 (월)", prev: "11/30", sub: "추천 · 김선재 마지막 근무 다음 날" },
  { date: "11/17 (월)", prev: "11/16", sub: "조기 교체 · 2주 동행 인수인계", early: true },
];
export const SWAP_REVOKES: { v: string; sub: string; def: boolean }[] = [
  { v: "마지막 수업일(11/30)에 회수", sub: "추천 · 작별 피드백 남길 시간을 줘요", def: true },
  { v: "지금 바로 원더짐 권한 회수", sub: "이 학원 담당·접근만 즉시 회수 (다른 학원 권한은 유지) · 작별 피드백은 불가", def: false },
];
export const SWAP_UNASSIGNED_OPTS = ["다른 코치 배정", "원장 임시 담당", "미배정 TODO 생성"];

/* ───── 학원: 대회 초대 순서 ───── */
export const CMP_INVITES = ["성내 유나이티드", "길동 리틀윙즈"];
