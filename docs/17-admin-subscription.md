# 17. Admin 백엔드 1차 + 구독(가격정책) — #27

> 2026-07-18 착수. 근거: TJ 지시 "월 29,000원 / 월 99,000원 두 개로 정해서 할 수 있는 거 해줘" + "1~4번도 당연히".

## A. 가격정책 (확정 — 2026-07-19 3단 개정)

| 플랜 | 월 요금 | 한 줄 | 모델 |
|---|---|---|---|
| **FREE** | **0원** | 일단 써보세요 — 운영 코어 전부, 원생 30명까지 | **구독 행 없음**(또는 CANCELED) |
| **BASIC** | **29,000원** | 운영의 전부 — 무제한 + 대량·자동화 도구 | 구독 plan=BASIC |
| **PRO** | **99,000원** | 성장의 전부 — 격을 올리는 것 | 구독 plan=PRO |

- **확정(TJ 2026-07-19)**: 3단 FREE/BASIC/PRO + 기능 구분. 정본 = `packages/domain/plan.ts`
  (`FEATURE_MIN_PLAN`·`FREE_PARTICIPANT_LIMIT`) — 서버 게이트와 화면이 같은 매트릭스를 읽는다.
- **구분 원칙**: ① "전화를 없애는" 운영 코어(출결·청구·결제·수납·공지·소통·안전·기본 리포트/박수 루프)는
  FREE 부터 전부 — 북극성·학부모 락인은 가두지 않는다(무료 경쟁자 패리티) ② FREE→BASIC = 규모(원생
  30명 상한 해제) + 대량·자동화(반 일괄 청구 등) ③ BASIC→PRO = 격(뱃지·AI 리포트·성장판·마케팅·대회·
  다부문) + 원가 드는 것(알림톡 대량)
- **v1 게이트(서버 배선 완료 #49)**: FREE 원생 상한 30(퇴원 제외 재적, 402) · BASIC+ = 반 일괄
  청구(draft/issue) · PRO = 프로그램 CSV 가져오기(stage/commit)·프로그램 복제·뱃지 정의.
  미구현 기능의 게이트(자동 미납 타임라인·성장판·마케팅·대회·다부문)는 해당 기능 구현 시 함께.
  응답 = **402 `PLAN_UPGRADE_REQUIRED`** + currentPlan/requiredPlan(화면 안내 정본).
  애매한 항목은 "일단 열고 데이터 보고 잠근다" — 스냅샷 구조가 기존 고객 보호.
- **FREE 지정 방법**: admin 에서 FREE 는 별도 플랜 지정이 아니라 **구독 해지(cancellation)** — MRR 자연 정합.
- PAST_DUE = 플랜 유지(유예 — 운영을 인질로 잡지 않음). 전환·독촉은 구독 수납 트랙에서.
- **기능 예외 grant(#50)**: 영업 현장의 "한두 달 열어주기" 정본 — 학원×기능 단위로 플랜 게이트를
  기간 한정 우회(`academy_feature_grants`, migration 0029). TJ 실경험(영업 관행) 근거로 확정 2026-07-19.
  사유 필수·기간(일수) 또는 무기한·철회 즉시 복귀·**만료는 판정 시점 lazy 자동 잠금(워커 불요)**·
  발급/철회 전부 감사·append-only 이력. 원생 상한 예외 = `UNLIMITED_PARTICIPANTS` grant.
  콘솔 = admin 학원 관리 행 "기능 예외…" 패널. "3개월 PRO 통째로"는 grant 가 아니라 플랜 지정으로.
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
