/* =========================================================
   PACEFOLIO 원장 PC 콘솔 — 풍부한 mock (프로토타입 전용)
   출처: pacefolio-owner-pc.html 목업의 데이터 충실 이식.
   ⚠️ 공용 lib/mock/data.ts 는 건드리지 않는다. 콘솔 전용 데이터.
   비-"use client" 모듈 — 서버/클라이언트 양쪽에서 import 가능.
   ========================================================= */

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

export const KIDS: Kid[] = [
  { id: "dodam", nm: "김도담", em: "🧒", age: 8, cls: "플레이2 월수반", coach: "김선재", status: "재원", parent: "010-****-1234 (어머님)", sib: "김서준 (동생) · 같은 보호자 연결", pay: "완납", payDetail: "원생별 분리 청구 · 보호자 합산 결제", total: "405,000원", gender: "남",
    bill: [["수강료", "360,000"], ["차량비", "45,000"]], makeup: 2,
    veh: { ride: "래미안아파트 정문 · 2:40 탑승", drop: "같은 곳 · 5:10 하원", seat: "주니어 카시트 필수 · 멀미 있어 앞좌석 선호" },
    makeups: [{ t: "10/13 (학원 휴무 대체)", s: "보강일 미지정 · 학부모 요청 있음" }, { t: "10/16 결석 (병원)", s: "긴급결석 처리됨 · 원장 처리 전" }] },
  { id: "seojun", nm: "김서준", em: "👦", age: 7, cls: "플레이2 월수반", coach: "김선재", status: "재원", parent: "010-****-1234 (어머님)", sib: "김도담 (형) · 같은 보호자 연결", pay: "완납", payDetail: "형제 20% 할인은 서준에게 적용", total: "333,000원", gender: "남",
    bill: [["수강료", "360,000"], ["형제 20% 할인", "−72,000"], ["차량비", "45,000"]], makeup: 0,
    veh: { ride: "래미안아파트 정문 · 2:40 탑승 (형과 동승)", drop: "같은 곳 · 5:10 하원", seat: "주니어 카시트 필수" } },
  { id: "minjun", nm: "박민준", em: "🧒", age: 8, cls: "플레이2 월수반", coach: "김선재", status: "재원", parent: "010-****-5678 (어머님)", pay: "미납", payDetail: "마감 6일 지남 · 리마인드 2회 · 오늘 결석 예정(아파요)", total: "330,000원", gender: "남",
    bill: [["수강료 (2분기 미납분)", "330,000"], ["차량", "미이용"]], makeup: 0, veh: null, alert: "⚠️ 견과류 알러지" },
  { id: "hayun", nm: "정하윤", em: "👧", age: 8, cls: "플레이2 월수반", coach: "김선재", status: "재원", parent: "010-****-2345 (아버님)", pay: "완납", payDetail: "자동결제", total: "360,000원", gender: "여",
    bill: [["수강료", "360,000"], ["차량", "미이용"]], makeup: 0, veh: null },
  { id: "sua", nm: "이수아", em: "👧", age: 9, cls: "축구 화금반 + 인라인", coach: "이창진", status: "재원", parent: "010-****-8765 (어머님)", pay: "미납", payDetail: "다종목 10% — MAX 하나만 적용", total: "531,000원", gender: "여",
    bill: [["수강료 (축구+인라인)", "540,000"], ["다종목 10% 할인", "−54,000"], ["차량비", "45,000"]], makeup: 0,
    veh: { ride: "한빛초 후문 · 3:50 탑승", drop: "홈플러스 앞 · 6:20 하원", seat: "특이사항 없음" } },
  { id: "jiho", nm: "최지호", em: "👦", age: 7, cls: "플레이2 월수반", coach: "김선재", status: "재원", parent: "010-****-9012 (어머님)", pay: "완납", payDetail: "플레이1→2 승급 반영", total: "450,000원", gender: "남",
    bill: [["수강료 (승급 반영)", "450,000"], ["차량", "미이용"]], makeup: 0, veh: null },
  { id: "yerin", nm: "한예린", em: "👧", age: 10, cls: "축구 화금반", coach: "이창진", status: "퇴원 예정", parent: "010-****-3456 (어머님)", pay: "완납", payDetail: "12월 퇴원 예정 · 부분 청구", total: "240,000원", gender: "여",
    bill: [["수강료 (부분 청구)", "240,000"], ["차량", "미이용"]], makeup: 0, veh: null },
  { id: "ian", nm: "최이안", em: "🧒", age: 7, cls: "축구 화금반", coach: "이창진", status: "재원", parent: "010-****-7890 (아버님)", pay: "일할 청구", payDetail: "10/28 입회 · 남은 실제 수업 10회 기준 일할", total: "243,750원", gender: "미입력",
    bill: [["수강료 (일할 10/24회)", "225,000"], ["차량비 (일할 · 같은 구조)", "18,750"]], makeup: 0,
    veh: { ride: "강동도서관 앞 · 3:50 탑승", drop: "같은 곳 · 6:20 하원", seat: "신규 — 첫 주 동승 확인 필요" } },
];

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
export const CLS_OPTS = ["플레이2 월수반", "플레이2 유아반", "축구 화금반", "플레이3 화목반", "인라인 토요반", "농구 토요특강"];

