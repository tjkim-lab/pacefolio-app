/* =========================================================
   PACEFOLIO — 코치 앱 어댑터 (DB 없음, 프로토타입)
   ---------------------------------------------------------
   B4 전환: 겹치는 엔티티(반 명단·이름·보호자·예정결석)는 공용
   fixture(lib/fixtures)에서 파생 — 이름·형제 관계가 원장/학부모 앱과 일치.
   코치 화면 전용 장식(컨디션·안전배지·채팅·커리큘럼·인수인계)은 여기 로컬.
   순수 데이터·타입만 — "use client" 금지, JSX/아이콘 금지
   (서버·클라이언트 양쪽에서 import 가능해야 함)
   ========================================================= */
import * as fx from "@/lib/fixtures";

/* 코치 홈 반 = 플레이2 월수반. 재원 명단은 fixture 정본에서 파생. */
function play2Participant(id: string) {
  return fx.participants.find((p) => p.id === (id as never));
}
/* 코치 화면 표시명 = 성(姓) 제외 (fixture 정본 이름에서 파생) */
function shortName(fullName: string): string {
  return fullName.length >= 3 ? fullName.slice(1) : fullName;
}
/* "8세" → 8 */
function ageOf(ageLabel: string): number {
  return parseInt(ageLabel, 10) || 0;
}

/* ---------- 코치 · 학원 (이름·학원명은 fixture 정본) ---------- */
const KSJ = fx.users.find((u) => u.name === "김선재");
export const coach = {
  name: KSJ?.name ?? "김선재",
  initial: "선",
  academy: fx.academy.name,
  tenure: "14개월째",
  classCount: 2,
  studentCount: 18,
  dateLabel: "10월 27일 (월)",
};

export interface Academy {
  id: string;
  emoji: string;
  name: string;
  role: string;
  current: boolean;
}
export const academies: Academy[] = [
  { id: "wondergym", emoji: "🏫", name: "원더짐 아카데미", role: "정규 코치 · 지금 보고 있는 학원", current: true },
  { id: "gangdong", emoji: "🏟️", name: "강동 스포츠센터", role: "토요 특강 코치 · 전환 시 해당 학원 정보만 표시", current: false },
];

/* ---------- 원장 전달사항 ---------- */
export const brief = {
  body: "도담이 오늘 컨디션 안 좋대요, 강도 조절해주세요. 물도 자주 마시게 해주시고요.",
  from: "박원장 · 오전 11:40 · 대상: 도담 · 오늘 플레이2에만 적용 · 수업 종료 후 자동 만료",
};

/* ---------- 오늘 수업 히어로 ---------- */
export const todayClass = {
  kicker: "오늘 수업 · 오후 2:30",
  title: "플레이2 · 월수반",
  meta: '본관 2층 · 14회차 "균형과 리듬 ②" · 활동 3개 · 40분 뒤 시작',
  capacity: "12명",
  absent: "1명",
  absentWho: "결석 예정 · 민준",
  caution: "1명",
  cautionWho: "컨디션 주의 · 도담",
  round: '14회차 · 균형과 리듬 ②',
  preMeta:
    "재원 10명(휴원 2 제외) · 참석 예정 9명 · 결석 예정 1명(민준·학부모 접수) · 컨디션 주의 1명(도담)",
};

/* ---------- 다음 수업(내일) · 활동 라이브러리 ---------- */
export interface Activity {
  id: number;
  e: string;
  n: string;
  d: number;
  tag: string;
}
export const LIB: Activity[] = [
  { id: 0, e: "🏀", n: "콘 드리블 지그재그", d: 10, tag: "민첩성" },
  { id: 1, e: "🎯", n: "체스트 패스 짝 게임", d: 8, tag: "협응성" },
  { id: 2, e: "🏀", n: "미니골대 레이업 슛", d: 12, tag: "정확성" },
  { id: 3, e: "🤸", n: "한발 밸런스 스텝", d: 6, tag: "균형감각" },
  { id: 4, e: "🪜", n: "리듬 사다리 스텝", d: 8, tag: "리듬감" },
  { id: 5, e: "🏁", n: "3:3 미니 매치", d: 15, tag: "게임지능" },
];
export const DEFAULT_TOMORROW = [0, 1, 2];
export const tomorrowInfo = "토요일 오전 10:00 · 농구 토요특강 8명 · 커리큘럼이 자동 제안했어요";

