/* =========================================================
   PACEFOLIO 원장 앱 — 목업(pacefolio-owner-app.html) 이식용 mock
   공용 lib/mock/data.ts 는 건드리지 않고, 목업의 풍부한 데이터를
   여기 별도 모듈로 둔다. (plain 모듈 — "use client" 아님)
   ========================================================= */

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

export const KIDS: Kid[] = [
  {
    id: "dodam", nm: "김도담", em: "🧒", age: 8, cls: "플레이2 월수반", coach: "김선재",
    status: "재원", parent: "010-****-1234 (어머님)", sib: "김서준 (동생) · 같은 보호자 연결",
    pay: "완납", payDetail: "₩405,000 · 수강료 360,000 + 차량 45,000 · 원생별 분리 청구", makeup: 2,
    veh: { ride: "래미안아파트 정문 · 2:40 탑승", drop: "같은 곳 · 5:10 하원", seat: "주니어 카시트 필수 · 멀미 있어 앞좌석 선호" },
    makeups: [
      { t: "10/13 (학원 휴무 대체)", s: "보강일 미지정 · 학부모 요청 있음" },
      { t: "10/16 결석 (병원)", s: "긴급결석 처리됨 · 원장 처리 전" },
    ],
  },
  {
    id: "seojun", nm: "김서준", em: "👦", age: 7, cls: "플레이2 월수반", coach: "김선재",
    status: "재원", parent: "010-****-1234 (어머님)", sib: "김도담 (형) · 같은 보호자 연결",
    pay: "완납", payDetail: "₩333,000 · 수강료 288,000(형제 20%) + 차량 45,000", makeup: 0,
    veh: { ride: "래미안아파트 정문 · 2:40 탑승 (형과 동승)", drop: "같은 곳 · 5:10 하원", seat: "주니어 카시트 필수" },
  },
  {
    id: "minjun", nm: "박민준", em: "🧒", age: 8, cls: "플레이2 월수반", coach: "김선재",
    status: "재원", parent: "010-****-5678 (어머님)",
    pay: "미납", payDetail: "₩330,000 · 마감 6일 지남 · 리마인드 2회", makeup: 0,
    veh: null, alert: "⚠️ 견과류 알러지",
  },
  {
    id: "hayun", nm: "정하윤", em: "👧", age: 8, cls: "플레이2 월수반", coach: "김선재",
    status: "재원", parent: "010-****-2345 (아버님)",
    pay: "완납", payDetail: "₩360,000 · 자동결제", makeup: 0, veh: null,
  },
  {
    id: "sua", nm: "이수아", em: "👧", age: 9, cls: "축구 화금반 + 인라인", coach: "이창진",
    status: "재원", parent: "010-****-8765 (어머님)",
    pay: "미납", payDetail: "₩486,000 · 다종목 10% 적용가", makeup: 0,
    veh: { ride: "한빛초 후문 · 3:50 탑승", drop: "홈플러스 앞 · 6:20 하원", seat: "특이사항 없음" },
  },
  {
    id: "jiho", nm: "최지호", em: "👦", age: 7, cls: "플레이2 월수반", coach: "김선재",
    status: "재원", parent: "010-****-9012 (어머님)",
    pay: "완납", payDetail: "₩450,000 · 플레이1→2 승급 반영", makeup: 0, veh: null,
  },
  {
    id: "yerin", nm: "한예린", em: "👧", age: 10, cls: "축구 화금반", coach: "이창진",
    status: "퇴원 예정", parent: "010-****-3456 (어머님)",
    pay: "완납", payDetail: "₩240,000 · 12월 퇴원 예정 (부분 청구)", makeup: 0, veh: null,
  },
  {
    id: "ian", nm: "최이안", em: "🧒", age: 7, cls: "축구 화금반", coach: "이창진",
    status: "재원", parent: "010-****-7890 (아버님)",
    pay: "일할 청구", payDetail: "₩225,000 · 10/28 입회 · 남은 실제 수업 10회", makeup: 0,
    veh: { ride: "강동도서관 앞 · 3:50 탑승", drop: "같은 곳 · 6:20 하원", seat: "신규 — 첫 주 동승 확인 필요" },
  },
];

