/* =========================================================
   PACEFOLIO — 본사 운영자 콘솔(Super Admin) 어댑터 (DB 없음, 프로토타입)
   ---------------------------------------------------------
   B4 전환: 플랫폼은 멀티테넌트 —
   · 원더짐(고객 0번) 관련 값(학원명·원생/보호자 수·CS 원생 이름)은
     공용 fixture(lib/fixtures = wondergym 정본)에서 파생 → 5개 앱과 일치.
   · 나머지 7개 테넌트 + 플랫폼 전용 mock은 lib/fixtures/platform.ts.
   · 원더짐 행의 지표 장식(auto·report·health·CS담당·최근접속 등)은 로컬.
   ⚠️ 비클라이언트 모듈: 데이터 배열은 반드시 여기(또는 fixtures)에서.
      "use client" 모듈에서 배열 export 금지 (x.map 직렬화 버그).
   출처: pacefolio-admin-console.html 이식. 전부 가짜값.
   ========================================================= */
import * as fx from "@/lib/fixtures";
import { PLATFORM_ACADEMIES } from "@/lib/fixtures/platform";
import type { AdminAcademy, Tone, MeterTone, Sev, CsStatus } from "@/lib/fixtures/platform";

/* 플랫폼 전용 타입·데이터는 platform fixture에서 그대로 재수출 (소비자 경로 불변) */
export type {
  Tone,
  MeterTone,
  AcademyStatus,
  AdminAcademy,
  Sev,
  FailRow,
  SentNotice,
  BannerRow,
  QaTemplate,
  CsStatus,
  SvcState,
  Service,
  MetricRowData,
  FeatureFlag,
  AuditRow,
  AtRiskRow,
  PrepModule,
} from "@/lib/fixtures/platform";
export {
  STATUS_META,
  SEV_LABEL,
  SEV_TONE,
  FAILS,
  SENT_NOTICES,
  BANNERS,
  QA_TEMPLATES,
  CS_STATUS_META,
  DASH_SERVICES,
  SYS_SERVICES,
  KEY_METRICS,
  SLA_METRICS,
  ONBOARD_FUNNEL,
  FEATURE_FLAGS,
  AUDIT,
  QUARTER_STEPS,
  AT_RISK,
  PREP_MODULES,
} from "@/lib/fixtures/platform";

/* ---------- fixture 파생 헬퍼 ---------- */
/* 원더짐 학원명 — fixture 정본 */
const WG_NAME = fx.academy.name;
/* 원생 이름 — fixture 정본 (CS 티켓 등 원더짐 원생 표기가 5개 앱과 일치) */
function pName(id: string): string {
  return fx.participants.find((p) => p.id === (id as never))?.name ?? "";
}

/* ---------- 학원(테넌트) ---------- */
/* 원더짐 행: 이름·원생 수·보호자 수 = wondergym fixture 정본 파생.
   지표(auto·report·health)·CS담당·최근접속·지역·가입일은 플랫폼 화면 장식(로컬). */
const WONDERGYM_ROW: AdminAcademy = {
  id: "wondergym",
  name: WG_NAME,
  owner: fx.academy.ownerName, // 정본 = 김도윤
  kids: fx.participants.length,
  guardians: fx.guardians.length,
  auto: 64, report: 91, health: 92, cs: "김CS", last: "방금", status: "ACTIVE", region: "강동", join: "2025-06-01",
};
export const ACADEMIES: AdminAcademy[] = [WONDERGYM_ROW, ...PLATFORM_ACADEMIES];

export function hsTone(n: number): Tone {
  return n >= 80 ? "accent" : n >= 60 ? "warn" : "danger";
}
export function hsClass(n: number): string {
  return n >= 80 ? "text-accent-ink" : n >= 60 ? "text-warn-ink" : "text-danger-ink";
}
export function acadById(id: string) {
  return ACADEMIES.find((a) => a.id === id);
}

/* ---------- 운영 작업함 ---------- */
export interface TaskInc {
  id: string;
  sev: string;
  impact: string;
  owner: string;
  st: string;
}
export interface AdminTask {
  id: string;
  sev: Sev;
  title: string;
  sub: string;
  acad: string;
  time: string;
  due: string;
  kind: "incident" | "process" | "nav";
  cta?: string;
  after?: string;
  to?: string; // 라우트 경로
  inc?: TaskInc;
}

