/* =========================================================
   PACEFOLIO API 클라이언트 — 아키텍처 B 의 공유 패키지 (R5 Phase 6)
   ---------------------------------------------------------
   경계: API DTO → runtime validation(zod) → ViewModel adapter → UI.
   UI 는 이 클라이언트를 통해서만 서버와 대화 — fetch 직접 호출 금지.
   - fetchFn 주입: 브라우저=window.fetch / 테스트=Hono app.request 어댑터
   - 응답도 zod 로 파싱(R6 §6.2: 타입은 네트워크를 검증하지 못한다)
   - CSRF: pf_csrf 쿠키(double-submit)를 읽어 X-CSRF-Token 자동 첨부
   ========================================================= */
import { z } from "zod";

/* ── 응답 스키마 (OpenAPI 대응 — 생성 타입 도입 전 수동 정합) ── */
const Me = z.object({
  user: z.object({
    id: z.string(), name: z.string(), phone: z.string(), email: z.string().nullable(),
  }),
  memberships: z.array(z.object({
    academyId: z.string(), roles: z.array(z.string()), status: z.string(),
  })),
});
export type Me = z.infer<typeof Me>;

const InvoiceList = z.object({
  invoices: z.array(z.object({
    invoiceId: z.string(), participantId: z.string(), participantName: z.string(),
    status: z.string(), total: z.number().int(), dueDate: z.string(),
    lines: z.array(z.object({ type: z.string(), label: z.string(), amount: z.number().int() })),
  })),
});
export type InvoiceList = z.infer<typeof InvoiceList>;

const PrepareResult = z.object({
  paymentId: z.string(), amount: z.number().int().positive(), status: z.string(),
});
export type PrepareResult = z.infer<typeof PrepareResult>;

const DevLoginResult = z.object({ userId: z.string() });

const PaymentStatus = z.object({
  paymentId: z.string(), status: z.string(), amount: z.number().int().positive(),
  invoices: z.array(z.object({ invoiceId: z.string(), status: z.string() })),
});
export type PaymentStatus = z.infer<typeof PaymentStatus>;

const RefundCreate = z.object({
  refundId: z.string(), requestedAmount: z.number().int().positive(), status: z.string(),
});
export type RefundCreate = z.infer<typeof RefundCreate>;
const RefundApprove = z.object({ refundId: z.string(), status: z.string() });
export type RefundApprove = z.infer<typeof RefundApprove>;

const ClassList = z.object({
  classes: z.array(z.object({
    classId: z.string(), name: z.string(), scheduleType: z.string(),
    capacity: z.number().int(), room: z.string().nullable(), status: z.string(),
    slots: z.array(z.object({
      weekday: z.number().int(), startTime: z.string(), endTime: z.string(),
      participantId: z.string().optional(),
    })),
    coachUserIds: z.array(z.string()),
  })),
});
export type ClassList = z.infer<typeof ClassList>;
const Roster = z.object({
  roster: z.array(z.object({
    participantId: z.string(), name: z.string(), birth: z.string(),
    ageLabel: z.string(), status: z.string(),
  })),
});
export type Roster = z.infer<typeof Roster>;
const SessionList = z.object({
  sessions: z.array(z.object({
    sessionId: z.string(), date: z.string(), startTime: z.string(), endTime: z.string(),
    status: z.string(), participantId: z.string().optional(), canceledReason: z.string().optional(),
  })),
});
export type SessionList = z.infer<typeof SessionList>;
const AttendanceSave = z.object({ recorded: z.number().int(), updated: z.number().int() });
const SessionComplete = z.object({ sessionId: z.string(), status: z.string() });

/* 원장 화면 실연결(#25) — 공지·수납 관제 */
const NoticePublish = z.object({ noticeId: z.string(), recipients: z.number().int() });
const NoticeList = z.object({
  notices: z.array(z.object({
    noticeId: z.string(), title: z.string(), body: z.string(), audience: z.string(),
    publishedAt: z.string(),
    recipients: z.number().int().optional(), // staff 전용 필드
    unread: z.number().int().optional(),
  })),
});
const BillingSummary = z.object({
  unpaidCount: z.number().int(), unpaidKrw: z.number().int(),
  paidCount: z.number().int(), paidKrw: z.number().int(),
  billedKrw: z.number().int(), capturedKrw: z.number().int(),
});

