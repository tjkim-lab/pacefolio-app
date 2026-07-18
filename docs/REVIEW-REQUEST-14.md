# 14차 리뷰 요청 — 13차 A~E 반영 완료 + 신규 트랙 4개

> 대상: 미러 `main` 최신(`c9072dc` 스냅샷, 소스 `b2e97e1`).
> 직전 리뷰 기준점: 13차 E 대상 커밋 `8f466cb` — **이후 소스 커밋 약 30개**가 반영 대상입니다.
> E 리뷰 트리아지·근거는 `docs/18-e-review-triage.md`, 검증 상태는 CI(verify + e2e 2 job) 그린.

## 1. 13차 리뷰 반영 현황

| 라운드 | 반영 상태 |
|---|---|
| A (C10-01 금액 상한) | ✅ 완료·회신됨 |
| B (Gate 2 UI-API) | ✅ 완료·회신됨 — 결제 완료 판정 = 서버 진실(CAPTURED+PAID) 확인 후에만 |
| C (소통 백엔드) | ✅ 완료·회신됨 — READ≠ACK≠RESOLVED·BILLING 서버 카드·HEALTH 재인가·민감 열람 감사 |
| D (승인↔철회 동시성) | ✅ 완료·회신됨 — 잠금 순서 계약·REVOKED 모델·×20 경쟁 테스트(같은 측 재승인 결함 적발·수정) |
| E (제품 UI 검토) | ✅ **이번 라운드 반영분** — 아래 상세 |

### E 리뷰 반영 상세 (docs/18 트리아지 기준)

**시점 보정(8f466cb 이후 이미 해소돼 있던 7건)** — 4상태 LiveProvider(오류를 fixture 로 위장 금지),
academyId 세션 도출, 결제 멱등키 재사용, api-client 의존성 선언, 코치 출결 실 API,
원장 공지·수납 실 API. 근거 커밋은 docs/18 A표.

**이번 라운드 신규 반영**
1. **proxy 역할 검증 (P0-4)** `3956519` — 쿠키 존재가 아니라 API `/sessions/me` 세션 정본으로 판정.
   라우트별 역할 맵(/parent=GUARDIAN, /coach=COACH, /owner·/pc=staff, /admin=PLATFORM_ADMIN),
   불일치·판정불가·API 불통 = 404 fail-closed.
2. **결제 시뮬레이션 명시 게이트 (P0)** `3956519` — 브라우저 mockpg 웹훅(secret 포함)은
   `PG_SIMULATION=1` 없이 실행 불가, 실 PG 전환 시 제거 대상 블록 명시.
