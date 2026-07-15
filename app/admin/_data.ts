/* =========================================================
   PACEFOLIO 본사 운영자 콘솔 (Super Admin) — 데모 mock
   ⚠️ 비클라이언트 모듈: 데이터 배열은 반드시 여기(또는 lib/mock/data)에서.
      "use client" 모듈에서 배열 export 금지 (x.map 직렬화 버그).
   출처: pacefolio-admin-console.html 이식. 전부 가짜값.
   ========================================================= */

export type Tone = "accent" | "warn" | "danger" | "muted" | "gold" | "info";
export type MeterTone = "normal" | "low" | "full";

/* ---------- 학원(테넌트) ---------- */
export type AcademyStatus =
  | "ACTIVE"
  | "ONBOARDING"
  | "TRIAL"
  | "AT_RISK"
  | "SUSPENDED";

export interface AdminAcademy {
  id: string;
  name: string;
  owner: string;
  kids: number;
  guardians: number;
  auto: number;
  report: number;
  health: number;
  cs: string;
  last: string;
  status: AcademyStatus;
  region: string;
  join: string;
  onboard?: string;
}

export const STATUS_META: Record<AcademyStatus, { ko: string; tone: Tone }> = {
  ACTIVE: { ko: "활성", tone: "accent" },
  ONBOARDING: { ko: "온보딩", tone: "warn" },
  TRIAL: { ko: "체험", tone: "warn" },
  AT_RISK: { ko: "이탈위험", tone: "danger" },
  SUSPENDED: { ko: "정지", tone: "muted" },
};

export const ACADEMIES: AdminAcademy[] = [
  { id: "wondergym", name: "원더짐 아카데미", owner: "김원장", kids: 93, guardians: 87, auto: 64, report: 91, health: 92, cs: "김CS", last: "방금", status: "ACTIVE", region: "강동", join: "2025-06-01" },
  { id: "gangdong", name: "강동 스포츠클럽", owner: "박관장", kids: 47, guardians: 44, auto: 38, report: 61, health: 71, cs: "이CS", last: "2일 전", status: "AT_RISK", region: "강동", join: "2025-05-12" },
  { id: "songpa", name: "송파 키즈FC", owner: "최코치", kids: 12, guardians: 11, auto: 0, report: 20, health: 43, cs: "김CS", last: "9일 전", status: "ONBOARDING", region: "송파", join: "2025-10-18", onboard: "3/13 · 9일 정체" },
  { id: "seongnae", name: "성내 브레인짐", owner: "정원장", kids: 68, guardians: 64, auto: 72, report: 88, health: 88, cs: "이CS", last: "1시간 전", status: "ACTIVE", region: "성내", join: "2025-04-20" },
  { id: "gildong", name: "길동 리틀윙즈", owner: "한원장", kids: 8, guardians: 8, auto: 0, report: 0, health: 0, cs: "김CS", last: "4일 전", status: "TRIAL", region: "길동", join: "2025-10-20" },
  { id: "cheonho", name: "천호 스윔", owner: "오원장", kids: 120, guardians: 113, auto: 55, report: 79, health: 81, cs: "이CS", last: "오늘", status: "ACTIVE", region: "천호", join: "2025-03-02" },
  { id: "dunchon", name: "둔촌 농구클럽", owner: "신원장", kids: 0, guardians: 0, auto: 0, report: 0, health: 0, cs: "김CS", last: "14일 전", status: "SUSPENDED", region: "둔촌", join: "2025-02-15" },
  { id: "myeongil", name: "명일 태권", owner: "유관장", kids: 210, guardians: 198, auto: 68, report: 93, health: 95, cs: "이CS", last: "30분 전", status: "ACTIVE", region: "명일", join: "2025-09-01" },
];

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
export type Sev = "hot" | "warn" | "norm";
export const SEV_LABEL: Record<Sev, string> = { hot: "긴급", warn: "주의", norm: "일반" };
export const SEV_TONE: Record<Sev, Tone> = { hot: "danger", warn: "warn", norm: "muted" };

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
  { id: "t2", sev: "hot", title: "원더짐 안전사고 원장 미확인", sub: "플레이2 수업 중 경미 사고 보고 · 원장 확인 대기", acad: "원더짐 아카데미", time: "40분 전", due: "즉시", kind: "process", cta: "원장에게 확인 요청", after: "원장에게 확인 요청 재발송 · 추적 중" },
  { id: "t3", sev: "warn", title: "환불 승인 3일 이상 지연 2건", sub: "상호 승인 흐름에서 원장 확인 대기", acad: "강동 스포츠클럽 외 1", time: "어제", due: "오늘", kind: "nav", to: "/admin/payments" },
  { id: "t4", sev: "warn", title: "온보딩 7일 이상 정체 3곳", sub: "송파 키즈FC 9일 · 길동 4일 · 명일 특강 7일", acad: "3개 학원", time: "2일 전", due: "이번 주", kind: "nav", to: "/admin/academies" },
  { id: "t5", sev: "warn", title: "알림톡 연락처 오류 1건", sub: "보호자 연락처 오류로 청구 알림 미도달", acad: "천호 스윔", time: "3시간 전", due: "오늘", kind: "process", cta: "원장에게 정정 요청", after: "원장에게 연락처 정정 요청 발송 · 추적 중" },
  { id: "t6", sev: "norm", title: "신규 학원 승인 2곳", sub: "가입 신청 · 사업자 확인 완료", acad: "대기 2곳", time: "오늘", due: "2일 내", kind: "process", cta: "승인 처리", after: "승인 완료 · 온보딩 단계로 이동" },
  { id: "t7", sev: "norm", title: "서비스 배너 검수 3건", sub: "커머스 2 · 콘텐츠 1 — 광고 라벨 확인 필요", acad: "플랫폼", time: "오늘", due: "예약 전", kind: "nav", to: "/admin/comm" },
  { id: "t8", sev: "norm", title: "Q&A 기본 템플릿 검수 4건", sub: "환불·차량 문구 법률 표현 검토", acad: "플랫폼", time: "오늘", due: "-", kind: "nav", to: "/admin/comm" },
];

