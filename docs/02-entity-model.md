# 02 · 엔티티 모델 (도메인 설계도)

두 리뷰(2026-07-16) + 헌법(CLAUDE.md)을 합친 PACEFOLIO 도메인 엔티티.
코드: `packages/domain/ids.ts`(식별자)·`enums.ts`(상태). 상태 전이는 [03-state-machines.md](./03-state-machines.md).
⚠️ **DB 스키마가 아니라 "모델 계약"** — 프론트 mock과 미래 API가 공유. 헌법: 착공 前 정의.

## 관계 한눈에
```
Organization
  └─ Academy (테넌트 격리 단위 · 모든 데이터에 academyId)
       ├─ AcademyMembership ── User (역할: OWNER/MANAGER/COACH/DESK/DRIVER)
       ├─ Program (부문: BRAIN/ACTIVE) ─ Class (주N회) ─ ClassSession (회차)
       │                                   └─ ClassAssignment ── User(COACH)
       ├─ Participant (원생, 계정 없음)
       │     ├─ GuardianParticipantLink ── Guardian(User) [+ GuardianVerification]
       │     └─ Enrollment ── Class
       ├─ 출결:  AttendanceNotice(예정) │ AttendanceRecord(실제) │ AttendanceRevision
       ├─ 청구:  BillingPeriod ─ Invoice ─ InvoiceLine
       ├─ 결제:  Payment ─ PaymentAllocation → Invoice   │ Refund
       ├─ 동의:  ConsentPolicy ─ ConsentRecord │ PhotoConsent ─ PhotoAsset
       ├─ 운영:  OperationalTask │ SupportTicket │ SupportViewSession │ AuditLog
       └─ 알림:  Notification │ NotificationPreference │ CalendarSubscription
DomainEvent (앱 간 흐름) · Onboarding{Checklist,Step} · {Membership Exit, AccountDeletion}Request
```
**철칙(리뷰 P0-2):** 화면엔 이름, 상태·관계·API는 **항상 ID**. `academyId`는 거의 모든 엔티티에 존재 = 멀티테넌트 격리 축.

---