export const TASKS: AdminTask[] = [
  { id: "t1", sev: "hot", title: "결제 승인 실패율 급증", sub: "최근 1시간 승인 실패 8건 · PG 응답 지연 의심", acad: "플랫폼 전체", time: "12분 전", due: "즉시", kind: "incident", inc: { id: "INC-2025-0142", sev: "SEV1", impact: "플랫폼 전체 결제 · 자동결제 4개 학원 지연", owner: "김운영 · 결제 인프라팀", st: "조사 중" } },
  { id: "t2", sev: "hot", title: "원더짐 안전사고 원장 미확인", sub: "플레이2 수업 중 경미 사고 보고 · 원장 확인 대기", acad: WG_NAME, time: "40분 전", due: "즉시", kind: "process", cta: "원장에게 확인 요청", after: "원장에게 확인 요청 재발송 · 추적 중" },
  { id: "t3", sev: "warn", title: "환불 승인 3일 이상 지연 2건", sub: "상호 승인 흐름에서 원장 확인 대기", acad: "강동 스포츠클럽 외 1", time: "어제", due: "오늘", kind: "nav", to: "/admin/payments" },
  { id: "t4", sev: "warn", title: "온보딩 7일 이상 정체 3곳", sub: "송파 키즈FC 9일 · 길동 4일 · 명일 특강 7일", acad: "3개 학원", time: "2일 전", due: "이번 주", kind: "nav", to: "/admin/academies" },
  { id: "t5", sev: "warn", title: "알림톡 연락처 오류 1건", sub: "보호자 연락처 오류로 청구 알림 미도달", acad: "천호 스윔", time: "3시간 전", due: "오늘", kind: "process", cta: "원장에게 정정 요청", after: "원장에게 연락처 정정 요청 발송 · 추적 중" },
  { id: "t6", sev: "norm", title: "신규 학원 승인 2곳", sub: "가입 신청 · 사업자 확인 완료", acad: "대기 2곳", time: "오늘", due: "2일 내", kind: "process", cta: "승인 처리", after: "승인 완료 · 온보딩 단계로 이동" },
  { id: "t7", sev: "norm", title: "서비스 배너 검수 3건", sub: "커머스 2 · 콘텐츠 1 — 광고 라벨 확인 필요", acad: "플랫폼", time: "오늘", due: "예약 전", kind: "nav", to: "/admin/comm" },
  { id: "t8", sev: "norm", title: "Q&A 기본 템플릿 검수 4건", sub: "환불·차량 문구 법률 표현 검토", acad: "플랫폼", time: "오늘", due: "-", kind: "nav", to: "/admin/comm" },
];

/* ---------- 수강료 관제 ---------- */
/* 원더짐 행의 12월 수납기간 수치(93명·금액)는 미래 기간 초안 mock — 로컬 유지.
   (fixture 정본은 2025 4분기 = 9월 시작 기간만 보유) */
export interface BatchRow {
  acad: string;
  period: string;
  kids: string;
  amount: string;
  confirm: { label: string; tone: Tone };
  reach: string;
  paid: string;
  paidTone?: boolean;
  unpaid: { label: string; tone: Tone } | null;
}
export const BATCHES: BatchRow[] = [
  { acad: "명일 태권", period: "12월 시작 수납기간", kids: "210", amount: "₩61,740,000", confirm: { label: "확정", tone: "accent" }, reach: "210 / 198", paid: "205", paidTone: true, unpaid: { label: "5", tone: "danger" } },
  { acad: "천호 스윔", period: "12월 시작 수납기간", kids: "120", amount: "₩33,600,000", confirm: { label: "확정", tone: "accent" }, reach: "120 / 101", paid: "96", paidTone: true, unpaid: { label: "24", tone: "danger" } },
  { acad: WG_NAME, period: "12월 시작 수납기간", kids: "93", amount: "₩27,342,000", confirm: { label: "검토 대기", tone: "warn" }, reach: "초안", paid: "-", unpaid: null },
  { acad: "강동 스포츠클럽", period: "12월 시작 수납기간", kids: "47", amount: "-", confirm: { label: "초안 오류 2건", tone: "danger" }, reach: "-", paid: "-", unpaid: null },
];