/* 코치 편집 권한 4단계 (원장이 프로그램에 설정 · 시연용 토글) */
export type PolicyKey = "LOCKED" | "SELECT" | "FLEX" | "APPROVAL";
export interface Policy {
  nm: string;
  d: string;
  change: boolean;
  full: boolean;
  pool: number[];
  propose: boolean;
}
export const POLICIES: Record<PolicyKey, Policy> = {
  LOCKED: { nm: "잠금형", d: "원장 커리큘럼 고정 — 완료·부분 진행·미진행만 기록해요", change: false, full: false, pool: [], propose: false },
  SELECT: { nm: "선택형", d: "해당 회차 추천 활동 중에서만 선택·순서 변경", change: true, full: false, pool: [0, 1, 2, 3], propose: false },
  FLEX: { nm: "자율형", d: "학원 활동 라이브러리 전체에서 자유 구성", change: true, full: true, pool: [], propose: false },
  APPROVAL: { nm: "승인형", d: "새 활동을 제안하면 원장 승인 후 반영", change: true, full: true, pool: [], propose: true },
};
export const POLICY_ORDER: PolicyKey[] = ["LOCKED", "SELECT", "FLEX", "APPROVAL"];

/* ---------- 오늘의 수업 (배치 C1 — 시간순 캐러셀) ----------
   메인 수업 = fixture 플레이2 월수반(월 14:30) 정본. 두 번째는 캐러셀·
   상태 버튼 시연용 목업 전용(보강). 상태는 서버 수업 상태 기준이 정본 —
   여기선 코치 상태머신(_state)에서 파생(API_REQUIRED). */
export type ClassStatus = "SCHEDULED" | "READY" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export interface TodayClassCard {
  id: string;
  time: string;
  end: string;
  name: string;
  place: string;
  students: number;
  main?: boolean; // 수업 모드 상태머신과 연결된 메인 수업
  note?: string;
}
export const TODAY_CLASSES: TodayClassCard[] = [
  { id: "main", time: "14:30", end: "15:30", name: "플레이2 · 월수반", place: "본관 2층", students: 10, main: true, note: '14회차 "균형과 리듬 ②"' },
  { id: "extra", time: "16:30", end: "17:30", name: "플레이2 보강수업", place: "본관 2층", students: 3, note: "결석 보강 · 목업 전용" },
];
export const CLASS_STATUS_BTN: Record<ClassStatus, string> = {
  SCHEDULED: "수업 준비",
  READY: "수업 시작",
  IN_PROGRESS: "수업 계속하기",
  COMPLETED: "완료됨 · 결과 보기",
  CANCELLED: "취소됨",
};

/* ---------- 학부모 전달사항 (C1 — 원생·수업 컨텍스트 표시) ---------- */
export const PARENT_NOTES: { kid: string; msg: string; ctx: string }[] = [];

/* ---------- 출석 명단 (예정 vs 실제 분리 · C2: 출석/결석/지각/조퇴 4상태) ---------- */
export type AttStatus = "" | "p" | "l" | "a" | "e";
export interface Kid {
  n: string;
  a: number;
  cond?: string;
  planned?: boolean; // 학부모 결석 예정 접수
  why?: string;
  safe?: string; // 안전 배지
  paused?: boolean; // 휴원
}
/* 코치 화면 전용 뷰 플래그(도메인 필드 아님): 컨디션·안전배지. */
const COACH_VIEW_FLAGS: Record<string, Pick<Kid, "cond" | "safe">> = {
  p_dodam: { cond: "컨디션 주의" },
  p_minjun: { safe: "⚠ 알레르기" },
};
/* 오늘 예정 결석(보호자 통보) — fixture attendanceNotices 정본 */
const plannedAbsence = new Map(
  fx.attendanceNotices
    .filter((n) => n.type === "ABSENCE")
    .map((n) => [n.participantId as string, n.reason]),
);
/* 코치 홈 반(플레이2 월수반) 재원 — fixture 정본, 코치 표시 순서 */
const P2_ROSTER_ORDER = ["p_dodam", "p_seojun", "p_hayun", "p_minjun", "p_jiho"];
const rosterKids: Kid[] = P2_ROSTER_ORDER.flatMap((id) => {
  const p = play2Participant(id);
  if (!p) return [];
  const why = plannedAbsence.get(id);
  return [{
    n: shortName(p.name),
    a: ageOf(p.ageLabel),
    ...(why ? { planned: true, why } : {}),
    ...COACH_VIEW_FLAGS[id],
  }];
});
/* 코치 전용(다른 앱에 없는) 원생 — 로컬 장식 */
const localOnlyKids: Kid[] = [
  { n: "수아", a: 8 },
  { n: "예린", a: 8 },
  { n: "시우", a: 7 },
  { n: "은우", a: 7 },
  { n: "다온", a: 8 },
  { n: "로아", a: 8, paused: true },
  { n: "준서", a: 7, paused: true },
];
export const KIDS: Kid[] = [...rosterKids, ...localOnlyKids];
export const ATT_CYCLE: Record<AttStatus, AttStatus> = { "": "p", p: "a", a: "l", l: "e", e: "p" };
export const ATT_TXT: Record<AttStatus, string> = { "": "미체크", p: "출석 ○", l: "지각 △", a: "결석 ✕", e: "조퇴 ◐" };

