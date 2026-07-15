/* =========================================================
   PACEFOLIO 학부모 앱 — 목업(pacefolio-parent-app.html) 이식용 데이터
   순수 모듈(no "use client") — 서버/클라 어디서든 import 가능.
   ⚠️ 공용 lib/mock/data.ts 는 건드리지 않음 (헌법).
   원천의 CONTENT/DETAIL/BANNERS/QA/BILL/INV_AMT 를 1:1 전사.
   ========================================================= */

export type ChildName = "도담" | "서준";
export type AcademyName = "원더짐 아카데미" | "강동 스포츠클럽";
export type Attend = null | "confirm" | "absent";
export type ChildSeg = "grow" | "pay" | "contest";
export type IconKey =
  | "home" | "cal" | "chat" | "user" | "bell" | "check" | "cam" | "award"
  | "mega" | "clock" | "book" | "chev" | "back" | "send" | "lock" | "shield"
  | "loop" | "trend" | "bulb" | "doc" | "help" | "trophy";

/* ---------- 원생·학원별 상태 초기값 (participantId + academyId) ---------- */
export interface PState {
  attend: Attend;
  absReason: string | null;
  absLog: string[];
  makeupReq: boolean;
  makeupDone: boolean;
  contest: boolean;
  contestPayMethod: string;
  chatUnread: number;
  claps: number;
  myClap: boolean;
}
export const initialPS = (): Record<string, PState> => ({
  "도담|원더짐 아카데미": { attend: null, absReason: null, absLog: [], makeupReq: false, makeupDone: false, contest: false, contestPayMethod: "카카오페이", chatUnread: 2, claps: 12, myClap: false },
  "서준|원더짐 아카데미": { attend: null, absReason: null, absLog: [], makeupReq: false, makeupDone: false, contest: false, contestPayMethod: "카카오페이", chatUnread: 0, claps: 8, myClap: false },
  "도담|강동 스포츠클럽": { attend: null, absReason: null, absLog: [], makeupReq: false, makeupDone: false, contest: false, contestPayMethod: "카카오페이", chatUnread: 0, claps: 5, myClap: false },
});

/* ---------- 결제 상태 (보호자 계정 + 학원 단위) ---------- */
export interface PayState { paid: boolean; autoPay: boolean; payMethod: string }
export const initialPay = (): Record<AcademyName, PayState> => ({
  "원더짐 아카데미": { paid: false, autoPay: false, payMethod: "카카오페이" },
  "강동 스포츠클럽": { paid: true, autoPay: false, payMethod: "카카오페이" },
});

export const CHILDREN: Record<ChildName, { age: string; acads: AcademyName[] }> = {
  "도담": { age: "8세", acads: ["원더짐 아카데미", "강동 스포츠클럽"] },
  "서준": { age: "7세", acads: ["원더짐 아카데미"] },
};

/* ---------- 원생별 청구액 (원더짐 · 가정 단위 합산) ---------- */
export const INV_AMT: Record<ChildName, number> = { "도담": 405000, "서준": 333000 };

/* ---------- 콘텐츠 (홈·일정·채팅·우리아이가 모두 이 데이터로 바뀜) ---------- */
export interface Tile { v: string; k: string; cls?: "good" | "warn"; tab?: ChildSeg | "child" }
export interface Feed { ic: IconKey; push: string; html: string; sub: string; neu: boolean }
export interface Mstone { title: string; sub: string; prog: number; next: string }
export interface Notice { t: string; s: string; read: boolean }
export interface Evt { en: string; em: string; tag: string; push?: string; today?: boolean }
export interface Content {
  hero: { tone: "today" | "week"; cls: string; when: string; dd: string; canAbsent: boolean; rsvpRequested: boolean; absCls: string };
  tiles: Tile[];
  feed: Feed[];
  mstone: Mstone | null;
  notices: Notice[];
  chat: { room: string; sub: string; preview: string; coach: string; coachPrev: string };
  events: Record<string, Evt[]>;
  profile: { desc: string; chips: string[] };
  hasContest: boolean;
  hasAbsenceCard: boolean;
  growth: "dodam" | "seojun" | "swim";
  bill: "wg" | "gd";
  contest: "dodam" | "none";
}

