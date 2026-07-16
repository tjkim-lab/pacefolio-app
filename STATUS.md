# PACEFOLIO — 진행 현황 (2026-07-16, R2 반영중)

> 유소년 스포츠·교육 아카데미 운영 플랫폼. 원더짐 = 고객 0번, 멀티테넌트 day 1.
> **헌법: 목업 확정 전 DB 착공 금지.** 현재 = 백엔드 착공 前 **계약 닫기 스프린트**.

## 한 줄
2차 리뷰 결론(= 헌법과 동일): **"화면 그만 그리고, 이미 정한 규칙을 타입·상태전이·테스트로 끝까지 닫아라."** → 그 스프린트 진행 중. DB 아직 안 팜.

## 2차 리뷰 대응 (상세: `docs/ROADMAP-R2.md` · `docs/REVIEW-2026-07-16-R2.md`)
리뷰어 판정: 백엔드 본 착수 **보류**, 백엔드 준비도 4.5→6.2. P0를 실행 가능한 계약+테스트로 닫으면 8점대.

### ✅ B1 완료 — 결제·환불 정합 + 테스트/CI 골격 (리뷰 최대 위험)
- **Refund·RefundAllocation 엔티티** 신설 (`packages/domain/entities.ts`) — allocation 기준 귀속, 상호승인 필드
- **정산 불변식** (`packages/domain/billing.ts`) — 유효 납부액 = CAPTURED/PARTIALLY_REFUNDED 결제 − COMPLETED 환불. 초과수납·과다환불·합계불일치 탐지
- **실행 가능한 상태머신** (`packages/domain/state-machines.ts`) — Invoice/Payment/Refund 전이 guard + 상호승인(동일인 양측 금지). 부정 전이를 테스트로 고정
- **테스트 러너 + CI** — `npm test`(node:test+tsx) **18/18 통과**, `npm run typecheck` 클린, GitHub Actions `.github/workflows/ci.yml`(typecheck·test·build)

### ✅ B2 완료 — 인증·연결·동의·멱등 계약
- **멀티역할 모델 A 확정** (유저 결정) — `AcademyMembership.roles: Role[]`, 원장이 코치 겸직 가능. `rolesInAcademy`·`canAny`·권한 합집합
- **OTP 주체↔등록보호자 결합** (`guardian-linking.ts`) — `otpVerified:boolean`(클라 신뢰) 제거 → 서버 검증세션 + 학원 선등록 연락처/초대코드 매칭. **공격 시나리오(남의 자녀 정보만 아는 경우) 자동 VERIFIED 차단**을 테스트로 고정
- **사진동의 목적×대상 grant** (`consent.ts`) — 독립배열 교차조합 버그 제거 → grant 쌍 + 정책버전·증적
- **멱등 replay 의미** (`idempotency.ts`) — 무조건 409 → (actor·op·key·bodyHash) 기준 REPLAY/409/IN_PROGRESS/만료
- 테스트 **39/39** (18→39), typecheck 클린, 웹 빌드 정상

### ✅ B3 (일부) 완료 — 권한 enforcement + 웹훅 규칙
- **리소스 권한 정책함수** (`authorization.ts`) — 보호자(연결·canPay·canRequestRefund)·코치(담당배정 스코프)·Support View 만료. **부정 테스트 12종** 자동화(타학원·미연결 자녀·ENDED 코치·담당 아닌 반 건강정보·코치 결제금액·원장 플랫폼·혼합결제 등)
- **ClassAssignment 정본화** (6.2) — 코치 담당=권한 기준, `ClassRoom.coachUserId`는 캐시로 명시
- **웹훅 중복·역순·재조회** (`webhooks.ts`) — 중복 무시·monotonic guard(역순 stale)·허용 안 되는 전이는 덮지 않고 RECONCILE(PG 재조회)
- 테스트 **57/57**, typecheck 클린, 웹 빌드 정상

### 진행 예정 (헌법-safe)
- **B3b**: OpenAPI 전면 재작성(Refund·webhook·auth·PaymentAllocation·error envelope·idempotency 헤더) + **domain↔OpenAPI enum drift 테스트**
- **B4**: 로그인·세션·route guard 최소 계약 · 결제화면 setTimeout→PAID 제거(시뮬 격리)
- **B5**: Admin `apps/console-admin` 물리분리 skeleton · retention matrix(법률 검토 후 숫자 확정)
- **M1~M4** (마케팅 트랙): 이벤트 4종 분리 · 지표 사전 · 공유 개인정보 계약 · AEO/GEO 표현 정정
- **B4**: 로그인·세션·route guard 최소 계약 · 결제화면 setTimeout→PAID 제거(시뮬 격리)
- **B5**: Admin `apps/console-admin` 물리분리 skeleton · retention matrix(법률 검토 후 숫자 확정)
- **M1~M4** (마케팅 트랙): 이벤트 4종 분리 · 지표 사전 · 공유 개인정보 계약 · AEO/GEO 표현 정정

## 이전 F1~F15 상태 정정 (리뷰어 지적 반영 — 증거 기준)
| | 정정된 상태 |
|---|---|
| F6 권한 "검증 7/7" | ✅ 매트릭스 + 리소스 정책함수(`authorization.ts`) + 부정테스트 12종 / ⬜ 실서버 endpoint enforcement(백엔드 착수 시) |
| F9 "payment-engine 40/40 재사용" | 🔴 해당 엔진·테스트가 이 스냅샷에 미포함 → **B1에서 정산 불변식+테스트를 이 repo 안에 직접 구현**(재현 가능) |
| F12 사진 동의 | ✅ 목적×대상 grant + 정책버전·증적(B2) / ⬜ 자산(PhotoAsset)별 범위·발송시점 자산결합 |
| F14 계정 라이프사이클 | 🟡 문서 / 🔴 API·guard (B4) |
| F15 OpenAPI | ✅ 대표 초안 / 🔴 정합·핵심 endpoint (B3) |

## 실행
```bash
npm install
npm test         # 도메인 불변식·상태전이 18/18
npm run build    # → http://localhost:3000 (npm run dev)
```
주요 화면: `/parent` `/coach` `/owner` `/pc` `/admin` · 라이브 데모 `/stage/live`

## 스택
Next.js 16.2.10 · React 19.2.4 · TypeScript · Tailwind v4 · npm workspaces · node:test + tsx

---
_검토용 스냅샷. 완료 표기는 저장소 증거(테스트·타입) 기준으로만 ✅ 표기._
