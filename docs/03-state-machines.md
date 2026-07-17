# 03 · 상태머신 (State Machines)

엔티티가 어떤 상태를 거치고, **누가** 전이시키며, 어떤 **조건(guard)**이 필요한가.
상태값 = `packages/domain/enums.ts`. 엔티티 = [02-entity-model.md](./02-entity-model.md).
⚠️ 실서비스에선 **전이 권한·guard를 서버가 검증**(클라 신뢰 금지, 리뷰 P0-5·6).

표기: `상태 --[행동 / 주체 · 조건]--> 상태`

---

## 1. Invoice (청구서)
```
DRAFT --[발행 / 원장·시스템]--> ISSUED
ISSUED --[부분입금 / 결제캡처]--> PARTIALLY_PAID
ISSUED|PARTIALLY_PAID --[전액충족 / PaymentAllocation 합=total]--> PAID
ISSUED|PARTIALLY_PAID --[dueDate 경과 · 미충족]--> OVERDUE
OVERDUE --[입금]--> PARTIALLY_PAID|PAID
DRAFT|ISSUED --[취소 / 원장]--> VOID
PAID --[환불완료 / Refund COMPLETED]--> REFUNDED
```
- PAID 판정은 **PaymentAllocation 합계 = Invoice.total** 로만. 이름·화면표시로 판정 금지.
- OVERDUE는 배치가 dueDate 기준 계산(파생 상태) — 저장값과 재계산 일치 필요.

## 2. Payment (보호자 합산 결제)
```
PENDING --[결제요청 / 보호자 · idempotencyKey]--> AUTHORIZED
AUTHORIZED --[PG 승인 webhook · 서명검증]--> CAPTURED
AUTHORIZED --[승인실패/타임아웃 → PG 재조회]--> FAILED
PENDING|AUTHORIZED --[취소]--> CANCELLED
CAPTURED --[부분환불]--> PARTIALLY_REFUNDED
CAPTURED|PARTIALLY_REFUNDED --[전액환불]--> REFUNDED
```
- **UI 성공 ≠ CAPTURED.** CAPTURED는 오직 PG webhook(서명검증·event ID 중복방지) 또는 서버 재조회로.
- 금액은 서버가 재검증. 같은 idempotencyKey 재요청은 신규결제 생성 안 함.

## 3. Refund (환불)
```
REQUESTED --[학부모 또는 원장 발의]--> (상대 승인 대기)
REQUESTED --[학부모+원장 양측 승인 / 상호승인]--> MUTUALLY_APPROVED
REQUESTED --[일방 거절]--> REJECTED
MUTUALLY_APPROVED --[PG 환불 실행]--> PROCESSING
PROCESSING --[PG 환불 webhook]--> COMPLETED
```
- **상호 승인 필수**(헌법). 회차 자동계산(남은회차/전체 × 분기료). 법정기준이 바닥(더 후하게만).
- COMPLETED 시 대상 Invoice → REFUNDED, Payment → (PARTIALLY_)REFUNDED 반영.

## 4. 출결 — Notice(예정) → Record(실제)  *(두 트랙, 절대 안 합침)*
```
[Notice]  (없음) --[보호자 통보]--> CREATED(type=ABSENCE/LATE/EARLY_LEAVE)
          CREATED --[보호자 취소/사유변경]--> UPDATED|CANCELLED
          CREATED --[코치 명단 반영]--> (COACH_ROSTER_UPDATED 이벤트)

[Record]  (없음) --[코치 수업현장 확정]--> PRESENT|ABSENT|LATE|EARLY_LEAVE|EXCUSED
          확정값 --[정정 / 코치·원장 · AttendanceRevision 남김]--> 새 값
```
- Notice(보호자 예정)를 Record(실제)로 **자동 승격 금지.** 코치 확정이 유일한 실제 출결.
- 흐름: `NOTICE_CREATED → OWNER_TASK_CREATED → COACH_ROSTER_UPDATED → ACTUAL_ATTENDANCE_RECORDED → OWNER_TASK_RESOLVED → GUARDIAN_NOTIFIED`.

## 5. OperationalTask (운영 작업) — 2축 분리  *(리뷰 3-3)*
```
workflowStage:  NEEDS_ACTION --> IN_PROGRESS --> RESOLVED
actionResult:   NOT_STARTED --> SENT --> ACKNOWLEDGED   (또는 --> FAILED --재시도--> SENT)
```
- **두 축은 독립.** 예: 결제 리마인드 = `{stage: IN_PROGRESS, result: SENT}` (보냈지만 미납 미해결).
- RESOLVED 조건은 작업별로 명시(예: 미납 → Invoice PAID). Boolean 하나로 합치지 않음.

## 6. AcademyMembership (학원 소속)
```
INVITED --[수락]--> ACTIVE
ACTIVE --[원장 정지]--> SUSPENDED --[해제]--> ACTIVE
ACTIVE --[MembershipExitRequest 승인]--> ENDED
```
- ENDED 전이 시: 담당반 권한회수 · 원생/사진/건강정보 접근차단 · **모든 세션·토큰 만료** · 인수인계 확인 · 감사기록 유지.
- 코치는 즉시 ENDED 불가 → 반드시 ExitRequest(미완료 확인 → 인수인계 → 원장 승인) 경유.

## 7. GuardianVerification (자녀 연결 검증)  *(리뷰#2 P0-2)*
```
UNVERIFIED --[연결 시도(학원선택/초대코드)]--> PENDING
PENDING --[폰 OTP + 학원 등록정보 일치 + 관계·동의]--> VERIFIED
PENDING --[불일치/만료]--> REJECTED
```
- VERIFIED 전까지 자녀 데이터 접근 불가. 이름+생년만으로 VERIFIED 금지.

## 8. PhotoConsent (사진 동의)
```
(수집) CONSENTED(purpose·audience·expiresAt) 
   --[발송시점]--> 재검증(만료·철회·범위 확인) → 허용|차단
   --[범위 확대(내부→홍보 등)]--> 재동의 필요
   --[보호자 철회]--> REVOKED (이후 발송 차단)
```
- 매 발송·범위확대 시 서버 재검증. `photoChecked:boolean` 단일 플래그 금지.

## 9. SupportViewSession (관리자 지원 접근)
```
(발급: reasonCode 필수) ISSUED(expiresAt=+15분, maskingLevel, allowedResources)
   --[매 API 요청]--> 서버가 유효성 검증(만료·범위·마스킹)
   --[15분 경과]--> EXPIRED   --[관리자·시스템 회수]--> REVOKED
```
- 클라 타이머로 만료시키지 않음. 시작·종료·조회 전부 AuditLog.

## 10. 계정 탈퇴 / 학원 나가기  *(서로 다름)*
```
[MembershipExitRequest] REQUESTED --미완료·인수인계--> 원장 APPROVED --> 권한회수·세션만료 (계정은 유지)
[AccountDeletionRequest] REQUESTED --> 즉시삭제(프로필) + 보관(결제·출결·안전사고·감사) + 익명화
                          --recoverableUntil 내--> 복구 가능 / 자동결제 해지 확인
```
- 탈퇴가 결제·출결·안전사고·감사 기록을 **즉시 전삭하지 않음**(법적·운영 보관).

---
### 서버 검증 필수(공통)
모든 전이에서 (1) 행위자 역할·소속 academyId (2) 대상 엔티티 academyId 일치 (3) 해당 행동 권한 (4) idempotency(청구확정·결제·환불·대량알림)를 서버가 확인. 상세 권한표 = `docs/04-permission-matrix.md`(F6, 예정).
