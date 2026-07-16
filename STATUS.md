# PACEFOLIO — 진행 현황 (2026-07-16, R3 반영)

> 유소년 스포츠·교육 아카데미 운영 플랫폼. 원더짐 = 고객 0번, 멀티테넌트 day 1.
> **헌법: 목업 확정 전 DB 착공 금지.** 현재 = 백엔드 착공 前 **계약 닫기 스프린트**.
> 완료 표기는 저장소 증거(테스트·타입·CI) 기준으로만 ✅.

## 한 줄
3차 리뷰 백엔드 준비도 **7.5** (1차 4.5 → 2차 6.2 → 7.5). R3 P0 + B4(로그인·시뮬 격리) + **M1(마케팅 계약)** 반영 — 테스트 **99/99** (domain 91 + event-contracts 8).

## 검증 방법 (재현 가능)
```bash
npm install && npm test   # 99 tests (전 워크스페이스)
npm run typecheck && npm run lint && npm run build
```

## ✅ 완료 (계약 + 자동 테스트로 닫힘)
| 영역 | 내용 | 근거 |
|---|---|---|
| 정산 불변식 | 순수납액 = 유효결제(CAPTURED/PARTIALLY_REFUNDED) − 완료환불, 초과수납·과다환불 차단 | `billing.ts` |
| Refund 모델 | Refund·RefundAllocation(allocation 기준 귀속) + **금액↔배분합 검증, 이중차감 탐지** (R3 P0-6) | `billing.ts`·`entities.ts` |
| 참조·테넌트 무결성 | orphan·academy/participant/invoice 연쇄 일치·음수금액 차단·배분 중복 (R3 P0-7) | `checkReferenceIntegrity` |
| 상태머신 | Invoice/Payment/Refund 전이 guard + **FAILED≠UNKNOWN 분리**(R3 P1-2) + REFUNDED Invoice 종결(P1-3) | `state-machines.ts` |
| 권한 actor-binding | **R3 P0-1~4**: 코치 배정=coachUserId+academy+기간 결합 · 보호자 링크=actorGuardianId 결합 · SupportView=PLATFORM_ADMIN+MFA+본인세션+티켓+철회 · 보호자 action별 함수(flag 존중) | `authorization.ts` |
| 보호자-자녀 연결 | OTP=서버 검증세션(boolean 제거) + 선등록 연락처 결합 + **초대코드 학원·원생 귀속**(R3 P0-5: 만료·철회·사용횟수·지정전화) | `guardian-linking.ts` |
| 사진 동의 | 목적×대상 grant 쌍(교차조합 차단) + 정책버전·증적 | `consent.ts` |
| 멱등 | (academy·actor·op·key·bodyHash) scope — 재생/409/처리중/만료 (R3 P1-4) | `idempotency.ts` |
| PG 웹훅 | 중복(ALREADY_SEEN≠NO_STATE_CHANGE)·역순(epoch 정규화, R3 P0-8)·REJECT_INVALID·RECONCILE + inbox 원자성 계약 주석 | `webhooks.ts` |
| OpenAPI 0.2 | auth·OTP·환불(body+양측승인)·webhook·동의·탈퇴·SupportView endpoint + **enum drift 자동검증**(`x-domain-enum` 11종) | `api/openapi.yaml` + drift test |
| 멀티역할 | 모델 A 확정(`roles[]`, 유저 결정) — 원장 코치 겸직 | `membership.ts`·`permissions.ts` |
| ClassAssignment | 코치 담당의 정본(권한 기준), `coachUserId`는 캐시 명시 | `entities.ts` |
| 테스트·CI | node:test+tsx **91개**, GitHub Actions(typecheck·test·build, contents:read, concurrency) | `.github/workflows/ci.yml` |

### ✅ B4 (1차) — 인증 진입 + 결제 simulator 격리 + lint CI
- **루트 = 로그인** (`/`): SSO 4종(카카오 앵커) → `/select`(약관 v1.0 동의 → 학원/역할 선택 목업). 역할 허브는 `/demo` 로 분리(리뷰어 권고 — 프로덕션 비활성 예정). guard 규칙 계약 = `docs/10-auth-route-guard.md`
- **결제 simulator 격리** (R3 P1-6): `paySuccess` 제거 → `paymentSubmitted`(AUTHORIZED, 청구서 미변경) ≠ `paymentCaptured`(시뮬 webhook 확정). 결제 화면 "PG 시뮬레이션" 배지, 완료 화면 "승인 확인 중" 단계, **receipt 없이 완료 URL 직접 접근 시 성공 단정 금지**("결제 상태 다시 확인")
- **web lint 에러 5건 전부 수정**(render-mutation·effect setState·`<a>`→Link) → **CI에 lint 추가** (0 errors)

### ✅ M1 — 마케팅 내장 설계 계약 (리뷰 부록 A P0)
- **이벤트 4종 분리** (A-2): Domain=`@pacefolio/domain`(혼합 금지 명시) / Analytics·Attribution·Audit=**`@pacefolio/event-contracts`** 신설
- **코드 강제 규칙 + 테스트 8종**: 이벤트명 검증(동적값·한글·긴숫자 거부) · **PII 가드**(이름·전화·생년·건강·금액원문·토큰 금지 — 키+값패턴) · **UTM sanitize**(allowlist·CRLF·길이·전화/이메일 거부) · 공유루프 4단계 분리(클릭≠완료) · 신뢰수준 맵(전환=server/pg) · 추적동의 5목적 분리(분석≠광고귀속≠외부광고)
- **docs/marketing 8종** (A-18): EVENT-CATALOG(14개 초기 이벤트·보관·동의) · METRIC-REGISTRY(북극성 분자/분모=가구 기준·절감시간=추정 표기) · ATTRIBUTION(30일 window·서버 결합) · SHARE-PRIVACY(PortfolioShare·OG 파생이미지·철회) · PUBLIC-CONTENT(발행 상태머신+guard) · SEO-AEO(FAQ리치결과 종료 정정·llms.txt 🧪실험·가격 비공개) · GROWTH-SNAPSHOT(projection 분리·HealthScore 설명가능·소수표본 억제) · COPY-CHANNEL(채널별 금액 매트릭스)

## ⬜ 남은 것 (배치)
- **B4 잔여**: 앱별 `_data.ts`→공용 fixture 전환 · 사진 자산(PhotoAsset)별 동의 검증 · `/demo`·`/stage` 프로덕션 env guard
- **M1 잔여(P1)**: Owner 성장판 4카드·HQ funnel/health **mock 화면** · `packages/copy` 카탈로그
- **B5 — 인프라 골격**: Admin `apps/console-admin` 물리분리 · retention matrix(법률 검토 후 숫자) · runtime schema · domain dist build · OpenAPI lint/생성타입 CI · inbox/outbox·AuditLog 구현
- 열린 결정: 결제 정산 방식(결제선생 모델 벤치마크) · warm↔clean 디자인 톤

## 리뷰 이력
- R1(`539b818`): "기반 먼저 고정하라" → F1~F15
- R2(`fe2039c`): "계약을 실행 가능하게 닫아라" → B1~B3b, 준비도 6.2
- R3(`f1899a8`): "권한 actor-binding이 진짜 취약점" → 이번 커밋 반영, 준비도 7.5. 기록: `docs/REVIEW-2026-07-16-R2.md`(판정 로그)

## 스택
Next.js 16.2.10 · React 19.2.4 · TypeScript · Tailwind v4 · npm workspaces · node:test + tsx