/* 학부모 전달사항 — fixture 예정결석 + 컨디션(원장 brief 와 동일 건) 파생 */
PARENT_NOTES.push(
  ...[...plannedAbsence.entries()].map(([pid, reason]) => ({
    kid: shortName(play2Participant(pid)?.name ?? ""),
    msg: `결석 예정 — 사유: "${reason}"`,
    ctx: "14:30 플레이2 · 학부모 접수",
  })),
  { kid: "도담", msg: "어제 병원 다녀왔어요 — 오늘 컨디션 확인해주세요", ctx: "14:30 플레이2 · 보호자 대화" },
);

/* 결석 예정 → 실제 출결 확정 시트 옵션 */
export const ABS_WHY = ["아이가 실제로 도착함", "학부모가 현장에서 취소함", "예정대로 결석", "기타"];

/* 보호자 그룹(형제 = 같은 보호자 → 알림 합산) — fixture guardianLinks 정본.
   도담·서준이 같은 보호자를 공유하는 것이 원장·학부모 앱과 단일 소스로 일치. */
export const GUARDIAN_GID: Record<string, string> = {};
for (const id of P2_ROSTER_ORDER) {
  const p = play2Participant(id);
  const link = p && fx.guardianLinks.find((l) => l.participantId === p.id);
  if (p && link) GUARDIAN_GID[shortName(p.name)] = link.guardianId as string;
}
/* 코치 전용 원생은 개별 보호자(로컬) */
["수아", "예린", "시우", "은우", "다온", "로아", "준서"].forEach((n, i) => {
  GUARDIAN_GID[n] = `gd_local_${i + 1}`;
});

/* ---------- 수업 모드 STEP2 · 오늘의 프로그램 (C2: 영역+활동명+완료만 —
   분·초·횟수 등 세부 측정값 제거. 측정은 프로그램 정책 확정 후 후속 단계) ---------- */
export type GrowthArea = "균형감각" | "협응성" | "인지·집중";
export const GROWTH_AREAS: GrowthArea[] = ["균형감각", "협응성", "인지·집중"];
export interface ClassAct {
  e: string;
  n: string;
  area: GrowthArea; // 완료 시 원생별 성장 영역 기록에 누적 (진단·점수 아님)
}
export const CLASS_ACTS: ClassAct[] = [
  { e: "🤸", n: "한발 서기 밸런스 게임", area: "균형감각" },
  { e: "🥁", n: "리듬 스텝 점프", area: "협응성" },
  { e: "🧠", n: "색깔 신호 반응 게임", area: "인지·집중" },
];

/* ---------- 코치 공통 메시지 템플릿 (C3 — 최대 5개 · 치환 변수 설계) ---------- */
export const TEMPLATE_MAX = 5;
export const DEFAULT_TEMPLATES: string[] = [
  "오늘도 수업에 즐겁게 참여했습니다. {오늘활동} 활동을 중심으로 진행했어요.",
  "{수업명} 잘 마쳤습니다. 다음 시간에 이어서 연습할게요 👏",
];
export const TEMPLATE_VARS = "{학생이름} {수업명} {수업날짜} {오늘활동} {코치이름}";
export const SKIP_WHYS = ["시간 부족", "다른 활동으로 대체", "현장 상황", "다음 시간에 이어서", "기타"];