/* 소통 실연결(#31) — 원장 전달사항·코치 ACK (Batch 14 chat 계약) */
const MemberList = z.object({
  members: z.array(z.object({ userId: z.string(), name: z.string(), roles: z.array(z.string()) })),
});
const DmOpen = z.object({ roomId: z.string(), created: z.boolean() });
const ChatSend = z.object({ messageId: z.string(), status: z.string() });
const ChatRoomList = z.object({
  rooms: z.array(z.object({
    roomId: z.string(), type: z.string(), title: z.string(),
    lastReadAt: z.string().nullable(), unacked: z.number().int(),
  })),
});
const ChatMessageList = z.object({
  messages: z.array(z.object({
    messageId: z.string(), senderUserId: z.string(), kind: z.string(), category: z.string(),
    status: z.string(), body: z.string(),
    contextCard: z.string().nullable(), relatedParticipantId: z.string().nullable(),
    resolvedNote: z.string().nullable(), createdAt: z.string(),
  })),
});
const ChatAck = z.object({ status: z.string() });

/* Admin 관제(#27) — PLATFORM_ADMIN 전용(비관리자 404) */
const AdminOverview = z.object({
  academies: z.object({ total: z.number().int(), suspended: z.number().int() }),
  participants: z.number().int(),
  subscription: z.object({
    mrrKrw: z.number().int(),
    activeByPlan: z.object({ BASIC: z.number().int(), PRO: z.number().int() }),
    priceTable: z.record(z.string(), z.number().int()),
  }),
  tuition: z.object({ billedKrw: z.number().int(), unpaidKrw: z.number().int(), capturedKrw: z.number().int() }),
  refundsPending: z.number().int(),
});
const AdminAcademyList = z.object({
  academies: z.array(z.object({
    academyId: z.string(), name: z.string(), ownerName: z.string(),
    suspended: z.boolean(),
    subscription: z.object({
      plan: z.string(), status: z.string(), priceKrwMonthly: z.number().int(),
    }).nullable(),
    activeParticipants: z.number().int(), unpaidKrw: z.number().int(),
  })),
});
const AdminSubscriptionSet = z.object({ subscriptionId: z.string(), priceKrwMonthly: z.number().int() });
const AdminSuspendResult = z.object({ revokedUserSessions: z.number().int() });
const AdminCancelResult = z.object({ subscriptionId: z.string() });
const AdminSupportViewIssue = z.object({ supportViewId: z.string(), expiresAt: z.string() });
const AdminSupportViewRevoke = z.object({ supportViewId: z.string() });
const AdminSupportViewList = z.object({
  supportViews: z.array(z.object({
    id: z.string(), academyId: z.string(), academyName: z.string().nullable(),
    adminUserId: z.string(), reason: z.string(),
    issuedAt: z.string(), expiresAt: z.string(), revokedAt: z.string().nullable(),
  })),
});

/* ── 에러 — status 와 서버 error 코드 보존 ── */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? `${status} ${code}`);
    this.name = "ApiError";
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ApiClientConfig {
  baseUrl?: string;                 // 브라우저 프록시면 "" (same-origin)
  fetchFn?: FetchLike;              // 미지정 = globalThis.fetch
  getCsrfToken?: () => string | undefined; // 미지정 = document.cookie 에서 pf_csrf
}

function cookieCsrf(): string | undefined {
  // DOM lib 의존 없이 브라우저 감지(node·edge 에서도 컴파일 가능)
  const doc = (globalThis as { document?: { cookie?: string } }).document;
  if (!doc?.cookie) return undefined;
  return doc.cookie.split("; ").find((c: string) => c.startsWith("pf_csrf="))?.split("=")[1];
}

