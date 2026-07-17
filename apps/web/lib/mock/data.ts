/* =========================================================
   PACEFOLIO — 가짜 데이터 (DB 없음, 프로토타입 전용)
   도메인: 아카데미 › 부문 › 프로그램 › 반 › 등록
           부모 ↔ 자녀 1:N (아이는 계정 없음)
           결제 분기제(3·6·9·12), 기본 월납
   ⚠️ 헌법: 목업 확정 전 DB 착공 금지 — 여긴 전부 mock
   ========================================================= */

export type ID = string;

export interface Academy {
  id: ID;
  name: string;
  themeColor: string; // 학원별 테마 (--accent override)
  themeInk: string;
  logoEmoji: string;
  ownerName: string;
}

export interface Program {
  id: ID;
  academyId: ID;
  division: "브레인" | "액티브";
  name: string;
  ageLabel: string;
  color: string;
}

export interface ClassRoom {
  id: ID;
  programId: ID;
  name: string;
  daysLabel: string; // "월·수·금"
  perWeek: number;
  time: string;
  coachName: string;
  capacity: number;
  enrolled: number;
}

export interface Child {
  id: ID;
  name: string;
  birth: string;
  ageLabel: string;
  parentId: ID;
  classIds: ID[];
  avatarColor: string;
}

export interface Parent {
  id: ID;
  name: string;
  phone: string;
  childIds: ID[];
}

export type PaymentStatus = "paid" | "due" | "overdue" | "scheduled";
export interface Payment {
  id: ID;
  childId: ID;
  title: string;
  period: string; // "2026 3분기" 또는 "7월"
  amount: number;
  status: PaymentStatus;
  dueDate: string;
  method: "auto" | "manual";
}

export type NoticeKind = "class" | "pay" | "notice" | "praise";
export interface Notification {
  id: ID;
  kind: NoticeKind;
  title: string;
  body: string;
  time: string;
  unread: boolean;
}

/* ---------------- 원더짐 (고객 0번) ---------------- */

export const academy: Academy = {
  id: "wondergym",
  name: "원더짐",
  themeColor: "#12b5a5",
  themeInk: "#0e9384",
  logoEmoji: "🤸",
  ownerName: "김원장",
};

export const programs: Program[] = [
  { id: "p-play1", academyId: "wondergym", division: "액티브", name: "플레이 1", ageLabel: "5~6세", color: "#12b5a5" },
  { id: "p-play2", academyId: "wondergym", division: "액티브", name: "플레이 2", ageLabel: "7~8세", color: "#3b82f6" },
  { id: "p-play3", academyId: "wondergym", division: "액티브", name: "플레이 3", ageLabel: "9~10세", color: "#8b5cf6" },
  { id: "p-inline", academyId: "wondergym", division: "액티브", name: "인라인", ageLabel: "6세~", color: "#f97316" },
  { id: "p-soccer", academyId: "wondergym", division: "액티브", name: "축구", ageLabel: "7세~", color: "#22c55e" },
];

export const classes: ClassRoom[] = [
  { id: "c-play2-mwf", programId: "p-play2", name: "플레이2 월수금 4시반", daysLabel: "월·수·금", perWeek: 3, time: "16:00~16:50", coachName: "김선재", capacity: 12, enrolled: 10 },
  { id: "c-play2-tt", programId: "p-play2", name: "플레이2 화목 5시반", daysLabel: "화·목", perWeek: 2, time: "17:00~17:50", coachName: "이도현", capacity: 12, enrolled: 8 },
  { id: "c-inline-tt", programId: "p-inline", name: "인라인 화목 4시반", daysLabel: "화·목", perWeek: 2, time: "16:00~16:50", coachName: "박정우", capacity: 10, enrolled: 9 },
  { id: "c-soccer-sat", programId: "p-soccer", name: "축구 토요반", daysLabel: "토", perWeek: 1, time: "10:00~11:20", coachName: "이창진", capacity: 16, enrolled: 14 },
];

export const parents: Parent[] = [
  { id: "pa-1", name: "이서연", phone: "010-1234-5678", childIds: ["ch-1", "ch-2"] },
  { id: "pa-2", name: "최민호", phone: "010-2222-3333", childIds: ["ch-3"] },
];

