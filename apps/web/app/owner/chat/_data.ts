/* =========================================================
   PACEFOLIO — 원장 앱 "소통" 탭 대화방 어댑터 (DB 없음, 프로토타입)
   ---------------------------------------------------------
   계약: docs/12-communication.md — 공지/채팅/업무 전달 3분리,
   원장↔코치(1:1·전체·반 담당) + 원장↔학부모(원생 컨텍스트) +
   코치↔학부모 대화 열람·참여(이력 기록).
   이름·반·원생·긴급결석 건은 lib/fixtures 정본에서 파생 —
   코치/학부모 앱과 단일 소스. 대화 내용·시각은 목업 로컬.
   헌법: 금액·건강정보는 채팅 payload 금지 (_state 가드 참조).
   ========================================================= */
import * as fx from "@/lib/fixtures";

const userName = (id: string) =>
  fx.users.find((u) => (u.id as string) === id)?.name ?? "";

export const OWNER_NAME = fx.academy.ownerName; // 김도윤
const KSJ = userName("u_coach_ksj"); // 김선재 · 플레이2 월수반 (퇴사 예정)
const LCJ = userName("u_coach_lcj"); // 이창진 · 축구 화금반
const PARK = userName("u_coach_park"); // 박정우 · 플레이3·인라인

/* 긴급결석 정본 — 홈 "오늘 처리할 일"의 그 건 (박민준 · "아파요") */
const absNotice = fx.attendanceNotices.find((n) => n.type === "ABSENCE");
const ABS_KID =
  fx.participants.find((p) => p.id === absNotice?.participantId)?.name ?? "";
const ABS_KID_SLUG = ((absNotice?.participantId as string) ?? "").replace(/^p_/, "");
const ABS_GIVEN = ABS_KID.slice(1); // "박민준" → "민준" (보호자 호칭용)

/* ---------- 메시지 ---------- */
export type OMsgSide = "them" | "me" | "sys" | "task";

/* 업무 전달 카드 — 일반 대화와 구분되는 "후속 조치" 단위 (계약 §세 가지를 분리한다) */
export interface TaskCard {
  icon: string; // 이모지 1개
  title: string; // "보강 등록 — 박민준"
  sub: string;
  action: string; // 처리 CTA 라벨
  doneNote: string; // 완료 후 이력 라벨
  done?: boolean; // 시드 초기 상태
  href?: string; // 관련 화면 (원생 카드 등)
  hrefLabel?: string;
}

export interface OMsg {
  side: OMsgSide;
  who?: string;
  text: string;
  time?: string;
  task?: TaskCard; // side === "task"
}

/* ---------- 대화방 ---------- */
export type RoomGroup = "coach" | "guardian" | "watch";

export interface OwnerRoom {
  id: string;
  name: string;
  sub: string;
  /* 그룹방 = 이모지 · 사람 = 이니셜 */
  avatar: { emoji: string } | { ini: string };
  group: RoomGroup;
  /* 학부모방 원생 컨텍스트 · watch방 참여자 표기 */
  context?: string;
  preview: string;
  previewTime: string;
  unread: number;
  seed: OMsg[];
}