export const CONTENT: Record<string, Content> = {
  "도담|원더짐 아카데미": {
    hero: { tone: "today", cls: "오늘 · 플레이2 수업", when: "오후 2:30 · 본관 2층 · 김코치", dd: "D-3시간", canAbsent: true, rsvpRequested: false, absCls: "플레이2" },
    tiles: [{ v: "92%", k: "참여율 (보강 포함)", cls: "good", tab: "child" }, { v: "3주째", k: "꾸준히 참여하고 있어요", cls: "good" }, { v: "1개", k: "새 마일스톤", cls: "warn", tab: "child" }],
    feed: [{ ic: "book", push: "report", html: "지난 수업 리포트가 도착했어요 — 한발 서기 <b>18초 신기록!</b>", sub: "플레이2 12회차 · 10/20(월)", neu: true }, { ic: "cam", push: "photos", html: "지난 수업 사진 3장", sub: "플레이2 · 10/20(월)", neu: true }],
    mstone: { title: "드리블 스텝2 달성 🎉", sub: "김코치가 수업 중 기록 · 10/25(토) 축구", prog: 60, next: "다음 목표 <b>스텝3</b>까지 2회 남았어요" },
    notices: [{ t: "플레이2 금토반 신규 모집 (12월 개강 · 7~9세)", s: "오늘 오전", read: false }, { t: "강동 유소년 챔피언십 접수 마감 D-7", s: "참가비 19,900원", read: false }, { t: "10월 시설점검 안내 (10/13 월)", s: "지난주", read: true }],
    chat: { room: "플레이2 전체방", sub: "플레이2", preview: "김코치: 수업 마쳤습니다! 리포트 보냈어요 🙂", coach: "김코치 1:1", coachPrev: "네 어머님, 도담이 오늘 컨디션 좋았어요" },
    events: { "27": [{ en: "오늘 · 플레이2 수업", em: "오후 2:30–3:30 · 본관 2층 · 김코치 · 탭하면 오늘의 진도", tag: "수업", push: "lesson", today: true }], "29": [{ en: "수 · 플레이2 수업", em: "오후 2:30–3:30 · 본관 2층 · 김코치", tag: "수업" }], "1": [{ en: "토 · 액티브 축구", em: "오전 11:00–12:00 · 야외 코트 · 김코치", tag: "수업" }] },
    profile: { desc: "브레인스포츠 플레이2 (주2회) · 액티브 축구", chips: ["등번호 7", "포지션 미드필더", "14회차 진행"] },
    hasContest: true, hasAbsenceCard: true, growth: "dodam", bill: "wg", contest: "dodam",
  },
  "서준|원더짐 아카데미": {
    hero: { tone: "today", cls: "오늘 · 플레이2 유아반", when: "오전 10:00 · 본관 1층 · 이코치", dd: "곧 시작", canAbsent: true, rsvpRequested: true, absCls: "플레이2 유아반" },
    tiles: [{ v: "96%", k: "참여율", cls: "good", tab: "child" }, { v: "2주째", k: "꾸준히 나오고 있어요", cls: "good" }, { v: "0개", k: "새 마일스톤" }],
    feed: [{ ic: "book", push: "report", html: "지난 수업 리포트가 도착했어요", sub: "플레이2 유아반 11회차 · 10/20(월)", neu: false }],
    mstone: { title: "제자리 균형 5초", sub: "이코치 기록 · 10/23(목)", prog: 40, next: "다음 목표까지 <b>3회</b> 남았어요" },
    notices: [{ t: "플레이2 금토반 신규 모집 (12월 개강 · 7~9세)", s: "오늘 오전", read: false }, { t: "10월 시설점검 안내 (10/13 월)", s: "지난주", read: true }],
    chat: { room: "플레이2 유아반 전체방", sub: "플레이2 유아반", preview: "이코치: 오늘도 잘했어요!", coach: "이코치 1:1", coachPrev: "서준이 오늘 잘 참여했어요" },
    events: { "27": [{ en: "오늘 · 플레이2 유아반", em: "오전 10:00–10:50 · 본관 1층 · 이코치", tag: "수업", push: "lesson", today: true }], "29": [{ en: "수 · 플레이2 유아반", em: "오전 10:00–10:50 · 본관 1층 · 이코치", tag: "수업" }] },
    profile: { desc: "브레인스포츠 플레이2 유아반 (주2회)", chips: ["11회차 진행"] },
    hasContest: false, hasAbsenceCard: false, growth: "seojun", bill: "wg", contest: "none",
  },
  "도담|강동 스포츠클럽": {
    hero: { tone: "week", cls: "이번 주 · 수영 초급반", when: "토 오전 10:00 · 강동 스포츠클럽 · 박코치", dd: "D-5일", canAbsent: false, rsvpRequested: false, absCls: "수영 초급반" },
    tiles: [{ v: "100%", k: "참여율", cls: "good" }, { v: "6주째", k: "개근 중", cls: "good" }, { v: "자유형", k: "현재 단계" }],
    feed: [{ ic: "book", push: "report", html: "수영 진도 안내가 도착했어요", sub: "수영 초급반 · 10/25(토)", neu: false }],
    mstone: null,
    notices: [{ t: "강동 스포츠클럽 11월 자유수영 개방 안내", s: "이번 주", read: false }],
    chat: { room: "수영 초급반 전체방", sub: "수영 초급반", preview: "박코치: 오늘 발차기 좋았어요", coach: "박코치 1:1", coachPrev: "도담이 물 무서움이 많이 줄었어요" },
    events: { "1": [{ en: "토 · 수영 초급반", em: "오전 10:00–10:50 · 강동 스포츠클럽 · 박코치", tag: "수업", push: "lesson", today: true }] },
    profile: { desc: "수영 초급반 (주1회) · 강동 스포츠클럽", chips: ["자유형 단계", "6주째 개근"] },
    hasContest: false, hasAbsenceCard: false, growth: "swim", bill: "gd", contest: "none",
  },
};