export interface AutopayRow { acad: string; pct: number; tone: MeterTone }
export const AUTOPAY: AutopayRow[] = [
  { acad: "명일 태권", pct: 68, tone: "normal" },
  { acad: "성내 브레인짐", pct: 72, tone: "normal" },
  { acad: WG_NAME, pct: 64, tone: "normal" },
  { acad: "천호 스윔", pct: 55, tone: "low" },
  { acad: "강동 스포츠클럽", pct: 38, tone: "low" },
];

export interface RefundRow {
  who: string;
  acad: string;
  amount: string;
  stage: { label: string; tone: Tone };
  delay: string;
}
export const REFUNDS: RefundRow[] = [
  { who: "이○○ 보호자", acad: "강동 스포츠클럽", amount: "191,250원", stage: { label: "원장 확인 대기", tone: "warn" }, delay: "3일" },
  { who: "김○○ 보호자", acad: "천호 스윔", amount: "132,000원", stage: { label: "보호자 확인 대기", tone: "warn" }, delay: "4일" },
  { who: "박○○ 보호자", acad: WG_NAME, amount: "88,500원", stage: { label: "환불 완료", tone: "accent" }, delay: "-" },
];

/* ---------- CS · 지원 ---------- */
/* 원더짐 티켓의 원생 이름은 fixture 정본 파생 — 코치/원장/학부모 앱과 동일 인물 */
export interface CsTicket {
  id: string;
  who: string;
  role: "원장" | "보호자";
  acad: string;
  subj: string;
  type: string;
  sla: string;
  st: CsStatus;
}
export const CS: CsTicket[] = [
  { id: "c1", who: "박관장", role: "원장", acad: "강동 스포츠클럽", subj: "청구서 금액이 실제와 다르게 표시돼요", type: "결제 문의", sla: "2시간 남음", st: "NEW" },
  { id: "c2", who: `${pName("p_dodam")} 보호자`, role: "보호자", acad: WG_NAME, subj: "자동결제 등록이 안 됩니다", type: "결제 문의", sla: "오늘", st: "ASSIGNED" },
  { id: "c3", who: "최코치", role: "원장", acad: "송파 키즈FC", subj: "온보딩 중 반 시간표 저장 오류", type: "기술 장애", sla: "4시간", st: "IN_PROGRESS" },
  { id: "c4", who: `${pName("p_seojun")} 보호자`, role: "보호자", acad: WG_NAME, subj: "환불은 어떻게 신청하나요?", type: "환불 문의", sla: "내일", st: "WAITING" },
  { id: "c5", who: "오원장", role: "원장", acad: "천호 스윔", subj: "개인정보 다운로드 요청", type: "개인정보 요청", sla: "3일", st: "NEW" },
];

/* ---------- 대시보드: 분기 캘린더 학원별 진행 ---------- */
export interface CalendarRow {
  acad: string;
  draft: { label: string; tone: Tone };
  ownerCheck: { label: string; tone: Tone };
  send: { label: string; tone: Tone };
  note: string;
  noteTone: Tone;
}
export const CALENDAR_ROWS: CalendarRow[] = [
  { acad: WG_NAME, draft: { label: "완료", tone: "accent" }, ownerCheck: { label: "완료", tone: "accent" }, send: { label: "대기", tone: "warn" }, note: "순조", noteTone: "muted" },
  { acad: "강동 스포츠클럽", draft: { label: "오류 2건", tone: "danger" }, ownerCheck: { label: "미생성", tone: "muted" }, send: { label: "-", tone: "muted" }, note: "확인 필요", noteTone: "danger" },
  { acad: "송파 키즈FC", draft: { label: "미완료", tone: "warn" }, ownerCheck: { label: "-", tone: "muted" }, send: { label: "-", tone: "muted" }, note: "온보딩 중", noteTone: "warn" },
];

export function openTaskCount() {
  return TASKS.length; // 데모: 초기 미처리 8건
}
export function csNewCount() {
  return CS.filter((c) => c.st === "NEW").length;
}