/* 사진 공개 범위 */
export const PHOTO_SCOPE: Record<string, string> = {
  individual: "해당 원생 보호자만",
  class: "게시 동의된 반 보호자",
};

/* ---------- 특이사항·안전사고 기록 시트 옵션 ---------- */
export const INC_TYPE = ["가벼운 부상", "컨디션 악화", "수업 중단", "안전사고", "기타"];
export const INC_SEV = ["경미", "주의", "중대"];
export const INC_CONT = ["계속 진행", "수업 중단"];
export const INC_FOLLOW = ["불필요", "필요"];
export const INC_NOTIFY = ["연락 완료", "연락 필요", "연락 불필요"];

/* ---------- 채팅 ---------- */
export type MsgSide = "them" | "me" | "sys" | "rep";
export interface Msg {
  side: MsgSide;
  who?: string;
  text: string;
  time?: string;
  claps?: number; // rep 카드용
}
export interface Room {
  id: string;
  name: string;
  sub: string; // 상세 헤더 서브
  avatar: string;
  preview: string;
  previewTime: string;
  unread: number;
  listGroup: "channel" | "guardian";
  seed: Msg[];
}
export const ROOMS: Room[] = [
  {
    id: "class",
    name: "플레이2 월수반 전체방",
    sub: "보호자 11 · 코치 1",
    avatar: "📣",
    preview: "서준맘: 오늘 준비물 실내화 맞죠?",
    previewTime: "오전 9:12",
    unread: 0,
    listGroup: "channel",
    seed: [
      { side: "sys", text: "오늘" },
      { side: "them", who: "서준맘", text: "코치님, 오늘 준비물 실내화 맞죠?", time: "오전 9:12" },
      { side: "me", text: "네! 실내화·물통 챙겨주세요 🙏 오늘은 균형 활동이라 양말도 필수예요.", time: "오전 9:15 · 읽음 10" },
    ],
  },
  {
    id: "owner",
    name: "박원장 1:1",
    sub: "전달사항은 확인 이력이 남아요",
    avatar: "🏫",
    preview: "도담이 오늘 컨디션 안 좋대요, 강도 조절…",
    previewTime: "오전 11:40",
    unread: 1,
    listGroup: "channel",
    seed: [
      { side: "sys", text: "오늘" },
      { side: "them", who: "박원장", text: "📌 전달사항 — 도담이 오늘 컨디션 안 좋대요, 강도 조절해주세요. 물도 자주 마시게 해주시고요.", time: "오전 11:40" },
    ],
  },
  {
    id: "g-minjun",
    name: "민준 보호자 1:1",
    sub: "개별 결석·기록은 이 채널에서만",
    avatar: "👩",
    preview: "오늘 아파서 결석할게요 ㅠ",
    previewTime: "오전 8:40",
    unread: 1,
    listGroup: "guardian",
    seed: [
      { side: "sys", text: "오늘" },
      { side: "them", who: "민준맘", text: "오늘 아파서 결석할게요 ㅠ", time: "오전 8:40" },
      { side: "me", text: "확인했어요 🙏 푹 쉬고 다음 시간에 만나요. 보강은 원장님이 안내드릴게요.", time: "오전 8:42" },
    ],
  },
  {
    id: "g-dodam",
    name: "도담 보호자 1:1",
    sub: "개별 컨디션·기록은 이 채널에서만",
    avatar: "👩",
    preview: "네, 오늘 병원 다녀와서 컨디션 살펴주세요",
    previewTime: "오전 10:05",
    unread: 0,
    listGroup: "guardian",
    seed: [
      { side: "sys", text: "오늘" },
      { side: "them", who: "도담맘", text: "네, 오늘 병원 다녀와서 컨디션 살펴주세요", time: "오전 10:05" },
      { side: "me", text: "확인했습니다 🙏 강도 조절하고 물 자주 마시게 할게요.", time: "오전 10:07" },
    ],
  },
  {
    id: "g-seojun",
    name: "서준 보호자 1:1",
    sub: "개별 기록은 이 채널에서만",
    avatar: "👩",
    preview: "준비물 실내화 챙겼어요 감사합니다",
    previewTime: "오전 9:20",
    unread: 0,
    listGroup: "guardian",
    seed: [
      { side: "sys", text: "오늘" },
      { side: "them", who: "서준맘", text: "준비물 실내화 챙겼어요 감사합니다", time: "오전 9:20" },
      { side: "me", text: "네 어머님 🙂 오늘 리듬 스텝 잘 따라왔어요. 리포트로 전해드릴게요.", time: "오전 9:22" },
    ],
  },
];

