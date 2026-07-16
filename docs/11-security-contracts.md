# 11. 보안 계약 — CSRF · OAuth · 원자적 소비 (R4 P0)

> 4차 리뷰 §6·§7·§11·§12 반영. 구현 전 확정 계약 — 백엔드는 이 문서와
> `api/openapi.yaml`(info.description·auth 섹션)을 함께 따른다.
> 도메인 코드 근거: `guardian-linking.ts`(hash 결합·redemption·OTP actor-binding),
> `time.ts`(fail-closed), `billing.ts`(부분승인 미지원).

## A. 세션 쿠키 · CSRF (§11)

**쿠키 속성** (`pf_session`):

| 속성 | 값 |
|---|---|
| HttpOnly | ✓ (JS 접근 금지) |
| Secure | ✓ |
| SameSite | Lax |
| Path | / |
| Max-Age | 세션 정책(만료 = 서버 세션 기준, 쿠키는 힌트) |
| rotation | 로그인·권한 상승 시 세션 ID 재발급 |

**상태 변경 API CSRF 방어** — 아래 전부(다층):
1. `SameSite=Lax` (기본 차단선)
2. 서버 **Origin 검증** — allowlist 불일치 = 403 (Origin 부재 시 Referer로 폴백, 둘 다 없으면 거부)
3. **X-CSRF-Token** 헤더 = double-submit cookie 대조

대상: 결제 준비 · 환불 요청/승인 · 사진 동의 변경 · 계정 탈퇴 · 로그아웃 ·
전체 기기 로그아웃 · Support View 발급/철회 — **모든 POST/PUT/PATCH/DELETE**.

**Admin**: 별도 도메인(또는 앱)으로 분리하고 **독립적인** CSRF 방어·세션 경계를 갖는다.
학부모/원장 앱 세션으로 Admin API 호출 불가.

## B. OAuth 보안 (§12)

| 항목 | 계약 |
|---|---|
| state | 서버 저장 · **일회성 소비**(검증 즉시 폐기) · 10분 만료 |
| PKCE | S256 필수 (모든 provider) |
| nonce | OIDC provider(구글·애플) 필수 — ID 토큰 대조 |
| authorization code | 1회 사용 후 폐기 |
| redirect URI | 서버 allowlist 만 (open redirect 차단) |
| 로그인 CSRF | state 검증 실패 = 401 (계정 바꿔치기 방어) |
| email/phone | provider 가 **verified** 로 준 값만 신뢰 |
| 계정 병합 | 동일 이메일이라도 **자동 병합 금지** — 별도 인증 절차 + 사용자 명시 확인 |
| 연결 해제 | 마지막 로그인 수단 해제 금지(잠금 방지) · 해제 시 전체 세션 무효화 검토 |

## C. 초대코드 원자적 소비 (§6)

**hash 결합**: 서버는 요청 원문 코드를 hash 하여 `requestCodeHash` 로 도메인 함수에
전달 — `isInviteUsable` 이 조회된 invite 의 `codeHash` 와 직접 대조한다.
"임의 코드 + 관계없는 유효 invite → VERIFIED" 경로 차단.

**redemption 트랜잭션** — 하나의 DB 트랜잭션(§6.2, `guardian-linking.ts` 주석과 동일):
```
1. Invite row lock(또는 optimistic version)
2. revokedAt 확인            3. expiresAt 확인
4. usedCount < maxUses       5. redemption 중복 확인
6. GuardianLink 생성         7. GuardianVerification 기록
8. GuardianInviteRedemption 생성(가변 usedCount 단독 증가 금지)
9. AuditLog                 10. DomainEvent/Outbox
```
DB 제약: `UNIQUE(inviteId, guardianId, participantId)`.
단일 사용 초대는 invite 단위 조건부 unique 추가.

## D. OTP 검증 세션 (§7)

`GuardianVerificationSession` 사용 조건 (전부 만족):
- `issuedToUserId === actorUserId` (남의 세션 재사용 차단)
- `purpose === "GUARDIAN_LINK"` (다른 용도 OTP 재사용 차단)
- `consumedAt` 없음 (1회 소비)
- 미만료 (epoch 비교 · 파싱 실패 = 만료 취급)
- `verifiedPhone` 이 등록 연락처 또는 invite 지정 전화와 일치

**세션 소비 = GuardianLink 생성과 같은 DB 트랜잭션** (`consumedAt`·`consumedByLinkId` 기록).

## E. 환불 정책 (§3·§4·§5)

- **부분승인 미지원**: 전액 승인 또는 전액 거절. 일부 승인 필요 시 거절 후 재요청.
  불변식 `approvedAmount = requestedAmount = completedAmount = Σ RefundAllocation`.
- **요청자 = 실제 결제자**: `Payment.guardianId === actorGuardianId`.
  위임은 추후 `PaymentAuthority`(paymentId·delegatedGuardianId·scope·expiresAt·revokedAt) 모델로만.
- **Refund 1건 = 원생 1명**: 형제 합산결제여도 환불은 원생별 분리.
- **상호 승인 후 단독 거절 금지**: REJECTED 는 REQUESTED 단계만.
  승인 후 취소가 필요해지면 CANCELLED 상태 신설 + (누가·언제까지·재동의·감사) 정책 정의.

## F. 시간 비교 (§8)

모든 시각 판정 = `packages/domain/time.ts` 경유(epoch 정규화).
ISO 문자열 직접 비교 금지. **파싱 실패 = fail-closed**:
자격증명(초대·세션·동의·MFA) → 거부 / 멱등 dedup 레코드 → 차단 유지.
