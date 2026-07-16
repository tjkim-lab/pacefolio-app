# PACEFOLIO 로드맵 R2 — 2차 통합 리뷰 반영 (계약 닫기 스프린트)

기준 커밋: `fe2039c` · 리뷰 수신: 2026-07-16 · 상세 원문 판정: [REVIEW-2026-07-16-R2.md](./REVIEW-2026-07-16-R2.md)

## 한 문장
리뷰어 결론 = 헌법과 동일: **"백엔드 본 착수는 보류. 이미 정한 규칙을 타입·상태전이·OpenAPI·자동테스트로 끝까지 '닫아라'."**
→ 이건 DB 착공이 아니라 **착공 前 계약을 실행 가능하게 만드는 마지막 설계 스프린트**. 헌법-safe.

## 리뷰어 최종 판정 (요약)
- 인증·결제·개인정보 **백엔드 본 착수 = 보류 권고**.
- 단, **병행 착수 가능**: 로컬 인프라 skeleton · migration framework · 인증 PoC · OpenAPI lint+생성타입 CI · Admin 분리 skeleton · inbox/outbox · logging/tracing · 테스트/CI.
- 백엔드 준비도: 4.5 → **6.2**. P0 닫으면 8점대 가능.
- 가장 큰 위험 4가지: ①문서엔 있으나 코드에 없는 상태·환불·동의 ②합산결제 부분환불·웹훅 역순·동시결제 불변식 미완 ③OTP가 학원 등록 보호자와 미결합 ④로그인·세션·route guard 부재.

---

## 두 트랙으로 분할

리뷰는 **본문(백엔드/도메인)** + **부록 A(마케팅 내장 설계)** 두 덩어리. 서로 독립적으로 진행 가능하되, 부록 A의 핵심(이벤트 종류 분리·동의 경계·공유 개인정보)은 도메인 계약과 함께 박아야 재작업이 준다.

### 트랙 A — 백엔드/도메인 계약 닫기 (본문 §1~17)
| P0 | 항목 | 현재 근거(실측) | 조치 | 배치 |
|----|------|----------------|------|------|
| A-P0-1 | 유효 납부액·환불 잔액 불변식 | fixture selector가 단순 합산, Payment 상태·환불 미반영 | `billing.ts` 정산 계산 + `checkConsistency` 강화 | **B1 (진행중)** |
| A-P0-2 | Refund·RefundAllocation 엔티티 | `entities.ts`에 Refund 인터페이스 없음(문서만) | allocation 기준 Refund/RefundLine 추가 | **B1 (진행중)** |
| A-P0-8 | 실행 가능한 상태전이 함수·guard | enum 이름만 있고 transition 함수 0 | `state-machines.ts` + 부정전이 테스트 | **B1 (진행중)** |
| A-P0-3 | 웹훅 중복+역순+재조회 규칙 | docs/06 원칙만, 역순 규칙 없음 | `webhooks.ts` monotonic guard + RECONCILE 결정 | ✅ **B3** |
| A-P0-4 | 결제 화면 setTimeout→PAID 제거 | `parent/pay` useState+setTimeout+PAID | 시뮬레이션 격리 + 서버 재조회 흐름 계약 | B4 |
| A-P0-5 | OTP 주체 ↔ 등록 보호자 결합 | `guardian-linking.ts` 이름+생년만, `otpVerified:boolean` 클라 | 검증세션ID·초대코드·GuardianContact 매칭 모델 | ✅ **B2** |
| A-P0-6 | OpenAPI ↔ domain 정합 | LinkAttempt·Refund·webhook·auth 불일치/누락 | OpenAPI 재작성 + enum drift 테스트 | B3 |
| A-P0-7 | idempotency replay 의미 | 무조건 409 가정 | (actor,op,key,bodyHash)→재생/409/IN_PROGRESS 모델 | ✅ **B2** |
| A-P0-9 | 사진 동의 목적×대상 grant + policy 버전 | `consent.ts` 목적/대상 독립배열(교차조합 허용 버그) | grant[] 모델 + policyVersion·증적 | ✅ **B2** |
| A-P0-10 | 로그인·세션·route guard 최소 계약 | `/`는 역할 허브(로그인 없음) | auth 흐름 계약 + guard 규칙 + 역할허브 격리 | B4 |
| A-P1 | 권한 정책함수·부정테스트 | can()/inTenantScope()만, resource authz 없음 | `authorization.ts` + 12종 부정테스트 | ✅ **B3** |
| A-P1 | 멀티역할 정책(6.3) | membership.role 단수 vs id주석 "×역할"(모순) | ✅ **모델 A 확정**(roles[]) — 2026-07-16 유저 | ✅ **B2** |
| A-P1 | Class coach 기준(6.2) | `ClassRoom.coachUserId` vs ClassAssignment | ClassAssignment 정본화 + coach cache 명시 | ✅ **B3** |
| A-P1 | Admin 물리 분리 skeleton | `/admin` 같은 앱 | `apps/console-admin` + 별세션/MFA 경계 | B5 |
| A-∞ | 테스트 러너 + CI | 없음(🔴) | node test + GitHub Actions(build/type/lint/test) | **B1 (진행중)** |

