# PACEFOLIO — 진행 현황 · 핸드오프 (2026-07-19 #44~#48 반영)

> 유소년 스포츠·교육 아카데미 운영 플랫폼. 원더짐 = 고객 0번, 멀티테넌트 day 1.
> 완료 표기는 저장소 증거(테스트·타입·CI) 기준으로만 ✅. 이 문서가 핸드오프 정본 —
> 세부는 각 절의 docs 링크. 미러(리뷰 공유) = tjkim-lab/pacefolio-app.

## 한 줄
백엔드 착공(R5 GO 8.7) 이후 **기본선 수명주기 전 구간 실 API + 4역할 화면 실연결 +
가격 확정·Admin 관제 + 13차 A~E·14차 A–D 리뷰 반영 + 사진 파이프라인 코어**까지 완료.
테스트 **api 216 · domain 141 · db 15 · web 10 · Playwright e2e 15** — CI 2 job(verify+e2e) 그린.

## 검증 방법 (재현 가능)
```bash
npm install && npm test          # 전 워크스페이스 (PG 동시성 경쟁은 DATABASE_URL_TEST/CI 에서)
npm run typecheck && npm run lint && npm run build
npx @redocly/cli lint api/openapi.yaml
npm run test:e2e -w web          # Playwright — API(PGlite seed)+web 자동 기동, chromium
npm run dev                      # :3000 웹 + :3001 API(PGlite in-memory 자동 seed)
```

## 핸드오프 — 지금 어디까지 (2026-07-19)

