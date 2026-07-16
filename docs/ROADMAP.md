# PACEFOLIO 로드맵 — 백엔드 착수 전 기반 고정

두 외부 리뷰(2026-07-16)와 아키텍처 결정을 하나로 합친 마스터 계획.
- [REVIEW-2026-07-16.md](./REVIEW-2026-07-16.md) — 코드 구조·데이터·권한·결제 리뷰
- [REVIEW-2026-07-16-account.md](./REVIEW-2026-07-16-account.md) — 계정·프로필·설정 리뷰

## 한 문장
> 화면을 더 그리지 말고, **공유 도메인 코어(ID·엔티티·상태·권한·동의)**를 먼저 고정한다. 이것은 DB 착공이 아니라 착공 前 계약 정의 — 헌법("목업 확정 전 DB 착공 금지")과 같은 방향.

---

## 1. 확정 결정 로그
- ✅ **배포 아키텍처 = B (monorepo · 공유 코어 + 관리자 분리)** — 2026-07-16 유저 확정. "하루이틀 할 서비스가 아니다."
- ✅ **단, 지금 폴더를 쪼개지 않는다** — 도메인 모델 모양이 아직 없음. 먼저 `lib/domain`으로 코어를 짓고 모양 확정 → 그 다음 `packages/domain` 승격 + Admin 분리. (이르게 재배치 = churn)
- ✅ 접근성 P0(화면 확대 차단) 제거 완료.
- ⏸ 디자인 톤(warm↔clean) 최종 확정은 디자인 터미널 소관 — 별개.

## 2. 목표 아키텍처 (B)
```
packages/
  domain/       ← ids·enums·entities·state-machines·calculations (지금 lib/domain 이 씨앗)
  ui/  tokens/   ← 디자인 시스템 1벌
  api-client/    ← API 호출 1벌
apps/
  console-admin/ ← 관리자 (교차 테넌트 개인정보 = 최대 위험 → 별도 배포·서버 경계)
  app/           ← 학부모·코치·원장 (당분간 Route Group, 필요 시 추후 분리)
```
- **공유 코어**가 "앱마다 _data.ts가 다른 세계관" 문제(리뷰 데이터 일관성 🔴)를 구조적으로 봉쇄.
- **Admin 분리**가 최대 보안 리스크를 day 1에 격리.

## 3. 통합 P0 백로그 (착수 前 필수)
| # | 항목 | 근거 | 형태 |
|---|------|------|------|
| F1 | 엔티티·ID 확정 (branded) | R1 P0-2 · R2 | ✅ `ids.ts` |
| F2 | 핵심 enum·상태값 | R1 P0-5 · R2 P0-3 | ✅ `enums.ts` |
| F3 | 엔티티 모델 문서 | R1 P0-1 | ✅ `docs/02` |
| F4 | 상태머신 문서(Invoice/Payment/Refund/Attendance/Task/Membership/Consent/Support) | R1 · R2 | ✅ `docs/03` |
| F5 | 공용 fixture 통합 (`lib/fixtures`) + 앱별 `_data`→ViewModel | R1 P0-1 | 🟡 1단계 done: 단일 데이터셋+선택자+정합성검증. 남음: 앱별 `_data` 교체 |
| F6 | 권한 매트릭스 (역할·필드·행동) + 멀티테넌트 격리 규칙 | R1 P0-6 · R2 P0-1 | ✅ `permissions.ts`+`docs/04` (검증 7/7) |
| F7 | AcademyMembership 모델 (User ≠ 학원역할 분리) | R2 | ✅ `membership.ts`+`docs/05` |
| F8 | 보호자-자녀 연결 + OTP 검증 모델 | R2 P0-2 | ✅ `guardian-linking.ts`+`docs/05` (이름만 REJECTED 검증) |
| F9 | 청구·결제·환불 계산·멱등·webhook 규칙 문서 | R1 P0-5 | ✅ `docs/06` — 기존 `payment-engine/`(40/40) 정합·매핑, fixture 금액 재현 검증 |
| F10 | 수납기간 표기 통일 (YYYY-MM-DD, "분기" 제거, 단위 명시) | R1 P0-4 | 🟡 모델 완료(`BillingPeriod` YYYY-MM-DD). UI "분기" 문구 정리는 app/디자인 |
| F11 | 알림 카테고리·채널·필수/선택/홍보 모델 | R2 P0-3 | ✅ `notifications.ts`+`docs/07` (안전사고 못끔 검증) |
| F12 | 사진 동의 버전·목적·범위·철회 + 개인정보 공개범위 정책 | R1 P0-7 · R2 4-1·4-2 | ✅ `consent.ts`+`docs/08` (철회·범위 검증) |
| F13 | 앱 간 도메인 이벤트 카탈로그 | R1 P0-3 | ✅ `events.ts`+`docs/07` |
| F14 | 계정 라이프사이클 (로그아웃·학원나가기·탈퇴 보관정책) | R2 P0-5 | ✅ `docs/09` |
| F15 | OpenAPI 초안 + 공통 오류코드 | R1 | ✅ `api/openapi.yaml` |

## 4. 실행 순서 (개발, 전부 헌법-safe)
1. **F1·F2 완성** — ids·enums (진행 중) + 리뷰 누락분 보강
2. **F3·F4** — 엔티티 모델 + 상태머신 문서 (docs/02·03)
3. **F5** — 공용 fixture 통합, 앱 간 데이터 충돌 제거 (`/stage` 흐름이 실제로 이어지게)
4. **F6·F7·F8** — 권한·멤버십·자녀연결 모델
5. **F9·F10** — 결제/환불/수납기간
6. **F12·F14** — 동의·개인정보·계정 라이프사이클
7. **F13·F15** — 이벤트 카탈로그·OpenAPI 초안
8. **monorepo 승격** ✅ (stage 1 완료, main 머지·push) — `packages/domain`(공유코어 9모듈=@pacefolio/domain) + `apps/web`. 루트 `npm run dev`/`build` 동작. **Admin 물리분리(`apps/console-admin`)는 stage 2로 남음** — 별도 Next 앱 + 공유 UI 패키지 추출, 집중 세션 권장.
9. P1: 공통 컴포넌트 통합 + 코드 접근성 (시각 접근성은 디자인 터미널)

## 5. 개발 / 디자인 경계
- **이 세션(dev)**: 모델·상태·권한·연결 규칙·fixture·이벤트·OpenAPI·컴포넌트 구조·코드 접근성(aria·focus·viewport).
- **디자인 터미널**: 계정 설정 UI, 글자크기(≥14px)·터치영역(44px)·명암, warm/clean.

## 6. 열린 결정 (유저)
- monorepo 승격 시점 (F5 이후 vs 더 나중).
- 코치 "편집권한 시연 토글" 제거 시점 (리뷰#1 6-3, 실제품 노출 금지).
- Admin 별도 배포를 언제 물리적으로 실행할지.

## 7. 백엔드 착수 승인 조건
[REVIEW-2026-07-16.md §7](./REVIEW-2026-07-16.md) 체크리스트 + 계정 모델(멤버십·자녀연결·동의·탈퇴 보관정책) 충족 시 착공.