/* ---------- 상세 화면 데이터 (리포트·오늘의 진도·채팅 본문·알림함) ---------- */
export interface ReportData { sub: string; meta: string; title: string; who: string; items: [string, string, string][]; coach: string; say: string; photos: string[]; note: string }
export interface Activity { emoji: string; name: string; min: string; skill: string; desc: string; prep: string[]; goal: string }
export interface LessonData { sub: string; lk: string; title: string; lm: string; prog: number; acts: Activity[]; prep: string[] }
export interface RoomData { coach: string; coachMsg: string; cardH: string; cardB: string; parent: string; parentMsg: string; when: string }
export type NotiRow = [string, IconKey, string, string, string]; // target, icon, title, sub, group
export interface Detail { report: ReportData; lesson: LessonData; room: RoomData; noti: NotiRow[] }

const act = (a: [string, string, string, string, string, string[], string]): Activity =>
  ({ emoji: a[0], name: a[1], min: a[2], skill: a[3], desc: a[4], prep: a[5], goal: a[6] });

export const DETAIL: Record<string, Detail> = {
  "도담|원더짐 아카데미": {
    report: { sub: "10/20(월) · 12회차", meta: "10/20(월) · 플레이2 · 12회차 · 실제 진행한 수업 (코치 확인 완료)", title: "도담이의 수업 리포트", who: "출석 ✓ · 오후 2:30–3:30 · 김코치",
      items: [["done", "한발 서기 밸런스", "18초 — 신기록! 🎉"], ["done", "리듬 스텝 점프", "완료"], ["half", "색깔 신호 반응 게임", "다음 시간 이어서"]],
      coach: "김코치", say: "도담이가 오늘 밸런스에서 반 최고 기록을 세웠어요! 집중력도 좋아지고 있어서 다음 주 평가가 기대돼요 👏", photos: ["🤸", "🥁", "📷"],
      note: "측정·관찰은 <b>코치가 기록</b>하고, 기록된 결과(18초·신기록)는 <b>성장 리포트에 자동 반영</b> — 우리 아이 탭의 마일스톤이 함께 갱신돼요." },
    lesson: { sub: "플레이2 · 14회차", lk: "오늘 오후 2:30 예정 · 플레이2", title: "14회차 · 균형과 리듬 ②", lm: "분기 커리큘럼 24회 중 14번째 · 김코치", prog: 58,
      acts: [
        act(["🤸", "한발 서기 밸런스 게임", "10분", "균형감각", "한 발로 서서 버티는 시간을 재요. 친구들과 게임처럼 겨루면서 균형 감각을 키우는 활동이에요.", ["맨몸 (준비물 없음)"], "지난주보다 5초 더 버티기"]),
        act(["🥁", "리듬 스텝 — 박자에 맞춰 점프", "12분", "협응성", "음악 박자에 맞춰 스텝을 밟고 점프해요. 몸과 머리가 같이 움직이는 협응 과제예요.", ["실내화", "스텝판 (학원 준비)"], "8박자 스텝, 2번 연속 성공하기"]),
        act(["🧠", "색깔 신호 반응 게임", "8분", "인지·집중", "코치가 드는 색깔 카드를 보고 몸이 바로 반응해요. 초록이면 점프, 빨강이면 멈춤!", ["색깔 카드 (학원 준비)"], "신호 보고 1초 안에 반응하기"]),
      ], prep: ["👟 실내화", "물통", "양말 필수"] },
    room: { coach: "김코치", coachMsg: "수업 마쳤습니다! 아이들 모두 잘했어요. 리포트 보냈으니 확인해주세요 🙂", cardH: "수업 완료 · 12회차", cardB: "밸런스 기초 · 출석 8명<br>개별 수업 리포트가 <b>각 보호자의 앱으로</b> 발송됐어요", parent: "하윤맘", parentMsg: "오늘도 감사합니다 코치님!", when: "10/20(월) 오후 3:40" },
    noti: [["invoice", "doc", "3분기 수강료 청구서가 도착했어요 (11/10까지)", "결제 필요 · 어제", "행동 필요"], ["lesson", "clock", "오늘 플레이2 수업 3시간 전이에요 — 준비물을 확인해 주세요", "자동 리마인드 · 오전 11:30", "새 소식"], ["photos", "cam", "새 수업 사진 3장이 올라왔어요", "플레이2 · 10/20(월)", ""], ["@child", "award", "도담이가 드리블 스텝2를 달성했어요", "성장 기록 · 10/25(토)", ""]],
  },
  "서준|원더짐 아카데미": {
    report: { sub: "10/20(월) · 11회차", meta: "10/20(월) · 플레이2 유아반 · 11회차 · 실제 진행한 수업 (코치 확인 완료)", title: "서준이의 수업 리포트", who: "출석 ✓ · 오전 10:00–10:50 · 이코치",
      items: [["done", "제자리 균형 서기", "5초 — 잘 버텼어요"], ["done", "콩주머니 던지기", "완료"], ["half", "라인 따라 걷기", "다음 시간 이어서"]],
      coach: "이코치", say: "서준이가 오늘 균형 서기에서 처음으로 5초를 버텼어요! 차분하게 잘 따라와서 대견했어요 🌱", photos: ["🧸", "🎯", "📷"],
      note: "측정·관찰은 <b>코치가 기록</b>하고, 기록된 결과는 <b>성장 리포트에 자동 반영</b> — 우리 아이 탭의 마일스톤이 함께 갱신돼요." },
    lesson: { sub: "플레이2 유아반 · 12회차", lk: "오늘 오전 10:00 예정 · 플레이2 유아반", title: "12회차 · 기초 균형 놀이", lm: "분기 커리큘럼 24회 중 12번째 · 이코치", prog: 50,
      acts: [
        act(["🧸", "제자리 균형 서기", "8분", "균형감각", "제자리에서 한 발로 서 보는 놀이예요. 짧게 여러 번 반복해요.", ["맨몸 (준비물 없음)"], "3초 이상 버티기"]),
        act(["🎯", "콩주머니 던지기", "10분", "협응성", "목표를 향해 콩주머니를 던져요. 눈과 손 협응을 키워요.", ["실내화"], "목표에 3번 맞히기"]),
      ], prep: ["👟 실내화", "물통"] },
    room: { coach: "이코치", coachMsg: "오늘도 잘했어요! 유아반 아이들 모두 즐겁게 참여했어요 😊", cardH: "수업 완료 · 11회차", cardB: "기초 균형 놀이 · 출석 10명<br>개별 리포트가 <b>각 보호자의 앱으로</b> 발송됐어요", parent: "지호맘", parentMsg: "감사합니다 코치님~", when: "10/20(월) 오전 11:00" },
    noti: [["invoice", "doc", "3분기 수강료 청구서가 도착했어요 (11/10까지)", "결제 필요 · 어제", "행동 필요"], ["report", "book", "지난 수업 리포트가 도착했어요", "플레이2 유아반 11회차 · 10/20(월)", "새 소식"], ["@child", "award", "서준이가 제자리 균형 5초를 기록했어요", "성장 기록 · 10/23(목)", ""]],
  },
  "도담|강동 스포츠클럽": {
    report: { sub: "10/25(토) · 수영 초급", meta: "10/25(토) · 수영 초급반 · 실제 진행한 수업 (코치 확인 완료)", title: "도담이의 수영 진도 안내", who: "출석 ✓ · 오전 10:00–10:50 · 박코치",
      items: [["done", "자유형 발차기", "리듬이 안정됐어요"], ["done", "물속 호흡", "완료"], ["half", "팔 동작 연결", "다음 시간 이어서"]],
      coach: "박코치", say: "도담이가 물 무서움이 많이 줄었어요. 발차기 리듬이 좋아져서 다음엔 호흡 연결을 해볼게요 🏊", photos: ["🏊", "💧", "📷"],
      note: "수영 진도는 <b>박코치가 기록</b>하고, 현재 단계(자유형 등)는 <b>우리 아이 탭</b>에서 이어서 확인할 수 있어요." },
    lesson: { sub: "수영 초급반 · 주1회", lk: "이번 주 토 오전 10:00 예정 · 수영 초급반", title: "자유형 발차기 · 호흡", lm: "주1회 진행 · 박코치", prog: 70,
      acts: [
        act(["🏊", "자유형 발차기", "15분", "지구력", "킥판을 잡고 발차기 리듬을 익혀요. 곧게 차는 연습이에요.", ["수영복", "수경", "수모"], "25m 발차기 이어가기"]),
        act(["💧", "물속 호흡", "10분", "호흡", "코로 물속에서 숨을 내쉬고 고개를 들어 마셔요.", ["수경"], "5회 연속 호흡하기"]),
      ], prep: ["🩱 수영복", "🥽 수경", "🧢 수모"] },
    room: { coach: "박코치", coachMsg: "오늘 발차기 좋았어요! 다음 주엔 호흡을 붙여볼게요 🙂", cardH: "수업 완료 · 수영 초급", cardB: "자유형 발차기 · 출석 6명<br>진도 안내가 <b>각 보호자의 앱으로</b> 발송됐어요", parent: "선우맘", parentMsg: "감사합니다 코치님!", when: "10/25(토) 오전 11:00" },
    noti: [["report", "book", "수영 진도 안내가 도착했어요", "수영 초급반 · 10/25(토)", "새 소식"], ["@child", "award", "도담이가 자유형 발차기를 완료했어요", "수영 진도 · 10/25(토)", ""]],
  },
};

