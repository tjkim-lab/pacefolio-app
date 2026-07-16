# PACEFOLIO (페이스폴리오)

유소년 스포츠·교육 아카데미 운영 플랫폼. 원더짐 = 고객 0번(내부 검증 → 시장 확장), 멀티테넌트 day 1.

> ⚠️ **Non-production 프로토타입.** 화면 데이터는 mock/fixture이며, 결제는 시뮬레이션(실 PG 미연동),
> Admin 콘솔은 아직 물리 분리 전(같은 앱), 로그인·세션은 미구현입니다.
> **헌법: 목업 확정 전 DB 착공 금지** — 현재는 백엔드 착공 前 계약(타입·상태전이·테스트) 고정 단계.

## 구조 (monorepo · npm workspaces)

```
apps/web              Next.js 프론트 — 역할별 앱 (아래 URL)
packages/domain       @pacefolio/domain — 공유 도메인 코어(정본 계약)
  ids / enums / entities        branded ID · 상태값 · 엔티티
  billing                       정산 계산·불변식(순수납액·환불잔액·참조 무결성)
  state-machines                Invoice/Payment/Refund 전이 guard
  authorization                 리소스 권한(actor-binding: 보호자·코치·SupportView)
  guardian-linking              보호자-자녀 연결(OTP 검증세션 + 초대코드 귀속)
  consent                       사진동의 목적×대상 grant
  idempotency / webhooks        멱등 replay · PG 웹훅 중복/역순/재조회
api/openapi.yaml      API 계약 초안 — enum 은 domain 과 drift 테스트로 자동 대조
docs/                 설계 문서(02~09) · ROADMAP-R2(현행 계획) · 리뷰 기록
```

## 실행 · 검증

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 도메인 테스트(정산·상태전이·권한·웹훅·멱등·동의·OpenAPI drift)
npm run typecheck  # 도메인 tsc
npm run build      # 프로덕션 빌드
```

## 주요 화면

| URL | 역할 |
|---|---|
| `/parent` | 학부모 |
| `/coach` | 코치 |
| `/owner` | 원장(모바일) |
| `/pc` | 원장(PC 콘솔) |
| `/admin` | 본사 운영자 (⚠️ 물리 분리 전) |
| `/stage` · `/stage/live` | 4개 앱을 한 데이터로 나란히 보는 라이브 데모 |

## 문서

- **진행 현황·검증 수준**: [STATUS.md](./STATUS.md) — 완료 표기는 저장소 증거(테스트·타입) 기준
- **현행 계획**: [docs/ROADMAP-R2.md](./docs/ROADMAP-R2.md)
- **설계**: `docs/02-entity-model` ~ `09-account-lifecycle`
- **리뷰 기록**: `docs/REVIEW-2026-07-16*.md`
