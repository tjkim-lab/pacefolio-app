# PACEFOLIO — 진행 현황 (2026-07-16 저녁, R4 반영)

> 유소년 스포츠·교육 아카데미 운영 플랫폼. 원더짐 = 고객 0번, 멀티테넌트 day 1.
> **헌법: 목업 확정 전 DB 착공 금지.** 현재 = 백엔드 착공 前 **계약 닫기 스프린트**.
> 완료 표기는 저장소 증거(테스트·타입·CI) 기준으로만 ✅.

## 한 줄
4차 리뷰 백엔드 준비도 **8.0** (4.5 → 6.2 → 7.5 → **8.0, "일반 백엔드 개발 착수 가능"**).
R4 §19 완료 조건 **15/15 마감** — 테스트 **131/131** (domain 123 + event-contracts 8).

## 검증 방법 (재현 가능)
```bash
npm install && npm test   # 131 tests (전 워크스페이스)
npm run typecheck && npm run lint && npm run build
npx @redocly/cli lint api/openapi.yaml   # OpenAPI lint (CI 포함)
```

### ✅ R4 반영 (§19 완료 기준 15/15 — 2026-07-16 저녁)
| 영역 | 내용 | 근거 |
|---|---|---|
| 시간 공통화 | `time.ts` — epoch 정규화 + fail-closed(파싱실패=거부). 배정·MFA·SupportView·invite·OTP·동의·멱등·웹훅 전 지점 통일 | `time.ts` + 테스트 8 |
| 환불 부분승인 금지 | approved=requested=completed=Σalloc 불변식, 상태별 필수 금액. 코드·OpenAPI·문서 동일 반영 | `billing.ts` |
| Refund 원생 연쇄 | Refund 1건=원생 1명(alloc·Invoice 연쇄 일치·테넌트). OpenAPI participantId 필수 | `billing.ts` |
| 환불 요청자=결제자 | `canGuardianRequestRefundForPayment` — Payment.guardianId=actor 결합(아버지가 어머니 결제 건 요청 불가 부정테스트) | `authorization.ts` |
| 상태전이 guard | `validateInvoiceTransition`(PARTIALLY_PAID→VOID 는 순수납 0 만) · MUTUALLY_APPROVED→REJECTED 금지 | `state-machines.ts` |
| Invite hash 결합 | requestCodeHash ↔ invite.codeHash 함수 내 직접 대조 + Redemption 모델 + 10단계 트랜잭션 계약 | `guardian-linking.ts` |
| OTP actor-binding | 세션 issuedToUserId·purpose·consumedAt(1회 소비) — 타인·타목적·재사용 전부 거부 | `guardian-linking.ts` |
| CSRF·OAuth 계약 | 쿠키 속성·3중 방어·state 일회성·PKCE S256·nonce·자동병합 금지 | `docs/11` + openapi |
| OpenAPI lint CI | Redocly — 첫 실행에서 drift test 가 못 잡던 YAML 문법 오류 2건 발견·수정 | `ci.yml` |
| 시뮬레이터 차단 | PG_SIMULATION 프로덕션 강제 false + `/demo`·`/stage` 404(env guard) | `_state.tsx`·layout |

### ✅ B4 (3차) — _data.ts 공용 fixture 전환 (coach·owner·pc·parent)
- fixture 를 앱 실캐스트 정본으로 재구성(참가자 8·수업 6·보호자 7·청구 8) — superset 통합, 화면 보존
- 4개 앱 `_data.ts` = fixture 파생 어댑터(export 모양 유지 → 소비 페이지 37개 무수정)
- 금액 충돌 정본 통일(이수아 531,000 · 최이안 243,750 · 한예린 240,000) · 수납주기 3·6·9·12 헌법 정정
- 남은 것: admin(멀티테넌트 fixture 신설 필요)

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

### ✅ B4 (2차) — 프로덕션 안전 잔여 (4차 리뷰 대기 중 처리)
- **`/demo`·`/stage` env guard**: 서버 컴포넌트 layout(`app/{demo,stage}/layout.tsx`) + `lib/devRouteGuard.ts` — 프로덕션 빌드에서 404(하위 `/stage/live`까지). 호스팅 프리뷰용 예외 = **build-time** `PACEFOLIO_ENABLE_DEMO_ROUTES=1`. 실요청 검증(프로덕션 빌드 /demo·/stage·/stage/live=404, 일반=200)
- **PhotoAsset 자산별 동의**: `canSendPhotoAsset`(consent.ts) — 사진 1장에 여러 원생 등장(단체사진) 시 **등장 원생 전원**의 목적×대상 grant 재검증. 미동의 원생 식별 반환(파생이미지 제거·추가 동의 유도), 테넌트 무결성(타 학원 동의 불인정)·중복 등장 dedupe. 테스트 7종. 근거 = SHARE-PRIVACY 2·3, entity-model F

### ✅ M1 — 마케팅 내장 설계 계약 (리뷰 부록 A P0)
- **이벤트 4종 분리** (A-2): Domain=`@pacefolio/domain`(혼합 금지 명시) / Analytics·Attribution·Audit=**`@pacefolio/event-contracts`** 신설
- **코드 강제 규칙 + 테스트 8종**: 이벤트명 검증(동적값·한글·긴숫자 거부) · **PII 가드**(이름·전화·생년·건강·금액원문·토큰 금지 — 키+값패턴) · **UTM sanitize**(allowlist·CRLF·길이·전화/이메일 거부) · 공유루프 4단계 분리(클릭≠완료) · 신뢰수준 맵(전환=server/pg) · 추적동의 5목적 분리(분석≠광고귀속≠외부광고)
- **docs/marketing 8종** (A-18): EVENT-CATALOG(14개 초기 이벤트·보관·동의) · METRIC-REGISTRY(북극성 분자/분모=가구 기준·절감시간=추정 표기) · ATTRIBUTION(30일 window·서버 결합) · SHARE-PRIVACY(PortfolioShare·OG 파생이미지·철회) · PUBLIC-CONTENT(발행 상태머신+guard) · SEO-AEO(FAQ리치결과 종료 정정·llms.txt 🧪실험·가격 비공개) · GROWTH-SNAPSHOT(projection 분리·HealthScore 설명가능·소수표본 억제) · COPY-CHANNEL(채널별 금액 매트릭스)

## ⬜ 남은 것 (배치)
- **B4 잔여**: 앱별 `_data.ts`→공용 fixture 전환 (env guard·PhotoAsset 동의는 ✅ B4(2차))
- **M1 잔여(P1)**: Owner 성장판 4카드·HQ funnel/health **mock 화면** · `packages/copy` 카탈로그
- **B5 — 인프라 골격**: Admin `apps/console-admin` 물리분리 · retention matrix(법률 검토 후 숫자) · runtime schema · domain dist build · OpenAPI lint/생성타입 CI · inbox/outbox·AuditLog 구현
- 열린 결정: 결제 정산 방식(결제선생 모델 벤치마크) · warm↔clean 디자인 톤

## 리뷰 이력
- R1(`539b818`): "기반 먼저 고정하라" → F1~F15
- R2(`fe2039c`): "계약을 실행 가능하게 닫아라" → B1~B3b, 준비도 6.2
- R3(`f1899a8`): "권한 actor-binding이 진짜 취약점" → 이번 커밋 반영, 준비도 7.5. 기록: `docs/REVIEW-2026-07-16-R2.md`(판정 로그)

## 스택
Next.js 16.2.10 · React 19.2.4 · TypeScript · Tailwind v4 · npm workspaces · node:test + tsx