/* ---------- 발견 배너 (학원 단위) — 유형·출처 라벨 필수 ---------- */
export interface Banner { type: string; label: string; bg: string; t: string; s: string; cta: string; ad?: boolean }
export const BANNERS: Record<AcademyName, Banner[]> = {
  "원더짐 아카데미": [
    { type: "ACADEMY_NOTICE", label: "원더짐 소식", bg: "linear-gradient(135deg,#0E9384,#12B5A5)", t: "플레이2 금토반 신규 모집", s: "12월 개강 · 7~9세 · 원더짐 아카데미", cta: "체험 신청하기" },
    { type: "ACADEMY_NOTICE", label: "원더짐 소식", bg: "linear-gradient(135deg,#0E7C70,#12B5A5)", t: "겨울 캠프 사전 모집", s: "12월 · 축구·인라인 대상 · 원더짐 아카데미", cta: "자세히 보기" },
    { type: "CONTENT", label: "PACEFOLIO 콘텐츠", bg: "linear-gradient(135deg,#3B4A63,#1F2933)", t: "집에서 하는 균형감각 5분 놀이", s: "도담이가 이번 달 균형 활동을 많이 했어요", cta: "콘텐츠 보기" },
    { type: "COMMERCE", label: "광고 · PACEFOLIO 스토어", bg: "linear-gradient(135deg,#8A5A00,#C79A3B)", t: "수업용 인라인 보호장비", s: "PACEFOLIO 회원 특별 혜택", cta: "상품 보기", ad: true },
  ],
  "강동 스포츠클럽": [
    { type: "ACADEMY_NOTICE", label: "강동 소식", bg: "linear-gradient(135deg,#0E7490,#22A5C0)", t: "11월 자유수영 개방", s: "주말 오전 · 강동 스포츠클럽", cta: "자세히 보기" },
    { type: "CONTENT", label: "PACEFOLIO 콘텐츠", bg: "linear-gradient(135deg,#3B4A63,#1F2933)", t: "물 무서움 줄이는 집 놀이", s: "수영 초급 단계 아이에게", cta: "콘텐츠 보기" },
  ],
};