/* ---------- 내 정보 ---------- */
export const myClasses = [
  { e: "🤸", name: "플레이2 · 월수반", sub: "주2회 · 재원 10명(정원 12) · 진도 14/24회차", tag: "브레인" },
  { e: "🏀", name: "농구 · 토요특강", sub: "주1회(토) · 8명 · 진도 9/24회차", tag: "액티브" },
];
export interface WeekDay {
  dw: string;
  dn: number;
  time?: string;
}
export const WEEK: WeekDay[] = [
  { dw: "월", dn: 27, time: "2:30" },
  { dw: "화", dn: 28 },
  { dw: "수", dn: 29, time: "2:30" },
  { dw: "목", dn: 30 },
  { dw: "금", dn: 31 },
  { dw: "토", dn: 1, time: "10:00" },
  { dw: "일", dn: 2 },
];
export const weekNote = "월·수 2:30 플레이2 🤸 · 토 10:00 농구 🏀";

/* ---------- 내 인사정보 (C4 — 코치 본인 열람. 급여·계약서는 원장 권한) ---------- */
export const HR_ROWS: [string, string][] = [
  ["이름", KSJ?.name ?? "김선재"],
  ["연락처", "010-****-7712"],
  ["입사일", "2024-08-01 (14개월째)"],
  ["담당", "플레이2 월수반 · 농구 토요특강"],
  ["자격증", "생활스포츠지도사 2급 · 유효기간 ~2027-05"],
  ["응급처치", "심폐소생술(CPR) 이수 · 2026-03"],
  ["계약 형태", "정규 — 급여·계약서는 원장 정책·권한 (열람 로그 기록)"],
];

/* ---------- 인수인계 · 작별 피드백 ---------- */
export const handoverSafety = {
  title: "🛡 안전 정보 — 시스템이 자동 인계해요",
  who: "박민준 · 견과류 알레르기",
  detail: "중증도: 주의 · 간식 시간 성분 확인 · 노출 시 보호자 즉시 연락",
  meta: "보호자 확인일 6/2 · 담당 코치가 바뀌어도 자동 전달 — 작별 피드백과 별개로 관리돼요",
};
export interface ByeKid {
  id: string;
  initial: string;
  name: string;
  sub: string;
  done: boolean;
  msg?: string;
  def?: string;
  placeholder?: string;
}
export const BYE_KIDS: ByeKid[] = [
  { id: "dodam", initial: "도", name: "김도담 (8세)", sub: "플레이2 · 14개월 함께", done: true, msg: "밸런스 신기록 낸 날 표정을 잊지 마세요. 칭찬 한마디에 두 배로 크는 아이예요." },
  { id: "hayun", initial: "하", name: "정하윤 (8세)", sub: "플레이2 · 12개월 함께", done: true, msg: "새 활동을 시작할 때 하윤이에게 먼저 시범을 맡기면 참여도가 높아져요. 친구들이 동작을 이해하도록 돕는 편이에요." },
  { id: "seojun", initial: "서", name: "김서준 (7세)", sub: "플레이2 · 2주 전 합류", done: false, def: "형이랑 붙여주면 금방 안정돼요. 적응 중이니 첫 달은 천천히.", placeholder: "서준이에게 남길 한마디 — 새 코치가 첫날부터 알게 돼요" },
  { id: "minjun", initial: "민", name: "박민준 (8세)", sub: "플레이2 · 10개월 함께 · 🛡 안전 정보는 위에서 자동 인계", done: false, def: "컨디션 기복이 있는 날은 활동 강도를 한 단계 낮추면 끝까지 참여해요. 보호자 리포트는 꼼꼼히 남기는 편이 좋아요.", placeholder: "민준이에게 남길 한마디 — 알레르기 등 안전 정보는 여기 말고 안전 정보에 기록돼요" },
];