3. **소통 실연결 (#31)** `0113b81` — 원장 전달사항·코치 ACK 를 Batch 14 chat 서버 정본으로.
   setTimeout 가짜 READ→ACK 진행 제거. 신규 `GET /members`(staff·PII 미포함).
   코치 홈 카드: READY 면 서버 전달사항만(없으면 숨김), 확인 = 실 ACK.
4. **안전사고 기록 서버 정본화 (#32, C2 안전 FAIL)** `98c5576` — `safety_incidents` 테이블,
   담당 코치(배정×등록) 검증, 발생 시각 = 서버(고정 15:05 제거), 감사(상황 원문 미포함)+
   원장 알림 Outbox, 열람도 감사.
5. **Playwright E2E (§7)** `16f8af4` — 코치 ACK·PC 공지 발행·admin MRR 3여정을
   실 서버 조합(API PGlite seed + next dev + chromium)으로 브라우저 검증, CI e2e job 추가.

**보류(설계 트레이드오프로 문서화)** — 다학원 겸직자 세션 동반 폐기(세션이 사용자 전역),
dev 데모 탭 간 쿠키 경쟁, UI_ONLY 데모 배지(디자인 규약 협의 중), AudienceFilter 확장,
PC draft(휴무·회차·일괄청구) 서버 정본화(대형 슬라이스로 분리).

## 2. E 이후 추가 진행 (리뷰 범위 밖 신규 트랙)

### A. 가격정책 확정 + Admin(플랫폼 관제) 트랙 — `fbe120e`~`ee47dff`, docs/17
- **가격 확정(2026-07-18)**: BASIC 월 29,000 / PRO 월 99,000. 플랜별 기능 구분은 TBD.
- 백엔드: `academy_subscriptions`(가격 스냅샷·학원당 1행)·`support_views`·`academies.suspendedAt`,
  `requirePlatformAdmin`(비관리자 404 은닉 — 일반 앱의 PLATFORM_ADMIN 403 과 대칭 격리),
  /admin API 10종(overview MRR·학원별 지표·구독 지정/해지·학원 정지/해제·SupportView·세션 강제 폐기),
  전 상태 변경 감사.
- 화면 실연결 4표면: 홈 KPI(MRR·활성 학원·재원·미납)·billing(플랜 행내 변경)·
  academies(정지/해제 — 사유 필수)·cs(SupportView 발급/이력/철회).

### B. 원장 수납·공지 실연결 마감 — `c7f89f6`
- 신규 `GET /billing/summary`(staff): 발행·수납·미납 집계. PC 공지 발송 = 실 발행,
  최근 공지 = 서버 목록(수신·읽음·미열람). 수납 현황 카드 = 서버 집계(가짜 setInterval 은 FIXTURE 전용).

### C. 자체 멀티에이전트 코드리뷰 + 반영 — `c97af3c`
- 5차원 파인더 × 발견당 적대 검증 2렌즈(에이전트 65개): 발견 30 → 검증 생존 26 → 실질 13.
- P1 2건 수정: **미납 집계 이중계상**(PARTIALLY_PAID total 전액 계상 → open total − 기수납 배분,
  부분환불 순수납 포함 — 3곳 복제 수정+회귀 테스트) / **mutation 성공을 refresh 실패로 위장**.
- P2: 정지 경계 봉합(`requireAcademyAlive` — guardian-links·members/accept 우회 차단,
  suspend 시 PLATFORM_ADMIN·시행자 세션 제외로 콘솔 자기잠금 방지, admin 404 은닉 순서),
  구독 같은-플랜 재지정 시 grandfather 가격 보존, SupportView 리소스 enum 검증 등.

### D. 컴플라이언스·기반 — `bc403bd`·`54602ae`
- PII 암호화 배선: 전화 원문 저장 제거(hash+enc, 대조 경로 3필드, migrations 0016/0017),
  프로덕션 키 미설정 fail-closed. docs/16(보유기간·사고 대응)·처리방침 초안.

### E. 사진 파이프라인 사전 코어 (#19, C3 대응) — `b2e97e1`
- 동의 영속화(초안 계약 구현: PUT+If-Match(version)=409·철회·전 변경 감사, VERIFIED 보호자만),
  `photo_assets`(+등장 원생 태그), 스토리지 어댑터 경계(dev 인메모리 구현·프로덕션 미주입 501).
- **동의 게이트 서버 강제**: finalize 시 등장 전원 목적×대상 정확 조합 재검증(`canSendPhotoAsset`) —
  미동의 원생 = 422 CONSENT_REQUIRED + 차단 명단. "동의 없는 사진 제외"가 UI 문구 → 서버 검증.
- 잔여: 실 사업자 어댑터 1개(스토리지 결정 대기) + 코치 C3 화면 연결.

## 3. 검증 상태
- 테스트: api 133(부분수납 집계·정지 우회·자기잠금·사진 동의 게이트 등 회귀 포함) ·
  domain 140 · db 15 · web 10 · **Playwright e2e 3** — 전부 그린.
- CI: verify + e2e 2 job, 미러 최신 `c9072dc` SUCCESS.

## 4. 리뷰 요청 포인트
1. **E 재평가** — docs/18 A표(시점 보정) + 이번 반영으로 승인표가 어떻게 바뀌는지.
   특히 "원장·코치 실제 처리 FAIL" 항목들의 현재 판정.
2. **Admin·구독 신규 표면** — 경계 설계(404 은닉·대칭 격리·SupportView 수명주기),
   MRR·수납 집계 정합(부분수납·부분환불 반영 후), 정지 액션의 파급 처리.
3. **사진 동의 게이트** — grants(목적×대상 쌍) 모델·finalize 차단 명단 UX·열람 감사가
   아동 개인정보 보호 관점에서 충분한지. 어댑터 경계 설계(사업자 교체 비용).
4. **자체 리뷰의 사각** — 우리가 스스로 잡은 13건 외에 남은 결함(특히 동시성·테넌트 격리).
5. **다음 우선순위 권고** — 남은 갭(PC draft 정본화·AudienceFilter 확장·데모 배지·실 PG/스토리지)
   중 무엇부터가 맞는지.
