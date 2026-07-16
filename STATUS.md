# PACEFOLIO — 진행 현황 (2026-07-16)

> 유소년 스포츠·교육 아카데미 운영 플랫폼. 원더짐 = 고객 0번(내부 검증 → 시장 확장), 멀티테넌트 day 1.
> **헌법: 목업 확정 전 DB 착공 금지.** 현재 = 백엔드 착공 前 기반 고정 단계.

## 한 줄
정적 목업 → **실제 구동되는 프론트(Next.js)** 로 전환 + 백엔드 착공 前 **공유 도메인 코어(F1~F15)** 고정 + **모노레포 승격**. DB는 아직 안 팜.

---

## 이번 라운드에 무엇이 바뀌었나 (← 지난 리뷰 대비)

지난 외부 코드리뷰 2건(커밋 `539b818` 기준)의 결론은 **"화면 더 그리지 말고, 데이터·상태·권한·결제의 기준점부터 고정하라"** 였다. 그에 답해 착공 前 기반 **F1~F15**를 만들고 구조를 모노레포로 승격했다.

### 구조 변화
| | 이전 (리뷰 시점 `539b818`) | 지금 |
|---|---|---|
| 구조 | 플랫 단일 패키지 | **모노레포** (`apps/web` + `packages/domain`) |
| 공유 도메인 코어 | 없음 (앱별 `_data.ts` 제각각) | `@pacefolio/domain` 9모듈 |
| 설계 문서 | 없음 | `docs/02~09` + OpenAPI 초안 |

### F1~F15 — 착공 前 기반 (완료)
| # | 항목 | 산출물 | 상태 |
|---|------|--------|------|
| F1·F2 | branded ID · 핵심 enum/상태값 | `packages/domain/ids.ts`·`enums.ts` | ✅ |
| F3·F4 | 엔티티 모델 · 상태머신 문서 | `docs/02`·`docs/03` | ✅ |
| F5 | 공용 fixture(단일 데이터원천) | `apps/web/lib/fixtures/` | 🟡 앱별 `_data` 교체 잔여 |
| F6 | 권한 매트릭스 · 멀티테넌트 격리 | `permissions.ts` + `docs/04` (검증 7/7) | ✅ |
| F7·F8 | 학원 멤버십 · 보호자-자녀 OTP 연결 | `membership.ts`·`guardian-linking.ts` + `docs/05` | ✅ |
| F9 | 청구·결제·환불 정합 | `docs/06` (기존 payment-engine 40/40 재사용) | ✅ |
| F10 | 수납기간 표기 통일 (YYYY-MM-DD) | `BillingPeriod` 모델 | 🟡 UI 문구 정리 잔여 |
| F11~F13 | 알림·이벤트·동의 카탈로그 | `notifications/events/consent.ts` + `docs/07·08` | ✅ |
| F14 | 계정 라이프사이클(탈퇴 보관정책) | `docs/09` | ✅ |
| F15 | OpenAPI 초안 + 오류코드 | `api/openapi.yaml` | ✅ |

---

## 리뷰어에게 받고 싶은 피드백
1. **도메인 모델** — 엔티티 계층·상태머신·권한표가 실서비스 계약으로 충분한가 (`docs/02·03·04`, `packages/domain/`)
2. **결제/환불 정합** — 회차 일할·합산결제 원생별 배분·멱등/webhook 규칙 (`docs/06`)
3. **배포 아키텍처 B** — 공유 코어 + 관리자(admin) 물리 분리 방향 동의 여부 (`docs/ROADMAP.md`)
4. **개인정보·동의·계정** — 사진 동의 버전/철회, 탈퇴 보관정책 수준 (`docs/08·09`)

## 실행 방법
```bash
npm install          # 루트에서 (npm workspaces)
npm run dev          # → http://localhost:3000
npm run build        # 프로덕션 빌드
```
주요 화면: `/parent` `/coach` `/owner` `/pc` `/admin`, 그리고 4개 앱을 한 데이터로 잇는 라이브 데모 `/stage` · `/stage/live`.

## 아직 안 된 것 (정직하게)
- 🟡 앱별 `_data.ts` → 공유 fixture 완전 교체 (F5 잔여)
- 🟡 UI "분기" 문구 정리 (F10 잔여, 디자인 소관)
- ⬜ 모노레포 stage 2: 관리자 물리 분리(`apps/console-admin`)
- ⬜ 코치 "편집권한 시연 토글" 제거 (실서비스 노출 금지)
- ⬜ 디자인 톤 warm↔clean 최종 확정 (별도 디자인 트랙)

## 스택
Next.js 16.2.10 · React 19.2.4 · TypeScript · Tailwind v4 · npm workspaces

---
_이 문서는 검토용 스냅샷입니다. 세부 결정·이력은 `docs/` 및 각 모듈 주석 참고._