export const AF_GROUPS: { key: string; label: string; opts: string[] }[] = [
  { key: "age", label: "연령대", opts: ["5~6세", "7~9세", "10~12세"] },
  { key: "gender", label: "성별 (선택 입력 · 운영 목적만 · 마케팅 타기팅 금지)", opts: ["남", "여", "미입력"] },
  { key: "prog", label: "프로그램", opts: ["플레이2", "플레이3", "유소년 축구", "농구 특강", "인라인 기초"] },
  { key: "cls2", label: "반", opts: CLS_OPTS },
  { key: "day", label: "수업 요일", opts: ["월·수", "화·목", "화·금", "토"] },
  { key: "coach", label: "담당 코치", opts: ["김선재", "이창진", "이코치", "박코치"] },
  { key: "pay", label: "수납", opts: ["완납", "미납", "일할 청구"] },
  { key: "veh", label: "차량", opts: ["이용", "미이용"] },
  { key: "safe", label: "안전정보", opts: ["있음", "없음"] },
];

/* 대시보드 반별 정원 */
export interface Capacity { nm: string; sub: string; label: string; pct: number; tone: "accent" | "full" | "low"; }
export const CAPACITY: Capacity[] = [
  { nm: "플레이2 · 월수반", sub: "브레인 · 김선재", label: "등록 12 · 재원 10 / 정원 12", pct: 83, tone: "accent" },
  { nm: "플레이2 · 유아반", sub: "브레인 · 이코치", label: "12 / 12 · 대기 1", pct: 100, tone: "full" },
  { nm: "축구 · 화금반", sub: "액티브 · 이창진", label: "16 / 16 · 대기 2", pct: 100, tone: "full" },
  { nm: "플레이3 · 화목반", sub: "브레인 · 박코치", label: "11 / 12", pct: 92, tone: "accent" },
  { nm: "인라인 · 토요반", sub: "액티브 · 박코치", label: "5 / 12 · 42%", pct: 42, tone: "low" },
  { nm: "농구 · 토요특강", sub: "액티브 · 김선재", label: "8 / 12 · 67%", pct: 67, tone: "accent" },
];