export const OWNER_ROOMS: OwnerRoom[] = [
  /* ── 코치 ─────────────────────────────────────── */
  {
    id: "coach-all",
    name: "코치 전체방",
    sub: `코치 4 · ${OWNER_NAME} 원장`,
    avatar: { emoji: "📣" },
    group: "coach",
    preview: `${PARK}: 인라인 토요반 12/27 휴무 반영했습니다`,
    previewTime: "오전 11:20",
    unread: 0,
    seed: [
      { side: "sys", text: "오늘" },
      {
        side: "me",
        text: "12월 수납 기간 시작 전에 반별 회차(휴무 반영) 한 번씩 확인 부탁드려요. 이상 있으면 여기로 알려주세요 🙏",
        time: "오전 11:02",
      },
      { side: "them", who: `${LCJ} 코치`, text: "축구 화금반 확인했습니다. 설날 2/17 반영돼 있어요.", time: "오전 11:11" },
      { side: "them", who: `${PARK} 코치`, text: "인라인 토요반 12/27 휴무 반영했습니다", time: "오전 11:20" },
    ],
  },
  {
    id: "class-play2",
    name: "플레이2 월수반 담당방",
    sub: `담당 ${KSJ} 코치 · 반 업무 전달`,
    avatar: { emoji: "🤸" },
    group: "coach",
    preview: `업무 전달 — 보강 등록 (${ABS_KID})`,
    previewTime: "오후 1:40",
    unread: 1,
    seed: [
      { side: "sys", text: "오늘" },
      {
        side: "task",
        text: "",
        time: "오전 8:45",
        task: {
          icon: "✓",
          title: `결석 확인 — ${ABS_KID}`,
          sub: `오늘 2:30 플레이2 · 사유 "${absNotice?.reason ?? ""}" · 학부모 접수`,
          action: "확인",
          doneNote: "확인 완료 · 학부모에게 전달됨",
          done: true,
        },
      },
      {
        side: "them",
        who: `${KSJ} 코치`,
        text: `${ABS_GIVEN}이 어머님이 보강 문의를 주셨어요. 이번 주 토요일 인라인 앞 시간이 비어 있는데 그쪽으로 안내드릴까요?`,
        time: "오후 1:38",
      },
      {
        side: "task",
        text: "",
        time: "오후 1:40",
        task: {
          icon: "📅",
          title: `보강 등록 — ${ABS_KID}`,
          sub: "결석 1건 → 보강 1회 (학원 정책) · 일정은 학원이 지정",
          action: "보강 처리",
          doneNote: "보강 등록 완료 · 학부모 앱에 안내 발송",
          href: `/owner/students/${ABS_KID_SLUG}`,
          hrefLabel: "원생 카드",
        },
      },
    ],
  },
  {
    id: "dm-ksj",
    name: `${KSJ} 코치`,
    sub: "플레이2 월수반 · 퇴사 예정 (11/30)",
    avatar: { ini: KSJ[0] },
    group: "coach",
    preview: `${KSJ}: 인수인계 브리핑 초안 저장했습니다`,
    previewTime: "어제",
    unread: 0,
    seed: [
      { side: "sys", text: "어제" },
      {
        side: "them",
        who: `${KSJ} 코치`,
        text: "인수인계 브리핑 초안 저장했습니다. 작별 피드백은 4명 중 2명 마쳤고, 나머지는 이번 주 안에 마무리할게요.",
        time: "오후 6:10",
      },
      {
        side: "me",
        text: "고마워요. 기록은 학원에 남으니 새 코치 배정되면 그대로 이어집니다. 마지막까지 잘 부탁해요 🙏",
        time: "오후 6:24",
      },
    ],
  },
  {
    id: "dm-park",
    name: `${PARK} 코치`,
    sub: "플레이3 화목반 · 인라인 토요반",
    avatar: { ini: PARK[0] },
    group: "coach",
    preview: "나: 인라인 모집 배너 이번 주에 나가요",
    previewTime: "어제",
    unread: 0,
    seed: [
      { side: "sys", text: "어제" },
      {
        side: "them",
        who: `${PARK} 코치`,
        text: "인라인 토요반 5명이라 체험 수업 한 번 열면 좋을 것 같아요. 토요일 오전이면 제가 진행 가능합니다.",
        time: "오후 5:02",
      },
      { side: "me", text: "좋아요, 인라인 모집 배너 이번 주에 나가요. 체험 일정은 배너 반응 보고 잡죠.", time: "오후 5:15" },
    ],
  },

  /* ── 학부모 1:1 (원생 컨텍스트) ─────────────────── */
  {
    id: "g-minjun",
    name: `${ABS_KID} 보호자`,
    sub: "결석·보강 문의",
    avatar: { ini: ABS_KID[1] ?? ABS_KID[0] },
    group: "guardian",
    context: `${ABS_KID} · 플레이2 월수반`,
    preview: "보강은 언제쯤 가능할까요?",
    previewTime: "오후 1:12",
    unread: 1,
    seed: [
      { side: "sys", text: "오늘" },
      {
        side: "them",
        who: `${ABS_KID} 보호자`,
        text: `원장님, ${ABS_GIVEN}이 오늘 아파서 결석 접수했어요. 보강은 언제쯤 가능할까요?`,
        time: "오후 1:12",
      },
    ],
  },
  {
    id: "g-dodam",
    name: "김도담 보호자",
    sub: "보강 일정 확인",
    avatar: { ini: "도" },
    group: "guardian",
    context: "김도담 · 플레이2 월수반",
    preview: "나: 보강일 정해지면 앱으로 바로 안내드릴게요",
    previewTime: "10/25",
    unread: 0,
    seed: [
      { side: "sys", text: "10/25 (토)" },
      { side: "them", who: "김도담 보호자", text: "지난주 휴무 보강일이 아직 미지정으로 떠서요, 확인 부탁드려요!", time: "오전 10:40" },
      { side: "me", text: "네 어머님, 확인했습니다. 보강일 정해지면 앱으로 바로 안내드릴게요 🙂", time: "오전 10:52" },
    ],
  },

  /* ── 코치 ↔ 학부모 — 관리 열람 (계약: 열람·참여 = AuditLog) ── */
  {
    id: "w-ksj-minjun",
    name: `${KSJ} 코치 ↔ ${ABS_KID} 보호자`,
    sub: "오늘 결석 접수 대화",
    avatar: { emoji: "👀" },
    group: "watch",
    context: `${ABS_KID} · 플레이2 월수반`,
    preview: `${KSJ}: 보강은 원장님이 안내드릴게요.`,
    previewTime: "오전 8:42",
    unread: 0,
    /* 코치 앱 g1 방과 같은 대화 — 원장 관리 시점에서 열람 */
    seed: [
      { side: "sys", text: "오늘" },
      { side: "them", who: `${ABS_KID} 보호자`, text: "오늘 아파서 결석할게요 ㅠ", time: "오전 8:40" },
      {
        side: "them",
        who: `${KSJ} 코치`,
        text: "확인했어요 🙏 푹 쉬고 다음 시간에 만나요. 보강은 원장님이 안내드릴게요.",
        time: "오전 8:42",
      },
    ],
  },
];

export const roomById = (id: string) => OWNER_ROOMS.find((r) => r.id === id);