### ✅ 완료 (착공 이후 → 현재)
| 트랙 | 내용 | 근거 |
|---|---|---|
| 기본선 수명주기(#22~24) | 학원 생성→코치 초대→반·일정(유형 3종)→학생 상태머신→출결(담당·전원 검증)→청구 발행(부호·상한)→오프라인 수납(증빙·정산 도출)→공지(receipt·미열람) — 전 구간 실 API | docs/15 |
| 화면 실연결(4역할) | 학부모 결제(서버 확정 판정)·코치 출결/전달사항 ACK/안전기록/사진 동의 확인·원장 공지(반 필터)/수납 집계/코치 전달·TJ admin 4표면 — LiveProvider 4상태(fixture = 명시 플래그·비프로덕션 네트워크 실패만) | `*/_live.tsx` |
| 가격·Admin(#27~29) | **가격 확정: BASIC 29,000/PRO 99,000**(기능 구분 TBD) · 구독+MRR·학원별 관제·정지/해제(자기잠금 방지)·SupportView·전 액션 감사 | docs/17 |
| 소통(배치14+#31) | READ≠ACK≠RESOLVED·BILLING 서버 카드·HEALTH 담당 검증 + **읽기 시점 재인가**(코치 담당 해제·보호자 canPay 회수 시 가림) + 전송 멱등 ON CONFLICT | docs/12 |
| 안전(#32) | safety_incidents — 담당 검증·발생 시각=서버·감사(원문 미포함)·원장 알림 Outbox·열람 감사 | |
| 사진 코어(#19) | 동의 영속화(If-Match)·photo_assets·**동의 게이트 서버 강제**(422+차단 명단)·스토리지 어댑터 경계(dev 구현·프로덕션 미주입 501) — 잔여 = 실 사업자 어댑터 1개 | |
| 컴플라이언스 | PII 암호화(전화 원문 제거·fail-closed)·proxy 역할 검증(세션 정본·404 fail-closed)·처리방침 초안 | docs/16 |
| 리뷰 대응 | 13차 A~E 반영 완료(docs/18 트리아지) · **14차 재검토: A·D 승인, B P0·C P1 전부 반영**(fixture fail-open 제거 포함) · 자체 멀티에이전트 리뷰 13건 수정(미납 이중계상 P1 등) | docs/REVIEW-REQUEST-14 |
| 품질 인프라 | CI verify+e2e · PG 동시성 경쟁 테스트(같은 측 재승인·동시 전송 멱등 등) · openapi drift 가드 | .github/workflows |
| PC draft 정본화(#38~42) | 13B FAIL 잔여 전 구간 서버 정본 — 휴무 event→회차 재계산·중간입회 견적(payment-engine 이식 정합)+청구 초안 저장·원생 목록·그룹(반) 일괄 발송(초안 전수→일괄 ISSUED·기존 청구 제외·멱등)·강사 교체(배정 행 교체 이력보존·회수 3모드 고아 반 방지·인수인계 브리핑 outbox→인앱) | closures/·coaches/swap.ts·billing/issue.ts |
| 프로그램 스튜디오 PS3~5(디자인 터미널) | CSV 가져오기 스테이징(업로드→미리보기→커밋→되돌리기)·반 적용·수업 계획·결과 확정·경험 이벤트·기술/클리어/뱃지(자동 클리어 금지·발급 1회) | docs/20·programs/ |
| AudienceFilter 2단계(#44) | 대상 산정 공용 리졸버 서버 정본(반·코치·요일·상태·미납, 축 내 OR·축 간 AND) — 원생 화면 READY 실구동·공지 audienceFilter·대회 초대(공지 엔진 재사용 실발송)·수납 미납 명단·CSV 반출(감사 기록·PII 최소·staff 전용·테넌트 격리) | audience/·API 8건·e2e 2건 |
| 양방향 채팅 UI(#46) | 학부모 학원 1:1(GUARDIAN_DM) 실연결 — 자녀 컨텍스트 개설(find-or-create)·송수신(clientMessageId 멱등)·열람=read 기록(READ≠ACK)·"읽음" 표시 양측 반영. 원장 방 열람도 read 기록. 서버는 Batch 14 chat 그대로(신규 서버 코드 없음) | parent/chat/·e2e 왕복 1건 |
| E2E 확대(#47) | 코치 수업 완료 여정 + 반 일괄 청구(#41) e2e 추가 — 과정에서 실 갭 2건 발견·수정: READY 출석 저장이 서버 recordAttendance 미배선(저장된 척 금지·성공 후에만 전진) · 서버 사진 판정이 발송 가드(photoChecked) 미해제로 발송 검토 진입 불가 | coach-session-complete·pc-billing-bulk |
| 원장 홈 처리할 일(#45) | "오늘 처리할 일" 서버 정본 — 공지 재알림(미열람 receipt 보유자만·전체 재발송 금지)·미납 리마인드(open 청구 원생의 VERIFIED·canPay 보호자, 금액 미표시=헌법)·긴급결석 통보 목록+원장 "확인했어요"(멱등·보강 자동생성 아님·보호자 인앱 회신 = 전화 루프 종결). migration 0028 | billing/remind.ts·owner-dashboard.test 6건 |
| owner 모바일 홈 실연결(#48) | 모바일 원장 홈 READY = 서버 정본 — 처리할 일 카드(#45 재사용: 긴급결석 확인·공지 재알림·미납 리마인드)·타일·수납 스트립(홈 금액 비노출 헌법 — 건수·수납률만, e2e 로 ₩ 미표시 검증)·출석률 등 서버 정본 없는 수치는 READY 미표시(위장 금지) | owner/page.tsx·e2e 1건 |
| 플랜 3단+게이트(#49) | FREE(0원·구독 행 없음·원생 30명 상한)/BASIC/PRO 확정 — 운영 코어는 FREE 부터 전부(북극성·락인 비가둠), 게이트 정본 domain/plan.ts, 402 PLAN_UPGRADE_REQUIRED(current/requiredPlan 동봉), CANCELED=FREE 강등·PAST_DUE 유예. 원더짐 seed=PRO | plan-gate.test 4건 |
| 기능 예외 grant(#50) | 영업 "한두 달 열어주기"(TJ 실경험 근거) — 학원×기능 grant(migration 0029): 사유 필수·기간/무기한·철회 즉시 복귀·만료 lazy 자동 잠금·감사·append-only. 원생 상한 예외 = UNLIMITED_PARTICIPANTS. admin 학원 관리 행 "기능 예외…" 패널 실연결 | plan-gate.test +2건 |
| 원장 대시보드 완결(#49·#50 e2e) | 반별 정원 서버 집계(listClasses enrolled=ACTIVE 등록·READY 정원 패널 복원) + PC 대시보드 E2E(KPI·정원·공지 재알림 왕복 — 긴급결석·미납 왕복은 owner-home.spec 이 같은 엔드포인트 검증) | classes.test·pc-dashboard.spec |
| owner·PC 원생 여정(#51~54) | listParticipants 에 반·미납 동봉(#51) → getParticipantDetail 서버 정본(#52: 반·담당코치·보호자 연결(관계·검증·결제권한, **연락처·이름 미포함**)·청구서(금액 포함)) → 출석 집계 동봉(#53: 실제 출결 기록만·예정 통보 미합산·ratePct=출석+지각+조퇴/전체) → PC 상세도 같은 API 재사용(#54). owner·PC 양쪽 목록→상세 서버정본 완결. READY 없는 차량·보강 카드는 미표시(위장 금지) | students/service.ts·owner-dashboard.test |
| B5 admin 물리분리(#55) | apps/console-admin 신설(:3002) — 교차테넌트 개인정보 최대 리스크 표면을 학원 앱 배포에서 격리(아키텍처 B 완결). app/admin 전체 이동·admin 전용 proxy(PLATFORM_ADMIN 정본 검증·전 응답 no-store/noindex·실패 전부 404 은닉)·API Origin allowlist :3002 추가·web 에서 admin 표면 제거. 공용 UI·fixtures 는 임시 복제(packages/ui 승격 전) | console-admin/·e2e 16/16 |
| 보호자 온보딩 실연결(슬라이스 A) | ZEM 벤치마크 온보딩·가입 신규 흐름(`app/onboarding` — 하단탭 없는 자체 PhoneFrame) — 초대코드로 학원 진입 → 휴대폰 본인인증(세션) → 약관 → **부모가 아이 직접 등록**(아이 검색·연결코드·QR·승인 **없음**·형제 추가). 모델 개정: 학원 선등록 원생 매칭 아님(유저 확정). 실 서버·DB = migration 0030 `academy_invite_codes`+seed(WG2025→원더짐·프로그램) + 엔드포인트 4(invite 검증·OTP issue/verify·self-register=participant·link(VERIFIED)·GUARDIAN 멤버십·세션 1회소비 한 tx) + api-client 4 + 웹 LIVE(probe→devLogin 박서연 폴백, API 불통 시 FIXTURE). ⚠️SMS/PASS·OAuth 스텁(dev 코드 123456·000000=오류)·program FK 없음(등록의도만). 설계 = docs/design/guardian-zem-benchmark.md | guardian/onboarding.ts·guardian-onboarding.test 4건·e2e LIVE 왕복 2건 |

### ⏸️ 결정 대기 (TJ) — 이것만 정하면 다음이 풀림
1. ~~사진 저장소 사업자~~ → **NCP 확정 (2026-07-19 TJ: "쓰던 곳을 쓴다")**. 코드 완성·주입 배선 완료 —
   잔여 = 운영 준비물만: NCP 버킷 생성 + API 키 발급 + env 4개(`PACEFOLIO_STORAGE_*`). 미설정 시 501 fail-closed
2. ~~플랜 기능 구분~~ → **3단 FREE/BASIC/PRO 확정 (2026-07-19 TJ)**. 정본 = domain/plan.ts·docs/17 §A.
   v1 게이트 배선 완료(#49): FREE 원생 30명 상한 · BASIC=반 일괄 청구 · PRO=CSV 가져오기·복제·뱃지 (402)
3. **데모 배지(#33)** — 디자인 터미널에 비주얼 규약 지시(판별 로직·중립 최소형 배지는 이미 동작 중)
4. **법률 검토 발주** — 학원법 환불 기준·업종 분류·처리방침·수탁 모델 4종 묶음. **실 PG 전 필수(헌법)**

### ▶️ 다음 개발 후보 (결정 무관)
- ~~AudienceFilter 2단계~~ ✅#44 · ~~양방향 채팅 UI~~ ✅#46 · ~~E2E 확대~~ ✅#47 · ~~owner 모바일 홈~~ ✅#48 · ~~원장 대시보드 완결~~ ✅#49·50 · ~~owner·PC 원생 여정~~ ✅#51~54
- **남은 소품 후보**: 원생 상세에 안전 특이사항 동봉 · 출결 이력 목록(상세) · PC students 목록/상세 통합 · E2E 계속 확대
- **보호자 온보딩 후속**: 슬라이스 B 학원 대량 초대(학부모 명단 엑셀→초대코드 대량 생성·발송 — CSV 스테이징+`guardianInvites` 재사용, docs/design §9) · 실 SMS/PASS·OAuth(현 dev 세션 스텁 대체) · 보호자 홈 ZEM 원칙 재구성
- **대형 트랙**: B5(console-admin 물리분리, **옆 터미널 진행 중 2026-07-19**) · AudienceFilter 저장 프리셋 · 외부 준비물 해소 후 Gate 3(실 로그인·PG)

### 🔌 외부 준비물 (Gate 3 전제)
카카오 개발자 키(실 로그인) · PG sandbox(정산 방식: 결제선생 모델 벤치마크, RESEARCH B1) ·
알림톡/SMS 사업자 · main branch protection

## 이하 = 이력 (착공 초기 기록, 참고용)

### ✅ 백엔드 Phase 4~6 기반 + R6 대응 (2026-07-17)
| 항목 | 내용 |
|---|---|
| Phase 4 완결 | 보호자 연결 10단계 원자 tx(OTP 1회 소비·redemption 정본 COUNT·invite FOR UPDATE 잠금 — 동시성 결함 발견·수정) + CI postgres 동시성 테스트 3종 |
| Phase 3 확장 | requireAcademyContext — 소속없음 403·SUSPENDED=403+전 세션 폐기·PLATFORM_ADMIN 일반앱 금지 |
| Phase 5 | 결제 준비(멱등 REPLAY/409·Invoice lock·도메인 권한/정산) + PG 웹훅(inbox unique·중복/역순/**동시각 RECONCILE**·Invoice 상태 도출) + 청구서 API |
| Phase 6 기반 | `packages/api-client`(zod 응답 검증·CSRF 자동) + dev 로그인(프로덕션 404 게이트) + `db/seed`(원더짐 정본 캐스트) — **카카오 키 없이 전 플로우 시연 가능** |
| R6 대응 | `decideRefundWebhook` 신설(P0-3) · 동시각/불량 lastEventAt=RECONCILE(P0-4) · 문서 드리프트 6곳(P0-5) · fixture selector 정책 정합(4.6) · Payment PG 추적 필드(5.6) |

**다음(준비물 필요)**: 카카오 개발자 키(실 로그인) · PG sandbox(정산 방식 결정과 연동) ·
main branch protection(GitHub 설정) · 법률 검토(환불 수치).
**다음(준비물 불요, 대형)**: 웹 화면 api-client 스위칭 · OpenAPI 생성타입 CI ·
Playwright E2E · Admin console-admin 물리분리(B5) · 대사(reconciliation) 모델.

### ✅ 백엔드 착공 — R5 §7 Phase 0~3 (2026-07-16 밤)
| Phase | 내용 | 근거 |
|---|---|---|
| 0 기반 결정 | PostgreSQL 16 · Drizzle+drizzle-kit · 테스트=PGlite(진짜 Postgres WASM, Docker 불필요) · timestamptz UTC · 금액 int4 KRW 정수 · 낙관잠금 version · ID=도메인 Brand text PK | `packages/db` |
| 1 스키마 | 8테이블(users·external_identities·sessions·oauth_authorization_requests·academies·academy_memberships·guardians·participants·guardian_participant_links) + R5 필수 제약 전부(UNIQUE·CHECK·FK·index·토큰/state hash 만 저장). 빈 DB migration 적용·제약 강제 9종·tx rollback 테스트 | `packages/db` 테스트 9 |
| 2 Auth API | `apps/api`(Hono, 별도 서버 = 아키텍처 B 정합): start(state hash·PKCE S256·nonce) → callback(**state 원자적 일회성 소비** → code 교환 tx 밖 → nonce 대조 → 짧은 tx) → 세션(원문=쿠키만·HttpOnly·SameSite=Lax) → me·logout·logout-all | `apps/api` 테스트 11 |
| 3 Route Guard | requireSession 체인(fail-closed) + CSRF(Origin allowlist + double-submit). R5 §3.7 부정 케이스 전부: state 재사용·만료·위조 / nonce 불일치 / logout-all 즉시 무효 | 〃 |

**R5 즉답 P0**: PG 시뮬레이터 게이트 실연결(차단 테스트 4종) · 초대코드 정본=Redemption COUNT 확정.
**남은 것(R5)**: 실 provider 키 연동(카카오 앵커) · membership/academy context guard 확장 ·
runtime validation · 초대코드 redemption 실 트랜잭션(Phase 4) · CI postgres service(동시성) ·
Playwright E2E · Admin console-admin 물리분리(B5).

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
