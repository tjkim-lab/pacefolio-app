/* 보호자 온보딩 — 데이터(중립 샘플만 · 실 개인정보 없음)
   모델(2026-07-19 개정): 학원이 미리 등록한 원생을 "매칭"하지 않는다.
   학부모가 초대코드/링크로 학원에 진입 → 본인인증 → 아이를 "직접 등록".
   docs/design/guardian-zem-benchmark.md 참조. */

export type IllustKey = "lesson" | "movement" | "badge" | "report" | "finish";

export interface Slide {
  key: IllustKey;
  title: string;      // 2줄 권장 — \n 로 개행
  body: string;       // 2~3줄
  accent: string;
}

/* O1 캐러셀: 4 + 마지막(진입 CTA). 요청서 §5 카피 준수. */
export const SLIDES: Slide[] = [
  { key: "lesson", title: "오늘 어떤 경험을 했는지\n한눈에 확인하세요", body: "참여한 활동과 코치의 수업 이야기를\n간편하게 볼 수 있어요.", accent: "#12b5a5" },
  { key: "movement", title: "참여할수록\n움직임 경험이 쌓여요", body: "균형, 이동, 조작 등\n아이의 다양한 움직임 경험을 확인하세요.", accent: "#2563eb" },
  { key: "badge", title: "하나씩 완성하는\n아이만의 성장 여정", body: "코치가 기술을 확인하면\n새로운 뱃지가 도착해요.", accent: "#a87b1e" },
  { key: "report", title: "비교가 아닌\n아이 자신의 성장을 기록해요", body: "경험의 다양성, 꾸준함과\n기술 진도를 함께 볼 수 있어요.", accent: "#0e9384" },
  { key: "finish", title: "아이의 모든 성장을\nPACEFOLIO에서 만나보세요", body: "휴대폰 인증하고 우리 아이를 등록하면\n바로 시작할 수 있어요.", accent: "#12b5a5" },
];

/* O5 약관 — 필수/선택 분리. 마케팅=선택(미동의도 가입 가능). */
export interface Agreement { id: string; required: boolean; label: string; detail: string; }
export const AGREEMENTS: Agreement[] = [
  { id: "tos", required: true, label: "서비스 이용약관", detail: "PACEFOLIO 서비스 이용에 대한 기본 약관이에요. (데모 — 실제 약관 전문 링크 연결 예정)" },
  { id: "privacy", required: true, label: "개인정보 수집·이용 동의", detail: "본인확인·아이 성장기록 관리를 위해 최소한의 정보를 수집해요. (데모)" },
  { id: "age", required: true, label: "만 14세 이상입니다", detail: "보호자 본인확인을 위해 필요해요. (데모)" },
  { id: "marketing", required: false, label: "혜택·소식 마케팅 정보 수신 (선택)", detail: "새 소식과 혜택을 알려드려요. 동의하지 않아도 가입·이용에 영향 없어요." },
];

/* ---- 학원(테넌트) : 초대코드/학원찾기로 결정 ---- */
export interface Program { id: string; label: string; hint?: string; }
export interface Academy { id: string; name: string; theme: string; programs: Program[]; code?: string; }

/* 데모 학원 — 실서비스는 서버가 초대코드로 학원·프로그램 반환.
   code = LIVE 모드에서 "학원 찾기" 선택 시 서버 resolveInvite 로 매핑(원더짐만 seed). */
export const ACADEMIES: Academy[] = [
  {
    id: "wondergym", name: "원더짐 아카데미", theme: "#12b5a5", code: "WG2025",
    programs: [
      { id: "play1", label: "PLAY 1", hint: "만 4~5세" },
      { id: "play2", label: "PLAY 2", hint: "만 6~7세" },
      { id: "play3", label: "PLAY 3", hint: "만 8세~" },
      { id: "soccer", label: "축구" },
      { id: "basket", label: "농구" },
      { id: "badminton", label: "배드민턴" },
    ],
  },
  {
    id: "gangdong", name: "강동 스포츠클럽", theme: "#2563eb", code: "GD2025",
    programs: [
      { id: "swim-b", label: "수영 초급" },
      { id: "swim-i", label: "수영 중급" },
      { id: "inline", label: "인라인" },
    ],
  },
];

/* 데모 초대코드 → 학원. 대소문자·공백 무시. 미존재 코드 = 오류. */
export const INVITE_CODES: Record<string, string> = {
  WG2025: "wondergym",
  GD2025: "gangdong",
};
export function academyByCode(raw: string): Academy | null {
  const key = raw.replace(/\s/g, "").toUpperCase();
  const id = INVITE_CODES[key];
  return id ? ACADEMIES.find((a) => a.id === id) ?? null : null;
}
export const academyById = (id: string | null) => ACADEMIES.find((a) => a.id === id) ?? null;

/* ---- 아이 등록 초안(부모가 직접 입력) ---- */
export interface ChildDraft { id: string; name: string; birth: string; programId: string; }
export const AVATAR_COLORS = ["#12b5a5", "#2563eb", "#a87b1e", "#0e9384", "#7c3aed"];

/* 인증번호 시뮬 정책: 아무 6자리나 성공. "000000" = 오류 데모. */
export const OTP_LEN = 6;
export const OTP_WRONG_DEMO = "000000";
export const OTP_RESEND_SEC = 180;

export const ONBOARDED_KEY = "pf_guardian_onboarded";
