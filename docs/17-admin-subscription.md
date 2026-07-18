# 17. Admin 백엔드 1차 + 구독(가격정책) — #27

> 2026-07-18 착수. 근거: TJ 지시 "월 29,000원 / 월 99,000원 두 개로 정해서 할 수 있는 거 해줘" + "1~4번도 당연히".

## A. 가격정책 (확정)

| 플랜 | 월 요금 | 비고 |
|---|---|---|
| **BASIC** | **29,000원** | |
| **PRO** | **99,000원** | |

- **확정된 것**: 2플랜 구조와 가격. `packages/domain/enums.ts` `SUBSCRIPTION_PRICE_KRW` 가 정본.
- **미확정(TJ 결정 대기)**: 플랜별 **기능 구분** — 무엇이 BASIC이고 무엇이 PRO 전용인지.
  초안 제안(확정 아님): BASIC = 기본 운영(출결·청구·소통·공지), PRO = 고급(마케팅 모듈·커리큘럼 고급·다부문·우선 지원). 확정 시 이 표를 갱신하고 기능 gate 를 코드에 배선.
- 구독 행은 가격 **스냅샷**(`priceKrwMonthly`)을 저장 — 향후 가격 개정 시 기존 고객 요금 보호/이관을 명시적으로 결정할 수 있게. **같은 플랜 재지정·복원은 기존 스냅샷 유지, 가격표 반영은 플랜이 실제로 바뀔 때만**(세션 리뷰 반영 — 일괄 개정은 명시적 reprice 트랙으로).
- 구독 결제(우리가 학원에게 청구하는 실제 수납)는 미구현 — 현재는 플랜 지정·MRR 집계까지. PG 연동 시 결제선생 모델 검토(RESEARCH-2026-07-14 B1)와 함께.

## B. Admin 경계 (guard)

- `requirePlatformAdmin`: ACTIVE `PLATFORM_ADMIN` 멤버십만 통과, 그 외 **404**(admin 표면 존재 은닉).
- 대칭 격리(기존): `requireAcademyContext` 는 PLATFORM_ADMIN 을 **403** (`PLATFORM_ADMIN_SEPARATE_BOUNDARY`) — 관리자는 일반 앱을 못 쓰고, 일반 역할은 admin 을 못 본다.
- **모든 상태 변경은 감사**: `actorRole=PLATFORM_ADMIN` 으로 AuditLog. "관리자도 감사받는다."

## C. API (구현 완료 · openapi.yaml `admin` 태그)

| 경로 | 무엇 |
|---|---|
| `GET /admin/overview` | MRR(ACTIVE 구독 월요금 합)·플랜별 카운트·학원/원생 수·수납/미납 총액·환불 대기 |
| `GET /admin/academies` | 학원별: 구독(플랜·상태·가격)·재원 원생 수·미납액·정지 여부 |
| `PUT /admin/academies/:id/subscription` | 플랜 지정·변경(upsert, 가격 스냅샷, CANCELED→ACTIVE 복원) |
| `POST /admin/academies/:id/subscription/cancellation` | 해지(MRR 제외·멱등) |
| `POST /admin/academies/:id/suspension` | 학원 정지 — 사유 필수, **ACTIVE 일반 멤버만** 세션 즉시 폐기(PLATFORM_ADMIN·시행자 제외 — 세션 리뷰 반영), guard 가 `ACADEMY_SUSPENDED` 403. academyCtx 미적용 라우트(guardian-links·members/accept)도 `requireAcademyAlive` 로 차단. ⚠️ 세션은 사용자 전역이라 다학원 겸직자는 타 학원 세션도 함께 끊김(재로그인으로 복구 — 의도된 트레이드오프) |
| `DELETE /admin/academies/:id/suspension` | 정지 해제(멱등) |
| `GET /admin/support-views` | SupportView 이력 조회 — 최근 50건(학원명·사유·만료·철회) |
| `POST /admin/support-views` | SupportView 발급 — 사유 필수·기본 30분·최대 60분·리소스는 `SUPPORT_VIEW_RESOURCE` enum만 |
| `POST /admin/support-views/:id/revocation` | 철회(멱등) |
| `POST /admin/users/:id/session-revocation` | 사용자 전 세션 강제 폐기 — 사유 필수 |

## D. 남은 것 (2차)

1. **admin 화면 실연결** — 부분 완료(#28~30): 홈 KPI·billing(수익)·academies(정지/해제)·cs(SupportView) 4개 표면 실연결됨(`admin/_live.tsx`·`_kpi.tsx`·`_support-views.tsx`). 잔여: payments·comm·users·system·tasks·settings·academies/[id] 상세.
2. **SupportView 실 열람 게이트** — 지금은 수명주기(발급·만료·철회·감사)만. 유효 SupportView 를 지닌 관리자에게 대상 학원 읽기전용 조회를 여는 미들웨어는 열람 API 설계와 함께.
3. **구독 실 결제** — 우리→학원 청구·수납(월 자동결제). PG/계좌이체 결정 후.
4. TRIAL/PAST_DUE 수명주기 자동화(체험 만료·미납 시 전환 워커).
5. 플랜별 기능 gate — 기능 구분 확정 후.