/* ---------- 수강료 관제 ---------- */
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
  { acad: "원더짐 아카데미", period: "12월 시작 수납기간", kids: "93", amount: "₩27,342,000", confirm: { label: "검토 대기", tone: "warn" }, reach: "초안", paid: "-", unpaid: null },
  { acad: "강동 스포츠클럽", period: "12월 시작 수납기간", kids: "47", amount: "-", confirm: { label: "초안 오류 2건", tone: "danger" }, reach: "-", paid: "-", unpaid: null },
];

export interface FailRow {
  who: string;
  acad: string;
  reason: string;
  amt: string;
  st: string;
}
export const FAILS: FailRow[] = [
  { who: "김○○ 보호자", acad: "명일 태권", reason: "카드 한도 초과", amt: "294,000원", st: "재시도 예약" },
  { who: "이○○ 보호자", acad: "천호 스윔", reason: "카드 만료", amt: "280,000원", st: "보호자 안내 발송" },
  { who: "박○○ 보호자", acad: "명일 태권", reason: "잔액 부족", amt: "294,000원", st: "재시도 대기" },
  { who: "정○○ 보호자", acad: "천호 스윔", reason: "PG 일시 오류", amt: "280,000원", st: "자동 재시도 중" },
];

export interface AutopayRow { acad: string; pct: number; tone: MeterTone }
export const AUTOPAY: AutopayRow[] = [
  { acad: "명일 태권", pct: 68, tone: "normal" },
  { acad: "성내 브레인짐", pct: 72, tone: "normal" },
  { acad: "원더짐 아카데미", pct: 64, tone: "normal" },
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
  { who: "박○○ 보호자", acad: "원더짐 아카데미", amount: "88,500원", stage: { label: "환불 완료", tone: "accent" }, delay: "-" },
];

