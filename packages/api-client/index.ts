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

/* PC draft 정본화 2(#40) */
const ParticipantList = z.object({
  participants: z.array(z.object({
    participantId: z.string(), name: z.string(), ageLabel: z.string(), status: z.string(),
  })),
});
const BillingPeriodCreate = z.object({ billingPeriodId: z.string() });
const InvoiceCreate = z.object({ invoiceId: z.string(), total: z.number().int() });
const BulkDrafts = z.object({ created: z.number().int(), skipped: z.number().int(), invoiceIds: z.array(z.string()) });
const BulkIssue = z.object({ issued: z.number().int() });
const CoachSwap = z.object({ swapped: z.number().int(), affectedParticipants: z.number().int(), revoked: z.boolean() });

/* 휴무·일할(#38 — PC draft 정본화 1) */
const ClosureCreate = z.object({ closureId: z.string(), canceledSessions: z.number().int() });
const ProrationQuote = z.object({
  totalSessions: z.number().int(), remainingSessions: z.number().int(),
  amount: z.number().int(), basis: z.enum(["DB_SESSIONS", "SLOT_CALENDAR"]),
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
/* 사진(#19) */
const PhotoUpload = z.object({
  photoId: z.string(),
  upload: z.object({
    url: z.string(), method: z.literal("PUT"),
    headers: z.record(z.string(), z.string()), expiresAt: z.string(),
  }),
});
const PhotoFinalize = z.object({ photoId: z.string() });

/* 안전사고(#32) — 발생 시각은 서버가 기록 */
const IncidentCreate = z.object({ incidentId: z.string(), occurredAt: z.string() });
const IncidentList = z.object({
  incidents: z.array(z.object({
    incidentId: z.string(), participantId: z.string(), participantName: z.string(),
    reportedByUserId: z.string(), type: z.string(), severity: z.string(),
    situation: z.string(), location: z.string().nullable(), firstAid: z.string().nullable(),
    classContinued: z.boolean(), followUpNeeded: z.boolean(), guardianContact: z.string(),
    occurredAt: z.string(),
  })),
});

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

/* ── 에러 — status·서버 error 코드·응답 body 보존(#19: CONSENT_REQUIRED 차단 명단 등) ── */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
    public readonly body?: unknown,
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

/* ── 프로그램 스튜디오 스키마 (PS2) ── */
const ProgramList = z.object({
  programs: z.array(z.object({
    programId: z.string(), name: z.string(), description: z.string().optional(),
    targetAgeLabel: z.string().optional(), ownershipType: z.string(), visibility: z.string(),
    archivedAt: z.string().optional(),
    modes: z.array(z.string()),
    versions: z.array(z.object({
      versionId: z.string(), versionLabel: z.string(), status: z.string(),
      publishedAt: z.string().optional(),
    })),
  })),
});
export type StudioProgram = z.infer<typeof ProgramList>["programs"][number];
const ProgramCreate = z.object({ kind: z.string(), programId: z.string(), versionId: z.string() });
const VersionCreate = z.object({ kind: z.string(), versionId: z.string() });
const VersionPublish = z.object({ kind: z.string(), versionId: z.string() });
const VersionDetail = z.object({
  versionId: z.string(), programId: z.string(), versionLabel: z.string(), status: z.string(),
  basedOnVersionId: z.string().optional(), publishedAt: z.string().optional(),
  levels: z.array(z.object({
    levelId: z.string(), name: z.string(), code: z.string().optional(),
    description: z.string().optional(), targetAgeLabel: z.string().optional(),
    sortOrder: z.number(), color: z.string().optional(),
  })),
  sections: z.array(z.object({
    sectionId: z.string(), parentSectionId: z.string().optional(),
    sectionType: z.string(), name: z.string(), sortOrder: z.number(),
  })),
  sessions: z.array(z.object({
    curriculumSessionId: z.string(), sectionId: z.string(), name: z.string(),
    sequence: z.number(), theme: z.string().optional(), objective: z.string().optional(),
    activities: z.array(z.object({
      activityRevisionId: z.string(), name: z.string(), sortOrder: z.number(),
      required: z.boolean(), recommendedMinutes: z.number().optional(),
    })),
  })),
});
export type StudioVersionDetail = z.infer<typeof VersionDetail>;
const LevelCreate = z.object({ kind: z.string(), levelId: z.string() });
const GrowthDomainList = z.object({
  domains: z.array(z.object({
    domainId: z.string(), parentId: z.string().optional(), code: z.string().optional(),
    name: z.string(), description: z.string().optional(), category: z.string().optional(),
    color: z.string().optional(), icon: z.string().optional(),
    reportVisible: z.boolean(), active: z.boolean(), sortOrder: z.number(),
  })),
});
export type StudioGrowthDomain = z.infer<typeof GrowthDomainList>["domains"][number];
const GrowthDomainCreate = z.object({ kind: z.string(), domainId: z.string() });
const StudioActivityList = z.object({
  activities: z.array(z.object({
    activityId: z.string(), status: z.string(), currentRevisionId: z.string().optional(),
    revisionNumber: z.number().optional(), name: z.string(),
    description: z.string().optional(), difficultyLabel: z.string().optional(),
    recommendedAgeLabel: z.string().optional(), recommendedMinutes: z.number().optional(),
    growthTags: z.array(z.object({ growthDomainId: z.string(), role: z.string() })),
  })),
});
export type StudioActivity = z.infer<typeof StudioActivityList>["activities"][number];
export interface StudioActivityContent {
  name: string; description?: string; instructions?: string;
  easyVariation?: string; standardVariation?: string; challengeVariation?: string;
  coachingPoints?: string; safetyNotes?: string; difficultyLabel?: string;
  recommendedAgeLabel?: string; recommendedMinutes?: number;
  participantFormat?: string; spaceRequirement?: string;
}
const StudioActivityCreate = z.object({ kind: z.string(), activityId: z.string(), revisionId: z.string() });
const StudioActivityUpdate = z.object({ kind: z.string(), revisionId: z.string(), newRevision: z.boolean() });
const SectionCreate = z.object({ kind: z.string(), sectionId: z.string() });
const CurriculumSessionCreate = z.object({ kind: z.string(), curriculumSessionId: z.string() });

/* 가져오기 스테이징 스키마(PS3) */
const ImportStaged = z.object({
  kind: z.string(), batchId: z.string(), mapping: z.record(z.string(), z.unknown()),
  total: z.number(), valid: z.number(), invalid: z.number(), withDuplicates: z.number(),
  reuploadOfCommitted: z.boolean(),
});
const ImportBatchList = z.object({
  batches: z.array(z.object({
    batchId: z.string(), fileName: z.string(), status: z.string(),
    createdAt: z.string(), committedAt: z.string().optional(),
  })),
});
const ImportRowShape = z.object({
  rowId: z.string(), sourceRowNumber: z.number(),
  raw: z.array(z.string()),
  normalized: z.object({
    name: z.string(), description: z.string().optional(),
    primaryDomainName: z.string().optional(),
    secondaryDomainNames: z.array(z.string()),
    difficultyLabel: z.string().optional(), recommendedAgeLabel: z.string().optional(),
  }),
  validationStatus: z.string(), validationMessages: z.array(z.string()),
  duplicateCandidateIds: z.array(z.string()), resolution: z.string(),
  committedEntityId: z.string().optional(),
});
const ImportBatchDetail = z.object({
  batchId: z.string(), fileName: z.string(), status: z.string(),
  mapping: z.record(z.string(), z.unknown()),
  committedAt: z.string().optional(), revertedAt: z.string().optional(),
  rows: z.array(ImportRowShape),
});
export type ImportBatchDetail = z.infer<typeof ImportBatchDetail>;
export type ImportRow = z.infer<typeof ImportRowShape>;
const ImportCommitResult = z.object({
  kind: z.string(), created: z.number(), skipped: z.number(), invalid: z.number(),
});

/* 프로그램 실행·성장 스키마(PS4~PS6) */
const ClassAssignmentList = z.object({
  assignments: z.array(z.object({
    assignmentId: z.string(), programVersionId: z.string(),
    programLevelId: z.string().optional(), effectiveFrom: z.string(),
  })),
});
const SessionPlanView = z.object({
  classSessionId: z.string(), date: z.string(),
  plans: z.array(z.object({
    assignmentId: z.string(), programVersionId: z.string(),
    planId: z.string().optional(), planned: z.boolean(),
    curriculumSession: z.object({
      curriculumSessionId: z.string(), name: z.string(), sequence: z.number(),
    }).optional(),
    activities: z.array(z.object({
      activityRevisionId: z.string(), name: z.string(),
      recommendedMinutes: z.number().optional(), result: z.string().optional(),
    })),
  })),
});
export type SessionPlanView = z.infer<typeof SessionPlanView>;
const ExperienceMap = z.object({
  participantId: z.string(), name: z.string(), totalSessions: z.number(),
  domains: z.array(z.object({
    growthDomainId: z.string(), name: z.string(),
    experienceCount: z.number(), distinctActivities: z.number(),
    lastExperiencedAt: z.string(),
  })),
});
export type ExperienceMap = z.infer<typeof ExperienceMap>;
const VersionSkillList = z.object({
  skills: z.array(z.object({
    skillId: z.string(), programLevelId: z.string(), name: z.string(),
    description: z.string().optional(), sortOrder: z.number(),
    recommendedPracticeMin: z.number().optional(), recommendedPracticeMax: z.number().optional(),
    previousSkillId: z.string().optional(), active: z.boolean(),
    criteria: z.array(z.object({ criterionId: z.string(), label: z.string(), required: z.boolean() })),
    badge: z.object({ badgeDefinitionId: z.string(), name: z.string() }).optional(),
  })),
});
export type VersionSkillList = z.infer<typeof VersionSkillList>;
const SkillBoard = z.object({
  participants: z.array(z.object({
    participantId: z.string(), name: z.string(),
    skills: z.array(z.object({
      skillId: z.string(), name: z.string(), status: z.string(), practiceCount: z.number(),
    })),
  })),
});
export type SkillBoard = z.infer<typeof SkillBoard>;
const SkillBook = z.object({
  participantId: z.string(), name: z.string(),
  skills: z.array(z.object({
    skillId: z.string(), name: z.string(), status: z.string(), practiceCount: z.number(),
    firstPracticedAt: z.string().optional(), clearedAt: z.string().optional(),
  })),
  badges: z.array(z.object({
    awardId: z.string(), name: z.string(), skillId: z.string().optional(), awardedAt: z.string(),
  })),
});
export type SkillBook = z.infer<typeof SkillBook>;
const MyChildren = z.object({
  children: z.array(z.object({
    participantId: z.string(), name: z.string(), ageLabel: z.string(),
  })),
});

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
      throw new ApiError(res.status, body.error ?? "UNKNOWN", undefined, body);
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
    /* PC draft 정본화 2(#40) — 원생 목록·수납 기간(멱등)·청구 초안 */
    listParticipants: (academyId: string, status?: string) =>
      call(ParticipantList, `/academies/${academyId}/participants${status ? `?status=${status}` : ""}`),
    createBillingPeriod: (academyId: string, body: { periodStart: string; periodEnd: string; cycleMonths: number }) =>
      call(BillingPeriodCreate, `/academies/${academyId}/billing-periods`, {
        method: "POST", csrf: true, body: JSON.stringify(body),
      }),
    createDraftInvoice: (academyId: string, body: {
      participantId: string; billingPeriodId: string; dueDate: string;
      lines: { type: string; label: string; amount: number }[];
    }) =>
      call(InvoiceCreate, `/academies/${academyId}/invoices`, {
        method: "POST", csrf: true, body: JSON.stringify(body),
      }),
    /* 코치 교체(#42) — 배정 행 교체 + 권한 회수(원장 결정) + outbox 브리핑 */
    swapCoach: (academyId: string, body: {
      fromCoachUserId: string; toCoachUserId: string; classIds: string[];
      effectiveDate: string; revokeMode: "IMMEDIATE" | "ON_EFFECTIVE" | "KEEP";
    }) =>
      call(CoachSwap, `/academies/${academyId}/coach-swaps`, {
        method: "POST", csrf: true, body: JSON.stringify(body),
      }),
    /* 그룹 일괄 발송(#41) — 반 단위 초안 전수 생성 → 검토 → 일괄 ISSUED */
    bulkInvoiceDrafts: (academyId: string, classId: string, body: {
      billingPeriodId: string; dueDate: string; baseFee: number;
    }) =>
      call(BulkDrafts, `/academies/${academyId}/classes/${classId}/bulk-invoice-drafts`, {
        method: "POST", csrf: true, body: JSON.stringify(body),
      }),
    bulkInvoiceIssue: (academyId: string, classId: string, body: { billingPeriodId: string }) =>
      call(BulkIssue, `/academies/${academyId}/classes/${classId}/bulk-invoice-issue`, {
        method: "POST", csrf: true, body: JSON.stringify(body),
      }),
    /* 휴무·일할(#38) — "숫자 직접 수정 금지": event 등록 → 서버 재계산 */
    createClosure: (academyId: string, body: {
      scope: "ACADEMY" | "CLASS"; classId?: string;
      dateStart: string; dateEnd: string;
      closureType: string; reason: string; deductSessions: boolean;
    }) =>
      call(ClosureCreate, `/academies/${academyId}/closures`, {
        method: "POST", csrf: true, body: JSON.stringify(body),
      }),
    prorationQuote: (academyId: string, classId: string, body: {
      periodStart: string; periodEnd: string; joinDate: string; baseFee: number;
    }) =>
      call(ProrationQuote, `/academies/${academyId}/classes/${classId}/proration-quote`, {
        method: "POST", csrf: true, body: JSON.stringify(body),
      }),
    /* 원장 공지·수납 관제(#25) */
    publishNotice: (academyId: string, body: { title: string; body: string; audience: string; classId?: string }) =>
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
    /* 안전사고(#32) */
    reportIncident: (academyId: string, body: {
      participantId: string; sessionId?: string; type: string; severity: string;
      situation: string; location?: string; firstAid?: string;
      classContinued: boolean; followUpNeeded: boolean; guardianContact: string;
    }) =>
      call(IncidentCreate, `/academies/${academyId}/incidents`, {
        method: "POST", csrf: true, body: JSON.stringify(body),
      }),
    listIncidents: (academyId: string) =>
      call(IncidentList, `/academies/${academyId}/incidents`),
    /* 사진 파이프라인(#19) — 업로드 의도·동의 게이트 확정 */
    createPhotoUpload: (academyId: string, body: { sessionId?: string; contentType: string; byteSize: number }) =>
      call(PhotoUpload, `/academies/${academyId}/photos`, {
        method: "POST", csrf: true, body: JSON.stringify(body),
      }),
    finalizePhoto: (academyId: string, photoId: string, body: {
      participantIds: string[]; purpose: string; audience: string;
    }) =>
      call(PhotoFinalize, `/academies/${academyId}/photos/${photoId}/finalize`, {
        method: "POST", csrf: true, body: JSON.stringify(body),
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
    /* ── 프로그램 스튜디오 PS2 (docs/20·21·22) — 원장의 프로그램 저작 ── */
    listPrograms: (academyId: string) =>
      call(ProgramList, `/academies/${academyId}/programs`),
    createProgram: (academyId: string, body: {
      name: string; description?: string; targetAgeLabel?: string; modes: string[];
    }) =>
      call(ProgramCreate, `/academies/${academyId}/programs`, {
        method: "POST", csrf: true, body: JSON.stringify(body),
      }),
    createProgramVersion: (academyId: string, programId: string, body: {
      versionLabel: string; basedOnVersionId?: string;
    }) =>
      call(VersionCreate, `/academies/${academyId}/programs/${programId}/versions`, {
        method: "POST", csrf: true, body: JSON.stringify(body),
      }),
    publishProgramVersion: (academyId: string, versionId: string) =>
      call(VersionPublish, `/academies/${academyId}/versions/${versionId}/publish`, {
        method: "POST", csrf: true,
      }),
    getProgramVersion: (academyId: string, versionId: string) =>
      call(VersionDetail, `/academies/${academyId}/versions/${versionId}`),
    createProgramLevel: (academyId: string, versionId: string, body: {
      name: string; code?: string; targetAgeLabel?: string; sortOrder?: number; color?: string;
    }) =>
      call(LevelCreate, `/academies/${academyId}/versions/${versionId}/levels`, {
        method: "POST", csrf: true, body: JSON.stringify(body),
      }),
    listGrowthDomains: (academyId: string) =>
      call(GrowthDomainList, `/academies/${academyId}/growth-domains`),
    createGrowthDomain: (academyId: string, body: {
      name: string; parentId?: string; category?: string; icon?: string; sortOrder?: number;
    }) =>
      call(GrowthDomainCreate, `/academies/${academyId}/growth-domains`, {
        method: "POST", csrf: true, body: JSON.stringify(body),
      }),
    listStudioActivities: (academyId: string) =>
      call(StudioActivityList, `/academies/${academyId}/activities`),
    createStudioActivity: (academyId: string, body: StudioActivityContent) =>
      call(StudioActivityCreate, `/academies/${academyId}/activities`, {
        method: "POST", csrf: true, body: JSON.stringify(body),
      }),
    updateStudioActivity: (academyId: string, activityId: string, body: Partial<StudioActivityContent>) =>
      call(StudioActivityUpdate, `/academies/${academyId}/activities/${activityId}`, {
        method: "PATCH", csrf: true, body: JSON.stringify(body),
      }),
    archiveStudioActivity: (academyId: string, activityId: string) =>
      call(z.object({ kind: z.string() }), `/academies/${academyId}/activities/${activityId}/archive`, {
        method: "POST", csrf: true,
      }),
    setActivityGrowthTags: (academyId: string, activityId: string, tags: {
      growthDomainId: string; role: "PRIMARY" | "SECONDARY";
    }[]) =>
      call(z.object({ kind: z.string() }), `/academies/${academyId}/activities/${activityId}/growth-tags`, {
        method: "PUT", csrf: true, body: JSON.stringify({ tags }),
      }),
    createCurriculumSection: (academyId: string, versionId: string, body: {
      sectionType: string; name: string; parentSectionId?: string; sortOrder?: number;
    }) =>
      call(SectionCreate, `/academies/${academyId}/versions/${versionId}/sections`, {
        method: "POST", csrf: true, body: JSON.stringify(body),
      }),
    createCurriculumSession: (academyId: string, versionId: string, body: {
      sectionId: string; name: string; sequence: number; theme?: string; objective?: string;
    }) =>
      call(CurriculumSessionCreate, `/academies/${academyId}/versions/${versionId}/sessions`, {
        method: "POST", csrf: true, body: JSON.stringify(body),
      }),
    setCurriculumSessionActivities: (academyId: string, curriculumSessionId: string, activities: {
      activityId: string; required?: boolean; recommendedMinutes?: number;
    }[]) =>
      call(z.object({ kind: z.string(), count: z.number().optional() }),
        `/academies/${academyId}/curriculum-sessions/${curriculumSessionId}/activities`, {
          method: "PUT", csrf: true, body: JSON.stringify({ activities }),
        }),
    /* 가져오기 스테이징 PS3 — 업로드→미리보기→행수정→커밋→되돌리기 */
    stageImport: (academyId: string, body: { fileName: string; csvText: string; mapping?: object }) =>
      call(ImportStaged, `/academies/${academyId}/imports`, {
        method: "POST", csrf: true, body: JSON.stringify(body),
      }),
    listImports: (academyId: string) =>
      call(ImportBatchList, `/academies/${academyId}/imports`),
    getImportBatch: (academyId: string, batchId: string) =>
      call(ImportBatchDetail, `/academies/${academyId}/imports/${batchId}`),
    updateImportRow: (academyId: string, batchId: string, rowId: string, body: {
      normalized?: { name?: string; description?: string; primaryDomainName?: string; secondaryDomainNames?: string[] };
      resolution?: "CREATE" | "SKIP";
    }) =>
      call(z.object({ kind: z.string(), validationStatus: z.string().optional() }),
        `/academies/${academyId}/imports/${batchId}/rows/${rowId}`, {
          method: "PATCH", csrf: true, body: JSON.stringify(body),
        }),
    commitImport: (academyId: string, batchId: string) =>
      call(ImportCommitResult, `/academies/${academyId}/imports/${batchId}/commit`, {
        method: "POST", csrf: true,
      }),
    revertImport: (academyId: string, batchId: string) =>
      call(z.object({ kind: z.string(), archived: z.number() }),
        `/academies/${academyId}/imports/${batchId}/revert`, { method: "POST", csrf: true }),
    /* 프로그램 실행 PS4~PS6 — 반 적용·오늘 계획·결과 확정·성장 조회 */
    assignProgramToClass: (academyId: string, classId: string, body: {
      programVersionId: string; programLevelId?: string; effectiveFrom: string;
    }) =>
      call(z.object({ kind: z.string(), assignmentId: z.string() }),
        `/academies/${academyId}/classes/${classId}/program-assignments`, {
          method: "POST", csrf: true, body: JSON.stringify(body),
        }),
    listClassProgramAssignments: (academyId: string, classId: string) =>
      call(ClassAssignmentList, `/academies/${academyId}/classes/${classId}/program-assignments`),
    getSessionPlan: (academyId: string, sessionId: string) =>
      call(SessionPlanView, `/academies/${academyId}/sessions/${sessionId}/plan`),
    createSessionPlan: (academyId: string, sessionId: string, body: {
      assignmentId: string; curriculumSessionId?: string;
    }) =>
      call(z.object({ kind: z.string(), planId: z.string() }),
        `/academies/${academyId}/sessions/${sessionId}/plan`, {
          method: "POST", csrf: true, body: JSON.stringify(body),
        }),
    confirmSessionResults: (academyId: string, planId: string, body: {
      results: { activityRevisionId: string; result: string; replacementActivityRevisionId?: string; coachNote?: string }[];
      participantOverrides?: { participantId: string; participation: string }[];
    }) =>
      call(z.object({ kind: z.string(), resultsSaved: z.number(), participants: z.number(), experienceEvents: z.number() }),
        `/academies/${academyId}/session-plans/${planId}/results`, {
          method: "POST", csrf: true, body: JSON.stringify(body),
        }),
    experienceMap: (academyId: string, participantId: string) =>
      call(ExperienceMap, `/academies/${academyId}/participants/${participantId}/experience-map`),
    /* 기술·뱃지 PS5 */
    listVersionSkills: (academyId: string, versionId: string) =>
      call(VersionSkillList, `/academies/${academyId}/versions/${versionId}/skills`),
    recordSkillPractice: (academyId: string, participantId: string, skillId: string, body: {
      result: string; classSessionId?: string; coachNote?: string;
    }) =>
      call(z.object({ kind: z.string(), status: z.string(), practiceCount: z.number() }),
        `/academies/${academyId}/participants/${participantId}/skills/${skillId}/practice`, {
          method: "POST", csrf: true, body: JSON.stringify(body),
        }),
    clearSkill: (academyId: string, participantId: string, skillId: string, body: {
      checkedCriteriaIds: string[]; classSessionId?: string;
    }) =>
      call(z.object({ kind: z.string(), alreadyCleared: z.boolean(), badgeAwarded: z.boolean() }),
        `/academies/${academyId}/participants/${participantId}/skills/${skillId}/clearance`, {
          method: "POST", csrf: true, body: JSON.stringify(body),
        }),
    classSkillBoard: (academyId: string, classId: string) =>
      call(SkillBoard, `/academies/${academyId}/classes/${classId}/skill-board`),
    skillBook: (academyId: string, participantId: string) =>
      call(SkillBook, `/academies/${academyId}/participants/${participantId}/skill-book`),
    /* PS6 보호자 */
    myChildren: (academyId: string) =>
      call(MyChildren, `/academies/${academyId}/my-children`),
    /* PS7 준비 */
    duplicateProgram: (academyId: string, programId: string) =>
      call(z.object({ kind: z.string(), programId: z.string(), versionId: z.string() }),
        `/academies/${academyId}/programs/${programId}/duplicate`, { method: "POST", csrf: true }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