export function createApiClient(cfg: ApiClientConfig = {}) {
  const base = cfg.baseUrl ?? "";
  const fetchFn: FetchLike = cfg.fetchFn ?? ((i, init) => fetch(i, init));
  const csrf = cfg.getCsrfToken ?? cookieCsrf;

  async function call<T>(
    schema: z.ZodType<T>,
    path: string,
    init: RequestInit & { csrf?: boolean; idempotencyKey?: string } = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body) headers.set("content-type", "application/json");
    if (init.csrf) {
      const token = csrf();
      if (token) headers.set("x-csrf-token", token);
    }
    if (init.idempotencyKey) headers.set("idempotency-key", init.idempotencyKey);
    const res = await fetchFn(`${base}${path}`, {
      ...init, headers, credentials: "include",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new ApiError(res.status, body.error ?? "UNKNOWN");
    }
    if (res.status === 204) return schema.parse(undefined as never);
    return schema.parse(await res.json()); // 응답 runtime validation
  }

  return {
    /** 개발용 로그인(카카오 키 없이) — 프로덕션 API 는 404 를 반환 */
    devLogin: (name: string) =>
      call(DevLoginResult, "/auth/dev/login", { method: "POST", body: JSON.stringify({ name }) }),
    me: () => call(Me, "/sessions/me"),
    logout: () => call(z.void(), "/sessions/logout", { method: "POST", csrf: true }),
    listInvoices: (academyId: string) =>
      call(InvoiceList, `/academies/${academyId}/invoices`),
    preparePayment: (academyId: string, invoiceIds: string[], idempotencyKey: string) =>
      call(PrepareResult, `/academies/${academyId}/payments/prepare`, {
        method: "POST", csrf: true, idempotencyKey,
        body: JSON.stringify({ invoiceIds }),
      }),
    /** 결제 상태 재조회(13차 B P0-1) — 완료 화면은 이 서버 진실 확인 후에만 */
    getPayment: (academyId: string, paymentId: string) =>
      call(PaymentStatus, `/academies/${academyId}/payments/${paymentId}`),
    /* 환불 — 요청자 = 실제 결제자 · 양측 승인(side 는 서버가 역할로 도출) */
    requestRefund: (
      academyId: string,
      body: { paymentId: string; participantId: string; reasonCode: string; reasonText?: string },
      idempotencyKey: string,
    ) =>
      call(RefundCreate, `/academies/${academyId}/refunds`, {
        method: "POST", csrf: true, idempotencyKey, body: JSON.stringify(body),
      }),
    approveRefund: (academyId: string, refundId: string) =>
      call(RefundApprove, `/academies/${academyId}/refunds/${refundId}/approvals`, {
        method: "POST", csrf: true,
      }),
    /* 기본선 화면 실연결(#25) — 반·명단·세션·출결 */
    listClasses: (academyId: string) =>
      call(ClassList, `/academies/${academyId}/classes`),
    listClassRoster: (academyId: string, classId: string) =>
      call(Roster, `/academies/${academyId}/classes/${classId}/roster`),
    listClassSessions: (academyId: string, classId: string, range?: { from?: string; to?: string }) =>
      call(SessionList, `/academies/${academyId}/classes/${classId}/sessions${range?.from || range?.to ? `?${new URLSearchParams({ ...(range.from ? { from: range.from } : {}), ...(range.to ? { to: range.to } : {}) })}` : ""}`),
    recordAttendance: (academyId: string, sessionId: string, records: { participantId: string; status: string; reason?: string }[]) =>
      call(AttendanceSave, `/academies/${academyId}/sessions/${sessionId}/attendance`, {
        method: "POST", csrf: true, body: JSON.stringify({ records }),
      }),
    completeSession: (academyId: string, sessionId: string) =>
      call(SessionComplete, `/academies/${academyId}/sessions/${sessionId}/complete`, {
        method: "POST", csrf: true,
      }),
    /* 원장 공지·수납 관제(#25) */
    publishNotice: (academyId: string, body: { title: string; body: string; audience: string }) =>
      call(NoticePublish, `/academies/${academyId}/notices`, {
        method: "POST", csrf: true, body: JSON.stringify(body),
      }),
    listNotices: (academyId: string) =>
      call(NoticeList, `/academies/${academyId}/notices`),
    billingSummary: (academyId: string) =>
      call(BillingSummary, `/academies/${academyId}/billing/summary`),
    /* Admin 관제(#27) — 수익(MRR)·학원별 지표·구독 지정 */
    adminOverview: () => call(AdminOverview, "/admin/overview"),
    adminAcademies: () => call(AdminAcademyList, "/admin/academies"),
    adminSetSubscription: (academyId: string, plan: "BASIC" | "PRO") =>
      call(AdminSubscriptionSet, `/admin/academies/${academyId}/subscription`, {
        method: "PUT", csrf: true, body: JSON.stringify({ plan }),
      }),
    adminCancelSubscription: (academyId: string, reason?: string) =>
      call(AdminCancelResult, `/admin/academies/${academyId}/subscription/cancellation`, {
        method: "POST", csrf: true, body: JSON.stringify(reason ? { reason } : {}),
      }),
    /* 통제 액션 — 정지는 전 멤버 세션 즉시 폐기 + guard 차단(사유 필수·감사) */
    adminSuspendAcademy: (academyId: string, reason: string) =>
      call(AdminSuspendResult, `/admin/academies/${academyId}/suspension`, {
        method: "POST", csrf: true, body: JSON.stringify({ reason }),
      }),
    adminUnsuspendAcademy: (academyId: string) =>
      call(z.void(), `/admin/academies/${academyId}/suspension`, {
        method: "DELETE", csrf: true,
      }),
    /* 소통 실연결(#31) */
    listMembers: (academyId: string, role?: string) =>
      call(MemberList, `/academies/${academyId}/members${role ? `?role=${role}` : ""}`),
    openCoachDm: (academyId: string, coachUserId: string) =>
      call(DmOpen, `/academies/${academyId}/chat/dms`, {
        method: "POST", csrf: true,
        body: JSON.stringify({ type: "OWNER_COACH_DM", targetUserId: coachUserId }),
      }),
    sendChatMessage: (
      academyId: string, roomId: string,
      body: { kind: string; body: string; clientMessageId?: string },
    ) =>
      call(ChatSend, `/academies/${academyId}/chat/rooms/${roomId}/messages`, {
        method: "POST", csrf: true, body: JSON.stringify(body),
      }),
    listChatRooms: (academyId: string) =>
      call(ChatRoomList, `/academies/${academyId}/chat/rooms`),
    listChatMessages: (academyId: string, roomId: string) =>
      call(ChatMessageList, `/academies/${academyId}/chat/rooms/${roomId}/messages`),
    ackChatMessage: (academyId: string, messageId: string) =>
      call(ChatAck, `/academies/${academyId}/chat/messages/${messageId}/ack`, {
        method: "POST", csrf: true,
      }),
    /* 세션 리뷰: 서버·openapi 에 있던 op 의 클라이언트 누락 보완 */
    adminRevokeUserSessions: (userId: string, reason: string) =>
      call(z.void(), `/admin/users/${userId}/session-revocation`, {
        method: "POST", csrf: true, body: JSON.stringify({ reason }),
      }),
    /* SupportView — 테넌트 내부 열람의 유일한 문(사유 필수·만료·철회·감사) */
    adminListSupportViews: () => call(AdminSupportViewList, "/admin/support-views"),
    adminIssueSupportView: (academyId: string, reason: string, minutes?: number) =>
      call(AdminSupportViewIssue, "/admin/support-views", {
        method: "POST", csrf: true,
        body: JSON.stringify({ academyId, reason, ...(minutes ? { minutes } : {}) }),
      }),
    adminRevokeSupportView: (supportViewId: string, reason?: string) =>
      call(AdminSupportViewRevoke, `/admin/support-views/${supportViewId}/revocation`, {
        method: "POST", csrf: true, body: JSON.stringify(reason ? { reason } : {}),
      }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