/* 프로그램 */
export interface ProgramRow {
  id: string; nm: string; div: string; sport: string; age: string; cur: string; cls: string; kids: string; st: string;
  time: string; cap: string; min: string; fee: string; veh: string; mid: string; rep: string; perm: string; permd: string;
}
export const PROGRAMS: ProgramRow[] = [
  { id: "p2", nm: "플레이2", div: "브레인", sport: "밸런스·리듬 통합", age: "7~9세", cur: "24회 · v2026-1", cls: "2개 반", kids: "22명", st: "운영 중", time: "60분", cap: "12명", min: "6명", fee: "360,000 / 분기", veh: "45,000 별도 · 무할인", mid: "일할 계산 (실제 남은 수업일)", rep: "밸런스·리듬 등 5항목 + 사진", perm: "선택형", permd: "해당 회차 추천 활동 중 코치가 선택·순서 변경" },
  { id: "p3", nm: "플레이3", div: "브레인", sport: "협응·전략 통합", age: "9~11세", cur: "24회 · v2026-1", cls: "1개 반", kids: "11명", st: "운영 중", time: "60분", cap: "12명", min: "6명", fee: "380,000 / 분기", veh: "45,000 별도 · 무할인", mid: "일할 계산 (실제 남은 수업일)", rep: "협응·집중 등 5항목 + 사진", perm: "선택형", permd: "해당 회차 추천 활동 중 코치가 선택·순서 변경" },
  { id: "soc", nm: "유소년 축구", div: "액티브", sport: "축구", age: "7~10세", cur: "24회 · v2026-2", cls: "1개 반", kids: "16명", st: "운영 중", time: "70분", cap: "16명", min: "8명", fee: "540,000 / 분기", veh: "45,000 별도 · 무할인", mid: "일할 계산 (실제 남은 수업일)", rep: "드리블·슈팅 등 6항목 + 사진", perm: "자율형", permd: "학원 활동 라이브러리 안에서 코치가 자유 구성" },
  { id: "bsk", nm: "농구 특강", div: "액티브", sport: "농구", age: "8~11세", cur: "12회 · v2026-1", cls: "1개 반", kids: "8명", st: "운영 중", time: "60분", cap: "12명", min: "6명", fee: "300,000 / 분기", veh: "미운행", mid: "일할 계산 (실제 남은 수업일)", rep: "드리블·패스·슛 등 4항목", perm: "자율형", permd: "학원 활동 라이브러리 안에서 코치가 자유 구성" },
  { id: "inl", nm: "인라인 기초", div: "액티브", sport: "인라인", age: "7~9세", cur: "12회 · v2026-1", cls: "1개 반", kids: "5명", st: "모집 중", time: "60분", cap: "12명", min: "5명", fee: "300,000 / 분기", veh: "미운행", mid: "일할 계산 (실제 남은 수업일)", rep: "주행·제동 등 4항목", perm: "잠금형", permd: "원장 커리큘럼 그대로 — 코치는 완료·부분·미진행만 기록" },
];
export const PERMD: Record<string, string> = {
  잠금형: "원장 커리큘럼 그대로 — 코치는 완료·부분·미진행만 기록",
  선택형: "해당 회차 추천 활동 중 코치가 선택·순서 변경",
  자율형: "학원 활동 라이브러리 안에서 코치가 자유 구성",
  승인형: "코치가 새 활동 제안 → 원장 승인 후 반영",
};

/* 운영 중인 반 */
export interface ClsRow { nm: string; prog: string; time: string; room: string; coach: string; cap: string; }
export const CLASSES_OP: ClsRow[] = [
  { nm: "월수반", prog: "플레이2", time: "월·수 14:30~15:30", room: "본관 2층", coach: "김선재", cap: "등록 12 · 재원 10 / 12" },
  { nm: "유아반", prog: "플레이2", time: "화·목 10:30~11:20", room: "본관 1층", coach: "이코치", cap: "12 / 12" },
  { nm: "화금반", prog: "유소년 축구", time: "화·금 16:00~17:10", room: "실내체육관", coach: "이창진", cap: "16 / 16 · 대기 2" },
  { nm: "화목반", prog: "플레이3", time: "화·목 15:00~16:00", room: "본관 2층", coach: "박코치", cap: "11 / 12" },
  { nm: "토요반", prog: "인라인 기초", time: "토 11:00~12:00", room: "야외 링크장", coach: "박코치", cap: "5 / 12" },
  { nm: "토요특강", prog: "농구 특강", time: "토 10:00~11:00", room: "실내체육관", coach: "김선재", cap: "8 / 12" },
];
export const COACH_BUSY: Record<string, string> = { 김선재: "월·수", 이창진: "화·금", 이코치: "화·목", 박코치: "화·목·토" };