/* ---------- 학원 Q&A (원장이 등록 · 학원 단위) ---------- */
export interface QAItem { q: string; a: string; goTab?: string; goSeg?: ChildSeg; goTxt?: string }
export const QA: Record<AcademyName, { updated: string; items: QAItem[] }> = {
  "원더짐 아카데미": {
    updated: "10/23 원장님 업데이트",
    items: [
      { q: "결석하면 보강 받을 수 있나요?", a: "결석은 홈 화면에서 <b>사유와 함께 알려주시면</b> 코치·원장님께 바로 전달돼요. 전화 안 하셔도 됩니다. 보강 여부와 방식은 <b>학원 운영 기준</b>에 따라 안내되고, 지난 결석은 일정 탭의 결석 카드에서 <b>‘보강 희망 전달’</b>로 신청할 수 있어요.", goTab: "sched", goTxt: "일정에서 결석·보강 보기" },
      { q: "수강료는 언제, 어떻게 내나요?", a: "원더짐은 <b>분기제(3·6·9·12월 고정)</b>가 기본이에요. 매 분기 시작 전 청구서가 앱으로 도착하고, <b>카카오페이·신용카드</b>로 앱에서 바로 결제해요. <b>자동결제</b>를 등록하면 결제 전 청구 금액을 먼저 안내하고, 등록된 결제수단으로 자동결제를 시도해요. 실패 시 앱으로 알려드려요.", goTab: "child", goSeg: "pay", goTxt: "결제·청구서 보기" },
      { q: "형제가 같이 다니면 할인되나요?", a: "네. <b>형제 · 다종목 · 장기 할인</b> 중 가장 큰 하나가 적용되고, 진행 중인 <b>이벤트 할인</b>이 있으면 함께 얹혀요(최대 20%). 정확히 얼마가 적용됐는지는 <b>내 청구서</b>에서 항목별로 확인할 수 있어요.", goTab: "child", goSeg: "pay", goTxt: "내 청구서에서 확인" },
      { q: "중간에 그만두면 환불되나요?", a: "이용 회차·계약 내용·학원에 적용되는 기준에 따라 <b>예상 환불액을 계산</b>해요. 실제 환불 전 <b>학부모님과 원장님이 금액을 함께 확인</b>하고, 금액이 바뀌면 보호자 재확인을 받아 처리해요. 궁금한 점은 채팅으로 남겨주시면 돼요." },
      { q: "준비물은 매번 뭘 챙겨야 하나요?", a: "수업 <b>3시간 전</b>에 그날 진도와 준비물을 자동으로 알려드려요. 미리 보고 싶으면 일정 탭에서 수업을 열어 <b>‘오늘 이런 걸 해요’</b>를 펼치면 활동별 준비물이 나와요.", goTab: "sched", goTxt: "일정에서 준비물 보기" },
      { q: "차량 운행도 되나요? 비용은요?", a: "차량비는 <b>수강료와 별도</b>로 청구되고 <b>할인은 적용되지 않아요.</b> 운행 노선·시간은 학원 공지를 따라요. 신청·변경은 채팅으로 요청하면 원장님이 확인 후 안내해 드려요." },
    ],
  },
  "강동 스포츠클럽": {
    updated: "10/22 원장님 업데이트",
    items: [
      { q: "자유수영 개방은 언제 하나요?", a: "11월부터 <b>주말 오전</b>에 자유수영을 개방해요. 개방일과 이용 방법은 공지로 안내되며, 재원생은 별도 신청 없이 이용할 수 있어요." },
      { q: "수영 진도는 어떻게 확인하나요?", a: "수업마다 코치가 남긴 <b>진도 안내</b>가 아이 소식으로 도착해요. 현재 단계(자유형 등)는 <b>우리 아이 탭</b>에서 볼 수 있어요.", goTab: "child", goTxt: "우리 아이에서 진도 보기" },
      { q: "수강료·환불 기준은요?", a: "월 단위 결제가 기본이고, 중도 환불은 남은 회차를 계산해 처리해요. 자세한 기준은 채팅으로 문의하시면 원장님이 안내해 드려요." },
    ],
  },
};