### 트랙 B — 마케팅 내장 설계 계약 (부록 A)
| B-P0 | 항목 | 조치 | 배치 |
|------|------|------|------|
| B-P0-1 | 이벤트 4종 분리 (Domain/Analytics/Attribution/Audit) | `events.ts`에 마케팅 이벤트 **금지**, 계약 분리 | M1 |
| B-P0-2 | 이벤트 카탈로그 + 지표 사전 | `docs/marketing/EVENT-CATALOG.md`·`METRIC-REGISTRY.md` | M1 |
| B-P0-3 | 북극성 지표 분자/분모/기간 | 자동결제 등록률=가구 기준, 절감시간=추정 표기 | M1 |
| B-P0-4 | UTM allowlist·개인정보 금지 | `ATTRIBUTION-SPEC.md` | M2 |
| B-P0-5 | 동의 목적 분리(분석·귀속·외부광고) | consent 목적 enum 확장 계약 | M2 |
| B-P0-6 | 포트폴리오 공유 동의·만료·철회 | `SHARE-PRIVACY-SPEC.md` + OG 파생이미지 정책 | M2 |
| B-P0-7 | 공개 콘텐츠 발행 상태머신 | `PUBLIC-CONTENT-SPEC.md` DRAFT→…→ARCHIVED | M3 |
| B-P0-8 | AEO/GEO 표현 정정 | FAQPage 리치결과 기대 제거·llms.txt 실험표기·Course 조건 | M3 |
| B-P1 | 성장판/관제탑 projection 분리·소수표본 억제·health score 설명가능 | `GROWTH-SNAPSHOT-SPEC.md` | M3 |
| B-P1 | 브랜드 카피 key/채널정책(금액 서버단 제외) | `COPY-CHANNEL-POLICY.md` + `packages/copy` | M4 |

---

## 실행 배치 순서 (헌법-safe, 전부 계약·테스트·문서)
- **B1 (지금)**: 결제·환불 정산 불변식 + Refund 엔티티 + 상태전이 함수 + **테스트 러너·CI 골격**. ← 리뷰어 최대 위험 + 재현성.
- **B2**: OTP-보호자 결합 · 사진동의 grant · idempotency replay · 웹훅 역순 · 멀티역할 결정.
- **B3**: OpenAPI 전면 재작성 + domain drift 테스트 + 권한 정책함수·부정테스트 + ClassAssignment 정본화.
- **B4**: 로그인·세션·route guard 계약 + 결제화면 시뮬레이션 격리.
- **B5**: Admin `apps/console-admin` skeleton + retention matrix 문서.
- **M1~M4**: 트랙 B (도메인 B2와 병행 가능 — 이벤트 분리는 B2 전에 계약만 박기).

## 결정 로그 (기본값은 내가 정하되, ★는 유저 확인 권장)
- ✅ 상태전이 `FAILED→CAPTURED`: **PG 재조회(reconciliation) 경로에서만** 허용, 그 외 금지. guard에 `viaReconciliation` 플래그.
- ✅ 초과납부: 기본 **차단**(outstanding<0 불가, allocation 합 ≤ 미납액). 별도 초과납부 정책 없음.
- ✅ 환불 귀속: **PaymentAllocation 기준**(합산결제 후 특정 원생만 환불 가능하도록).
- ★ **멀티역할(6.3)**: 후보 A=`membership 1건 + roles: Role[]` / B=`역할마다 membership`. 현재 코드 모순(entity는 A형 단수 role, id주석은 B형). **기본안 = A** 로 잡고 진행하되 확정은 유저.
- ★ 계정 보관기간(retention matrix): **법률 검토 필요** — 숫자는 비워두고 구조만. 전문가 검토 전 확정 금지.

## 백엔드 착수 승인 조건 (리뷰 §14 체크리스트) — 이 스프린트의 완료 정의
결제엔진 재현 · Refund/allocation 계약 · 납부액 불변식 · transition+부정테스트 · 웹훅 규칙 · idempotency · OTP 결합 · 동의 grant · 로그인 계약 · 멀티역할 확정 · OpenAPI drift · setTimeout 제거 · 권한 부정테스트 · CI 통과 · STATUS 정합.