/* 시간표 — 주간 */
export interface WeekSess { name: string; sub: string; tone?: "active" | "off"; }
export const WEEK: { day: string; sess: WeekSess[] }[] = [
  { day: "월", sess: [{ name: "플레이2 월수반", sub: "14:30~15:30 · 본관 2층 · 김선재" }] },
  { day: "화", sess: [{ name: "플레이2 유아반", sub: "10:30~11:20 · 본관 1층 · 이코치" }, { name: "축구 화금반", sub: "16:00~17:10 · 실내체육관 · 이창진", tone: "active" }, { name: "플레이3 화목반", sub: "15:00~16:00 · 본관 2층 · 박코치" }] },
  { day: "수", sess: [{ name: "플레이2 월수반", sub: "14:30~15:30 · 본관 2층 · 김선재" }] },
  { day: "목", sess: [{ name: "플레이2 유아반", sub: "10:30~11:20 · 본관 1층 · 이코치" }, { name: "플레이3 화목반", sub: "15:00~16:00 · 본관 2층 · 박코치" }] },
  { day: "금", sess: [{ name: "축구 화금반", sub: "16:00~17:10 · 실내체육관 · 이창진", tone: "active" }] },
  { day: "토", sess: [{ name: "농구 토요특강", sub: "10:00~11:00 · 실내체육관 · 김선재" }, { name: "인라인 토요반", sub: "11:00~12:00 · 야외 링크장 · 박코치", tone: "active" }] },
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

/* 강사 */
export interface Coach { init: string; nm: string; charge: string; status: string; tone: "ok" | "wait"; perm: string; swap?: boolean; }
export const COACHES: Coach[] = [
  { init: "김", nm: "김선재", charge: "플레이2 월수반 · 농구 토요 특강", status: "퇴사 예정 · 11/30", tone: "wait", perm: "담당 반 원생 · 안전 정보", swap: true },
  { init: "이", nm: "이창진", charge: "축구 화금반", status: "재직", tone: "ok", perm: "담당 반 원생 · 안전 정보" },
  { init: "박", nm: "박코치", charge: "플레이3 화목반 · 인라인 토요반", status: "재직", tone: "ok", perm: "담당 반 원생 · 안전 정보" },
];
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
export const COACH_CHIPS = ["김선재 코치", "이창진 코치", "박코치"];
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
  { label: "수납 주기", sub: "3개월 단위 · 1·4·7·10월 시작 (원장 설정 · 변경 가능) · 차량비 별도·무할인" },
  { label: "직원 권한", sub: "원장 1 · 데스크 1 · 코치 3 — 역할별 원생·수납·차량 접근 범위 설정" },
  { label: "감사 로그", sub: "프로그램·시간표·청구·출결·리포트의 모든 수정에 작성자·시각·이전 값·사유 기록" },
];

/* 대시보드 KPI */
export const DASH_KPI = [
  { kk: "3분기 수납 현황", kv: "₩24,180,000", kd: "목표 대비 87% · 지난 분기 +12%", hero: true },
  { kk: "전체 원생", kv: "93명", kd: "신규 등록 +11명", tone: "up" as const },
  { kk: "이번 주 출석률", kv: "89%", kd: "긴급결석 1건 접수" },
];

export const fmt = (n: number) => n.toLocaleString("ko-KR");