export const kidById = (id: string) => KIDS.find((k) => k.id === id);

/* ───── 홈: 반별 정원 현황 ───── */
export type MeterTone = "ok" | "full" | "low";
export interface CapMeter {
  nm: string;
  sub: string;
  cur: number;
  cap: number;
  note: string;
  tone: MeterTone;
  recruit?: boolean;
}
export const CAP_METERS: CapMeter[] = [
  { nm: "플레이2 · 월수반", sub: "브레인 · 김선재", cur: 10, cap: 12, note: "10 / 12", tone: "ok" },
  { nm: "플레이2 · 유아반", sub: "브레인 · 이코치", cur: 12, cap: 12, note: "12 / 12", tone: "full" },
  { nm: "축구 · 화금반", sub: "액티브 · 이창진", cur: 16, cap: 16, note: "16 / 16 · 대기 2", tone: "full" },
  { nm: "플레이3 · 화목반", sub: "브레인 · 박코치", cur: 11, cap: 12, note: "11 / 12", tone: "ok" },
  { nm: "인라인 토요반", sub: "액티브 · 박코치", cur: 5, cap: 12, note: "5 / 12 · 42%", tone: "low", recruit: true },
  { nm: "농구 · 토요특강", sub: "액티브 · 김선재", cur: 8, cap: 12, note: "8 / 12", tone: "ok" },
];

/* ───── 홈: 오늘 처리할 일 ───── */
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
    key: "unpaid", icon: "card", title: "수강료 기한 초과 5명",
    sub: "9월 시작 수납기간 ₩1,620,000 · 전원 마감 지남(연체)",
    action: "리마인드", after: "리마인드 발송 완료 · 결제 대기", afterSub: "결제 완료 아님 — 입금 시 자동 확인", bn: "발송 ✓",
  },
  {
    key: "event", icon: "trophy", title: "대회 미응답 4명",
    sub: "강동 유소년 챔피언십 · 신청 마감 D-3",
    action: "재발송", after: "재발송 완료 · 응답 대기", afterSub: "응답이 오면 알려드려요", bn: "재발송 ✓",
  },
  {
    key: "absence", icon: "alert", hot: true, title: "긴급결석 1건 — 박민준",
    sub: '오늘 2:30 플레이2 · 사유: "아파요" · 학부모 접수',
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
    rows: [["대상 원생(기한 초과)", "5명"], ["미납 합계", "1,620,000원"], ["발송 채널", "알림톡 우선 · 실패 시 SMS 대체"]],
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

/* ───── 수납: 청구 초안 특이 케이스 ───── */
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
  { ini: "예", gold: true, name: "한예린 — 12월 퇴원 예정", sub: "남은 회차만 부분 청구 (일할)", tag: "부분", tagTone: "warn", amt: "₩120,000" },
  { ini: "수", name: "이수아 — 다종목 할인 적용", sub: "축구+인라인 · MAX 10% 하나만", tag: "10%↓", tagTone: "accent", amt: "₩486,000" },
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

/* ───── 학원: 강사 ───── */
export const COACHES: { ini: string; gold?: boolean; name: string; sub: string; swap?: boolean; state?: string }[] = [
  { ini: "김", gold: true, name: "김선재 코치", sub: "플레이2 월수반 · 퇴사 예정 (마지막 근무 11/30)", swap: true },
  { ini: "이", name: "이창진 코치", sub: "축구 화금반 · 어제 가입 완료", state: "재직" },
  { ini: "박", name: "박코치", sub: "플레이3 화목반 · 인라인 토요반", state: "재직" },
];

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