## A. 조직 · 계정
### Organization
`id` · name · plan — 여러 Academy(지점) 소유 가능.
### Academy  *(테넌트)*
`id` · organizationId · name · themeColor/themeInk/logoEmoji · ownerName · billingCycleDefault(=분기). **모든 하위 데이터 격리의 기준.**
### User
`id` · name · UserProfile(사진·bio) · UserContact(인증된 phone/email) · UserIdentity(카카오/네이버/구글/애플 로그인) · UserSession[]. **프로필과 학원역할을 한 테이블에 합치지 않는다**(리뷰#2) → 역할은 아래.
### AcademyMembership  *(User × Academy × Role)*
`id` · userId · academyId · **roles[]**(멀티역할 모델 A — 유저 확정, 예: 원장 코치 겸직 `["OWNER","COACH"]`) · status(INVITED/ACTIVE/SUSPENDED/ENDED) · joinedAt · endedAt · invitedBy · approvedBy · permissionOverrides. 한 User가 여러 학원 가능(코치가 두 학원 근무 등) — 사용자×학원 = membership 1건.

## B. 사람 · 관계
### Participant  *(원생 — 계정 없음)*
`id` · academyId · name · birth · ageLabel · (등번호·포지션은 여기/등록이지 코치 프로필 아님, 리뷰#2 4-4). 원장이 선등록 → 보호자가 폰번호로 클레임(헌법).
### Guardian
User의 GUARDIAN 역할 표현. 보호자↔자녀 **N:M**(형제, 부/모 각각).
### GuardianParticipantLink  *(보호자 ↔ 자녀)*
`id` · guardianId · participantId · academyId · relationshipType · isPrimaryGuardian · **권한플래그**(canViewSchedule/Attendance/HealthInfo·canReceivePhotos·canPay·canRequestRefund) · verificationStatus. 리뷰#2 P0-2.
### GuardianVerification
`id` · linkId · method(PHONE_OTP/INVITE_CODE/MANUAL) · status · verifiedAt. **이름+생년만으로 연결 금지** — OTP + 학원 등록정보 일치 필요.

## C. 수업 · 등록
### Program  *(부문 › 프로그램)*
`id` · academyId · division(BRAIN/ACTIVE) · name(플레이1·2·3=연령배정 / 인라인·축구·농구·배드민턴) · ageLabel.
### Class  *(반)*
`id` · academyId · programId · name · daysLabel · **perWeek(주N회 필수)** · time · capacity · enrolled.
### ClassSession  *(회차 — 날짜 있는 수업 1회)*
`id` · classId · academyId · date · status(정상/휴무/공휴일). **회차 = 청구·출결·사진의 기준 단위.** 공휴일·휴무는 그 반 수업요일과 겹칠 때만 회차 차감.
### ClassAssignment
`id` · classId · userId(COACH) · academyId · role(담당/보조) · from/to. 코치 교체 시 이관.
### Enrollment  *(등록)*
`id` · participantId · classId · academyId · startedAt · status. 원생 × 반.

## D. 출결  *(예정 ≠ 실제, 리뷰 3-4 — 절대 한 필드로 합치지 않음)*
### AttendanceNotice  *(보호자 통보 = 예정)*
`id` · academyId · participantId · classSessionId · type(ABSENCE/LATE/EARLY_LEAVE) · reason · createdBy(guardian) · createdAt.
### AttendanceRecord  *(코치 확정 = 실제)*
`id` · academyId · participantId · classSessionId · status(PRESENT/ABSENT/…) · confirmedBy(coach) · confirmedAt.
### AttendanceRevision
`id` · recordId · prev → next · revisedBy · revisedAt · reason. 정정 이력(누가 언제 왜).

## E. 청구 · 결제 · 환불  *(리뷰 3-5 — Invoice/Payment/Allocation/Refund 분리)*
### BillingPeriod  *(수납기간)*
`id` · academyId · **periodStart(YYYY-MM-DD)** · periodEnd · cycleMonths(1/3). 표기 통일, "분기" 문구 금지(리뷰 P0-4).
### Invoice  *(청구서 = 원생·등록·수납기간 단위)*
`id` · academyId · participantId · enrollmentId · billingPeriodId · status(→03) · subtotal/discount/total · dueDate. **형제 = 원생별 각 Invoice.**
### InvoiceLine
`id` · invoiceId · type(TUITION/VEHICLE/DISCOUNT/OTHER) · label · amount. 차량비 = 동일구조·별도·무할인(헌법). 할인 = 형제20·다종목10·장기5 중 MAX ×이벤트5, 상한20%.
### Payment  *(보호자 합산 결제 1건)*
`id` · academyId · guardianId · amount · status(→03) · pgTokenRef · idempotencyKey. 여러 Invoice 합산 가능.
### PaymentAllocation  *(결제 → 원생별 배분)*
`id` · paymentId · invoiceId · amount. **합산결제 후에도 원생별 정산·미납·부분환불이 가능해지는 핵심.**
### Refund
`id` · academyId · invoiceId(또는 allocationId) · amount · status(→03, 상호승인) · reason. 회차 자동계산("남은 8회차, 96,000원"). 법정기준이 바닥.

## F. 동의 · 개인정보  *(리뷰 P0-7·4-1·4-2)*
### ConsentPolicy / ConsentRecord
policy: version·purpose·audience·text. record: guardianId·participantId·policyVersion·consentedAt·expiresAt·revokedAt.
### PhotoConsent / PhotoAsset
consent: asset/participant별 allowedPurpose·allowedAudience·consentedAt·revokedAt. **발송·범위확대·철회 시 재검증.** 목적(개별전달/반공유/내부/홍보/광고/SNS)·대상 분리.
### (개인정보 공개범위)
민감필드는 `PrivacyVisibility` 정책값으로 제한. **사용자가 임의 "전체공개" 불가.** 의료·건강정보는 프로필 아닌 **원생 안전정보**로 분리(알레르기·약·응급조치·활동제한·긴급연락), 접근=보호자·담당/대체코치·원장/승인 안전담당 + 조회기록.

## G. 알림
### Notification
`id` · academyId · recipientUserId · category · tier(REQUIRED/OPTIONAL/PROMOTIONAL) · channel · status · relatedEntity(참조 ID). 금액은 채팅·잠금화면 미표시(헌법).
### NotificationPreference
userId · academyId · category별 channel on/off. **REQUIRED(안전사고·결제실패)는 끌 수 없음.**
### CalendarSubscription
userId · academyId · icsUrl · scope. 외부 캘린더에 건강정보·금액·상세사유 금지(리뷰#2 P1-2).

## H. 운영 · 관리자
### OperationalTask
`id` · academyId · workflowStage(NEEDS_ACTION/IN_PROGRESS/RESOLVED) × actionResult(NOT_STARTED/SENT/ACK/FAILED) · relatedEntity · assignee · dueAt. **"행동 완료 ≠ 문제 해결"**(리뷰 3-3).
### SupportTicket
`id` · academyId · participant/guardian/invoice/payment/refund/session/notification 참조 · category(긴급 안전 ≠ 일반 CS 분리) · status.
### SupportViewSession  *(관리자 읽기전용 접근)*
`id` · adminUserId · academyId · reasonCode/Text · allowedResources · maskingLevel · issuedAt · **expiresAt(15분)** · revokedAt · auditLogId. **클라 타이머 아닌 서버가 매 요청 유효성 검증**(리뷰 3-6).
### AuditLog
`id` · academyId · actorId · action · targetEntity · at · (마스킹 해제·민감조회 기록).

## I. 계정 라이프사이클  *(리뷰#2 P0-5)*
### MembershipExitRequest  *(학원 나가기 ≠ 탈퇴)*
`id` · membershipId · 미완료업무·인수인계 · approvedBy(원장) · status. 승인 후 권한회수·세션만료.
### AccountDeletionRequest  *(계정 탈퇴)*
`id` · userId · 즉시삭제분 / 보관분(결제·출결·안전사고·감사) / 익명화분 · recoverableUntil · 자동결제 해지여부. **전삭 즉시 금지.**

## J. 온보딩 · 이벤트
### OnboardingChecklist / OnboardingStep
역할별(원장·코치·학부모) 진행 단계. 상시 하단패널 X → 홈 상단 진행카드(리뷰#2 P1-3).
### DomainEvent  *(앱 간 흐름, 리뷰 P0-3)*
`eventId` · eventType · academyId · participantId · classSessionId · actorId · actorRole · occurredAt · idempotencyKey · correlationId · causationId · payloadVersion. 최종 기준데이터는 엔티티에 저장, 이벤트는 상태변경 전달 수단.
