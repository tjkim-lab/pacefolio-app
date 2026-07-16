# 05 · 학원 멤버십 · 보호자-자녀 연결 (F7·F8)

계정이 학원·역할·자녀와 어떻게 연결되나. 코드: `lib/domain/membership.ts` · `guardian-linking.ts`.
리뷰#2 P0-1(멤버십)·P0-2(자녀 연결).

## 1. 학원 멤버십 (F7)
> **User ≠ 학원 역할.** 한 User 테이블에 역할을 합치면 여러 학원 소속을 못 다룬다(리뷰#2).

- **AcademyMembership** = `User × Academy × Role × status`. 한 User가 여러 개 가질 수 있다.
  - 코치가 두 학원 근무 → 멤버십 2개.
  - 원장이 여러 지점 운영 → 멤버십 여러 개.
- **테넌트 격리 공급:** `academyIdsForUser()`(ACTIVE만) → F6 `inTenantScope()` 의 actor 집합. **서버가 세션에서 도출**(클라 입력 신뢰 금지).
- **역할 해석:** `roleInAcademy(userId, academyId)` — 소속 아니면 `null` = 접근 차단 신호.
- **학원 전환 UI(리뷰#2 P1-1):** `hasMultipleAcademies()` 로 필요 판단. 전환 시 **테마만이 아니라 모든 API의 academyId 범위가 함께 전환**. 명칭은 역할별로(코치=근무 학원, 원장=운영 학원, 학부모=아이·학원, Admin=조회 대상).
- 멤버십 상태머신(INVITED→ACTIVE→SUSPENDED/ENDED) = docs/03 §6. ENDED 시 권한 회수·세션 만료.

## 2. 보호자-자녀 연결 (F8)
> ⚠️ **이름+생년만으로 연결 금지.** OTP + 학원 등록정보 일치 필수(리뷰#2 P0-2).

### 흐름
```
자녀 연결 시작
 → 학원 선택 또는 초대코드 입력
 → 보호자 휴대전화 OTP 인증
 → 학원 등록정보와 대조(이름 + 생년 일부)
 → 관계 선택 + 필수 동의
 → 학원 승인 또는 자동 연결
```
### 검증 규칙 (`evaluateLink`)
| 조건 | 결과 |
|---|---|
| OTP 미통과 | `PENDING` (휴대전화 인증 필요) |
| 필수 동의 미완 | `PENDING` (동의 필요) |
| 학원 등록 원생과 이름·생년 **불일치** | `REJECTED` (등록정보 불일치) |
| OTP✓ + 동의✓ + 등록정보 일치 | `VERIFIED` (+ participantId) |

- 대조는 **같은 academyId 안에서만**(테넌트 격리).
- **VERIFIED 링크만** 자녀 데이터 접근 허용 — F6 스코프(`GUARDIAN △본인자녀`)와 결합. `isLinkUsable()`.

### GuardianParticipantLink 필드 (docs/02)
`relationshipType` · `isPrimaryGuardian` · `verificationStatus` + **권한 플래그**(canViewSchedule/Attendance/HealthInfo·canReceivePhotos·canPay·canRequestRefund). 보호자↔자녀 **N:M**(형제, 부/모 각각).

## 3. 서버 필수 검증
- 연결 완료까지 자녀 데이터 **일절 노출 금지**.
- OTP·학원 조회는 서버(클라가 준 verified 플래그 신뢰 금지).
- 부정 테스트(docs/04 §4): 다른 보호자의 자녀 조회 → 403 / 미검증 링크로 접근 → 차단.