/* ---------- 학원 단위 청구 정보 ---------- */
export interface Bill { k: string; title: string; amount: string; detail: string; due: string; dday: string }
export const BILL: Record<"wg" | "gd", Bill> = {
  wg: { k: "결제할 청구서 — 원생별 2건 · 합산 결제", title: "9~11월 수강료", amount: "738,000원", detail: "도담 405,000 + 서준 333,000 · 원생별 2건 합산", due: "11/10", dday: "D-14" },
  gd: { k: "", title: "9~11월 수영 수강료", amount: "96,000원", detail: "도담 수영 초급반 · 주1회", due: "11/10", dday: "완납" },
};

export const DAY_LABEL: Record<string, string> = { "26": "일", "27": "월 · 오늘", "28": "화", "29": "수", "30": "목", "31": "금", "1": "토" };
export const WEEK_DAYS = [
  { d: "26", w: "일", n: "26" }, { d: "27", w: "월", n: "27" }, { d: "28", w: "화", n: "28" },
  { d: "29", w: "수", n: "29" }, { d: "30", w: "목", n: "30" }, { d: "31", w: "금", n: "31" }, { d: "1", w: "토", n: "1" },
];

/* ---------- 헬퍼 ---------- */
export const pkeyOf = (child: ChildName, academy: AcademyName) => `${child}|${academy}`;
export const won = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "원";