/* ---------- 커뮤니케이션 ---------- */
export interface SentNotice {
  title: string;
  sub: string;
  st: { label: string; tone: Tone };
  warn?: boolean;
}
export const SENT_NOTICES: SentNotice[] = [
  { title: "신규 기능: 학부모 앱 Q&A", sub: "전체 학원 · 어제 · 열람 9/12곳", st: { label: "게시", tone: "accent" } },
  { title: "개인정보 처리방침 개정", sub: "원장 · 3일 전 · 열람 12/12곳", st: { label: "게시", tone: "accent" } },
  { title: "11월 정기 점검 안내", sub: "전체 · 예약 발송 대기", st: { label: "예약", tone: "warn" }, warn: true },
];

export interface BannerRow {
  name: string;
  type: string;
  target: string;
  period: string;
  ad: boolean;
  st: { label: string; tone: Tone };
  action: "perf" | "review" | "reserve";
}
export const BANNERS: BannerRow[] = [
  { name: "겨울 캠프 콘텐츠", type: "콘텐츠", target: "보호자 전체", period: "~ 12/24", ad: false, st: { label: "게시중", tone: "accent" }, action: "perf" },
  { name: "인라인 보호장비", type: "커머스", target: "액티브 부문 학원", period: "~ 11/30", ad: true, st: { label: "검수 대기", tone: "warn" }, action: "review" },
  { name: "물놀이 안전 콘텐츠", type: "콘텐츠", target: "수영 프로그램 학원", period: "예약", ad: false, st: { label: "게시 예약", tone: "warn" }, action: "reserve" },
];

export interface QaTemplate {
  q: string;
  sub: string;
  usage: string;
  st: "posted" | "review" | "draft";
  flag?: string;
}
export const QA_TEMPLATES: QaTemplate[] = [
  { q: "출결 · 보강", sub: "결석 통보·보강 신청 흐름 안내", usage: "12개 학원 사용중", st: "posted" },
  { q: "수강료 · 자동결제", sub: "분기제·자동결제 등록 안내", usage: "11개 학원 사용중", st: "posted" },
  { q: "환불", sub: "법정 기준·상호 승인 문구", usage: "법률 표현 검토 요청", st: "review", flag: "법률 표현 검토 요청" },
  { q: "차량", sub: "차량비 별도·무할인 안내", usage: "문구 검토 요청", st: "review", flag: "문구 검토 요청" },
  { q: "준비물 · 안전", sub: "준비물 자동안내·안전 보험 안내", usage: "초안", st: "draft" },
];

/* ---------- CS · 지원 ---------- */
export type CsStatus = "NEW" | "ASSIGNED" | "IN_PROGRESS" | "WAITING" | "RESOLVED";
export const CS_STATUS_META: Record<CsStatus, { ko: string; tone: Tone }> = {
  NEW: { ko: "신규", tone: "danger" },
  ASSIGNED: { ko: "배정됨", tone: "warn" },
  IN_PROGRESS: { ko: "처리중", tone: "warn" },
  WAITING: { ko: "고객 대기", tone: "muted" },
  RESOLVED: { ko: "해결", tone: "accent" },
};
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
  { id: "c2", who: "김도담 보호자", role: "보호자", acad: "원더짐 아카데미", subj: "자동결제 등록이 안 됩니다", type: "결제 문의", sla: "오늘", st: "ASSIGNED" },
  { id: "c3", who: "최코치", role: "원장", acad: "송파 키즈FC", subj: "온보딩 중 반 시간표 저장 오류", type: "기술 장애", sla: "4시간", st: "IN_PROGRESS" },
  { id: "c4", who: "이서준 보호자", role: "보호자", acad: "원더짐 아카데미", subj: "환불은 어떻게 신청하나요?", type: "환불 문의", sla: "내일", st: "WAITING" },
  { id: "c5", who: "오원장", role: "원장", acad: "천호 스윔", subj: "개인정보 다운로드 요청", type: "개인정보 요청", sla: "3일", st: "NEW" },
];