export const children: Child[] = [
  { id: "ch-1", name: "김지호", birth: "2018-04-12", ageLabel: "8세", parentId: "pa-1", classIds: ["c-play2-mwf"], avatarColor: "#12b5a5" },
  { id: "ch-2", name: "김지아", birth: "2020-09-03", ageLabel: "6세", parentId: "pa-1", classIds: ["c-inline-tt"], avatarColor: "#f97316" },
  { id: "ch-3", name: "최윤서", birth: "2017-11-20", ageLabel: "9세", parentId: "pa-2", classIds: ["c-soccer-sat", "c-play2-tt"], avatarColor: "#8b5cf6" },
];

export const payments: Payment[] = [
  { id: "py-1", childId: "ch-1", title: "플레이2 수강료", period: "2026 3분기", amount: 480000, status: "due", dueDate: "2026-07-05", method: "manual" },
  { id: "py-2", childId: "ch-2", title: "인라인 수강료", period: "7월", amount: 160000, status: "paid", dueDate: "2026-07-03", method: "auto" },
  { id: "py-3", childId: "ch-3", title: "축구 수강료", period: "7월", amount: 120000, status: "overdue", dueDate: "2026-06-28", method: "manual" },
  { id: "py-4", childId: "ch-3", title: "플레이2 수강료", period: "7월", amount: 180000, status: "scheduled", dueDate: "2026-07-25", method: "auto" },
];

export const notifications: Notification[] = [
  { id: "n-1", kind: "praise", title: "오늘 수업 완료 👏", body: "지호가 전방구르기를 혼자 성공했어요!", time: "방금", unread: true },
  { id: "n-2", kind: "pay", title: "3분기 수강료 안내", body: "플레이2 480,000원 · 7/5까지", time: "1시간 전", unread: true },
  { id: "n-3", kind: "class", title: "화목 인라인 안내", body: "내일(목) 헬멧 꼭 챙겨주세요.", time: "어제", unread: false },
  { id: "n-4", kind: "notice", title: "여름 특강 신청 오픈", body: "8월 물놀이 체육 특강 접수 시작.", time: "2일 전", unread: false },
];

/* ---------------- 조회 헬퍼 ---------------- */

export const money = (n: number) => n.toLocaleString("ko-KR") + "원";

export const programOf = (classId: ID) => {
  const c = classes.find((x) => x.id === classId);
  return programs.find((p) => p.id === c?.programId);
};

export const classOf = (classId: ID) => classes.find((c) => c.id === classId);

export const childrenOf = (parentId: ID) =>
  children.filter((c) => c.parentId === parentId);

export const paymentsOf = (childId: ID) =>
  payments.filter((p) => p.childId === childId);

export const statusMeta: Record<
  PaymentStatus,
  { label: string; tone: "accent" | "warn" | "danger" | "muted" }
> = {
  paid: { label: "납부완료", tone: "accent" },
  due: { label: "청구중", tone: "warn" },
  overdue: { label: "미납", tone: "danger" },
  scheduled: { label: "자동결제 예정", tone: "muted" },
};

/* 멀티테넌트 데모 — 플랫폼(관리자 콘솔)에 입주한 학원들 */
export interface Tenant {
  id: ID;
  name: string;
  emoji: string;
  plan: "Basic" | "Pro";
  students: number;
  mrr: number;
  color: string;
  status: "active" | "trial";
}

export const tenants: Tenant[] = [
  { id: "wondergym", name: "원더짐", emoji: "🤸", plan: "Pro", students: 62, mrr: 890000, color: "#12b5a5", status: "active" },
  { id: "jump", name: "점프키즈", emoji: "🤾", plan: "Basic", students: 38, mrr: 420000, color: "#f97316", status: "active" },
  { id: "aqua", name: "아쿠아스포츠", emoji: "🏊", plan: "Pro", students: 91, mrr: 1240000, color: "#3b82f6", status: "trial" },
];

/* 원장 대시보드용 집계 (mock) */
export const ownerStats = {
  studentCount: 62,
  activeClasses: 8,
  autoPayRate: 0.71, // 북극성: 자동결제 등록률
  monthRevenue: 8940000,
  unpaidCount: 4,
  unpaidAmount: 720000,
};
