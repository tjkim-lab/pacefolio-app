# PACEFOLIO (페이스폴리오)

유소년 스포츠·교육 아카데미 운영 플랫폼. 원더짐 = 고객 0번(내부 검증 → 시장 확장), 멀티테넌트 day 1.

> **백엔드 착공 단계** (DB 착공 금지 헌법은 2026-07-16 유저 확정으로 해제 — 5차 리뷰 GO 판정 근거).
> DB·API·인증은 실 코드가 존재하고, 웹 화면은 아직 fixture(mock) 기반이다.
> 아래 "구현됨 / mock / 미구현" 구분이 이 저장소의 현재 상태 정본이며,
> 진행 이력·검증 수준은 [STATUS.md](./STATUS.md) 참조.

## 현재 구현됨 (실 코드 + 자동 테스트)

- **`packages/db`** — PostgreSQL 16 + Drizzle. migration 6개, 복합 FK(교차 테넌트 배분 차단)·UNIQUE·CHECK 제약을 DB 가 강제. 테스트는 PGlite(진짜 Postgres WASM, Docker 불필요)
- **`apps/api`** (Hono, 별도 서버 = 배포 아키텍처 B 정합)
  - OAuth 계약: start(state hash·PKCE S256·nonce) → callback(state 원자적 일회성 소비 → code 교환 → 세션 발급)
  - 세션·route guard: 쿠키 원문 미저장(sha256), fail-closed 검증 체인, academy context guard(테넌트 격리·역할)
  - CSRF: Origin allowlist + double-submit 토큰
  - 보호자-자녀 연결: OTP 검증세션 1회 소비·초대코드 귀속을 원자 트랜잭션으로
  - 결제 준비: 멱등(재생/409)·Invoice lock·활성 attempt 차단·도메인 정산 재계산
  - PG 웹훅 inbox 상태 모델: unique insert·중복/역순/RECONCILE 판단·Invoice 상태 도출
  - AuditLog·Outbox 를 같은 트랜잭션으로 기록
- **`packages/api-client`** — zod 로 응답 runtime 검증 + CSRF 헤더 자동
- **`packages/domain`** — 정산 불변식·상태머신·권한 actor-binding·멱등·웹훅 판단(정본 계약)
- **동시성 테스트** — 동일 초대코드 20 동시 요청 → 1 성공 등, CI 의 postgres:16 service 에서 실행
- **`api/openapi.yaml`** — 구현된 경로는 실제 응답 형식 기준으로 기술, enum 은 domain 과 drift 테스트로 자동 대조. Redocly lint = CI

## 현재 mock (실물처럼 보이지만 시뮬레이션)

- **웹 5개 앱 화면**(`apps/web`: `/parent` 학부모 · `/coach` 코치 · `/owner` 원장 모바일 · `/pc` 원장 콘솔 · `/admin` 본사) — 공용 fixture 기반. api-client 전환 예정
- **PG 결제** — mockpg 시뮬레이터(실 PG 미연동). 웹 화면 쪽은 `PG_SIMULATION` 플래그
- **OAuth provider** — FakeProvider (실 카카오 개발자 키 대기). 계약·검증 로직은 실 코드

## 현재 미구현

- 실 PG 서명 검증·provider event 매핑(adapter) · RECONCILE worker(재조회 큐 폴링)
- 환불 persistence(도메인 규칙은 완료) · 대사(reconciliation) 모델
- Admin `apps/console-admin` 물리 분리(현재 같은 웹 앱의 `/admin`)
- UI ↔ API 연결(웹 화면의 fixture → api-client 스위칭)
- OTP 발송/검증 API(현재는 seed 검증세션) — `openapi.yaml` 의 "(계약 초안 — 미구현)" 표기 경로 전부

## 구조 (monorepo · npm workspaces)

```
apps/web              Next.js 프론트 — 역할별 5개 앱 (fixture 기반)
apps/api              Hono API 서버 — 인증·연결·결제·웹훅 (구현 정본)
packages/domain       @pacefolio/domain — 공유 도메인 코어(정본 계약)
packages/db           @pacefolio/db — Drizzle 스키마·migration·seed
packages/api-client   @pacefolio/api-client — zod 응답 검증 클라이언트
packages/event-contracts  분석·귀속·감사 이벤트 계약(PII 가드)
api/openapi.yaml      API 계약 — 구현 경로는 실 응답 기준, enum drift 자동 대조
docs/                 설계 문서(02~12) · ROADMAP-R2 · 리뷰 기록
```

## 로컬 실행

```bash
npm install
npm run dev                    # 웹 http://localhost:3000 (fixture — DB 불필요)

# API 서버는 PostgreSQL 16 + DATABASE_URL 필요
DATABASE_URL=postgres://... npm run dev -w @pacefolio/api

npm test                       # 전 워크스페이스 테스트 — 개수·범위는 이 명령으로 확인
npm run typecheck && npm run lint && npm run build
npx @redocly/cli lint api/openapi.yaml   # OpenAPI lint (CI 포함)
```

동시성 경쟁 테스트는 `DATABASE_URL_TEST` 설정 시에만 실행(CI postgres service). 로컬은 자동 skip.

## 보안상 production 에서 금지되는 기능 (fail-closed)

| 기능 | 게이트 |
|---|---|
| `/demo` · `/stage` 데모 라우트 | 프로덕션 빌드 404 (build-time env guard) |
| 결제 시뮬레이션 | `PG_SIMULATION` 프로덕션 강제 false |
| `POST /auth/dev/login` | 프로덕션 404 (enableDevLogin && !production) |
| mockpg 웹훅 | 프로덕션 404 + 시크릿 필수(시크릿 없으면 dev 에서도 404) |
| 실 provider 웹훅 | 등록된 verifier 없는 provider = 404 (allowlist) |

## 문서

- **진행 현황·검증 수준**: [STATUS.md](./STATUS.md) — 완료 표기는 저장소 증거(테스트·타입·CI) 기준
- **현행 계획**: [docs/ROADMAP-R2.md](./docs/ROADMAP-R2.md)
- **설계**: `docs/02-entity-model` ~ `12-communication`
- **리뷰 기록**: `docs/REVIEW-2026-07-16*.md`