/* ---------- 시스템 · 감사 ---------- */
export type SvcState = "ok" | "warn" | "down";
export interface Service { name: string; state: SvcState; label: string }
export const DASH_SERVICES: Service[] = [
  { name: "결제 승인", state: "ok", label: "정상" },
  { name: "API · 로그인", state: "ok", label: "정상" },
  { name: "알림톡 발송", state: "warn", label: "지연" },
  { name: "자동결제", state: "ok", label: "정상" },
  { name: "파일 · 사진", state: "ok", label: "정상" },
];
export const SYS_SERVICES: Service[] = [
  { name: "로그인 · 인증", state: "ok", label: "정상" },
  { name: "API", state: "ok", label: "정상" },
  { name: "PostgreSQL", state: "ok", label: "정상" },
  { name: "파일 업로드 · 사진", state: "ok", label: "정상" },
  { name: "알림톡", state: "warn", label: "지연 (평균 40초)" },
  { name: "SMS · 앱 푸시", state: "ok", label: "정상" },
  { name: "PG 승인 · 자동결제", state: "ok", label: "정상" },
  { name: "백그라운드 작업 · 백업", state: "ok", label: "정상" },
];

export interface MetricRowData { label: string; pct: number; value: string; tone: MeterTone }
export const KEY_METRICS: MetricRowData[] = [
  { label: "활성 학원 유지율", pct: 92, value: "92%", tone: "normal" },
  { label: "주간 활성 원장", pct: 83, value: "83%", tone: "normal" },
  { label: "리포트 발송률", pct: 88, value: "88%", tone: "normal" },
  { label: "Q&A 자체 해결률", pct: 71, value: "71%", tone: "normal" },
  { label: "결석 앱 접수율", pct: 79, value: "79%", tone: "normal" },
];
export const SLA_METRICS: MetricRowData[] = [
  { label: "수업 3시간 전 알림", pct: 99.6, value: "99.6%", tone: "normal" },
  { label: "결석 알림 전달", pct: 100, value: "100%", tone: "normal" },
  { label: "리포트 발송", pct: 88, value: "88%", tone: "normal" },
  { label: "청구서 도달", pct: 97, value: "97%", tone: "normal" },
  { label: "결제 승인 성공", pct: 97.8, value: "97.8%", tone: "normal" },
];
export const ONBOARD_FUNNEL: MetricRowData[] = [
  { label: "계정 생성 → 원생 등록", pct: 83, value: "83%", tone: "normal" },
  { label: "원생 등록 → 첫 청구", pct: 58, value: "58%", tone: "low" },
  { label: "첫 청구 → 첫 자동결제", pct: 41, value: "41%", tone: "low" },
];

export interface FeatureFlag { name: string; desc?: string; scope: string; tone: Tone }
export const FEATURE_FLAGS: FeatureFlag[] = [
  { name: "FEATURE_PARENT_QA", desc: "학부모 앱 Q&A", scope: "전체 학원", tone: "accent" },
  { name: "FEATURE_AUTO_PAYMENT", scope: "전체 학원", tone: "accent" },
  { name: "FEATURE_MONTHLY_SCHEDULE", desc: "월 시간표", scope: "원더짐 · 파일럿", tone: "warn" },
  { name: "FEATURE_COMMERCE_BANNER", scope: "내부 직원만", tone: "muted" },
];

export interface AuditRow { t: string; op: string; acad: string; act: string; tgt: string; why: string }
export const AUDIT: AuditRow[] = [
  { t: "10:41", op: "김운영", acad: "강동 스포츠클럽", act: "지원 보기 시작", tgt: "원장 콘솔(읽기전용)", why: "청구 초안 오류 확인 · CS-2025-00124" },
  { t: "10:12", op: "이운영", acad: "천호 스윔", act: "개인정보 열람", tgt: "보호자 연락처 1건", why: "알림 실패 정정 · 마스킹 해제 로그" },
  { t: "09:38", op: "김운영", acad: "플랫폼", act: "기능 플래그 변경", tgt: "FEATURE_MONTHLY_SCHEDULE → 원더짐", why: "파일럿 확대" },
  { t: "09:05", op: "박운영", acad: "명일 태권", act: "환불 정책 검증", tgt: "법정 기준 대비", why: "정기 점검 · 위반 없음" },
];

/* ---------- 대시보드 ---------- */
export interface CalendarRow {
  acad: string;
  draft: { label: string; tone: Tone };
  ownerCheck: { label: string; tone: Tone };
  send: { label: string; tone: Tone };
  note: string;
  noteTone: Tone;
}
export const QUARTER_STEPS = [
  { d: "D-21", label: "학원 설정 검토", now: true },
  { d: "D-14", label: "청구 초안 생성", now: false },
  { d: "D-10", label: "원장 검토", now: false },
  { d: "D-7", label: "발송 시작", now: false },
  { d: "D-3", label: "미열람 확인", now: false },
  { d: "D-Day", label: "자동결제", now: false },
  { d: "D+3", label: "실패 재시도", now: false },
  { d: "D+7", label: "예외 처리", now: false },
];
export const CALENDAR_ROWS: CalendarRow[] = [
  { acad: "원더짐 아카데미", draft: { label: "완료", tone: "accent" }, ownerCheck: { label: "완료", tone: "accent" }, send: { label: "대기", tone: "warn" }, note: "순조", noteTone: "muted" },
  { acad: "강동 스포츠클럽", draft: { label: "오류 2건", tone: "danger" }, ownerCheck: { label: "미생성", tone: "muted" }, send: { label: "-", tone: "muted" }, note: "확인 필요", noteTone: "danger" },
  { acad: "송파 키즈FC", draft: { label: "미완료", tone: "warn" }, ownerCheck: { label: "-", tone: "muted" }, send: { label: "-", tone: "muted" }, note: "온보딩 중", noteTone: "warn" },
];

export interface AtRiskRow { id: string; name: string; sub: string; tone: "hot" | "warn" }
export const AT_RISK: AtRiskRow[] = [
  { id: "songpa", name: "송파 키즈FC", sub: "헬스 43 · 온보딩 9일 정체 · 청구 초안 미생성", tone: "hot" },
  { id: "gangdong", name: "강동 스포츠클럽", sub: "헬스 71 · 자동결제율 38% · 리포트 발송 61%", tone: "warn" },
];

/* 확장 · 준비 중 모듈 (사이드바 "확장 · 준비 중" 섹션) */
export interface PrepModule { name: string; desc: string; href?: string }
export const PREP_MODULES: PrepModule[] = [
  { name: "PACEFOLIO 구독 관리", desc: "학원 과금·플랜·MRR", href: "/admin/billing" },
  { name: "사용자 · 권한 관리", desc: "역할·접근 제어", href: "/admin/users" },
  { name: "플랫폼 설정 · 정책", desc: "환불 하한·할인 상한·분기 캘린더", href: "/admin/settings" },
  { name: "개인정보 요청 처리", desc: "열람·삭제·다운로드" },
  { name: "콘텐츠 · 활동 라이브러리", desc: "활동 블록 · 커리큘럼" },
  { name: "커머스 운영 (직영 스토어)", desc: "페이스폴리오 직영" },
];

export function openTaskCount() {
  return TASKS.length; // 데모: 초기 미처리 8건
}
export function csNewCount() {
  return CS.filter((c) => c.st === "NEW").length;
}
