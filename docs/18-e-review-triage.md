# 18. E 리뷰(제품 UI 검토) 트리아지 — #21

> 2026-07-18 수신. 리뷰 대상 커밋 = `8f466cb` — **그 이후 반영분이 많아 시점 보정 필요**.
> 리뷰 결론(동의): "UI 프로토타입 완성도 높음 / 운영 가능한 제품 기능은 미완".
> 최대 위험(동의): 화면 완성도가 높아 실제 저장·발송이 된 것처럼 보이는 것.

## A. 리뷰 시점 이후 이미 해소된 항목 (커밋 근거)

| 리뷰 지적 | 해소 커밋/근거 |
|---|---|
| 학부모: 오류를 fixture 로 조용히 전환(P0) | 4상태 LiveProvider(FIXTURE=API 부재만, 실연결 후 오류=ERROR 표시) — parent·coach·pc·admin 전면. probe 5xx=ERROR 까지 `c97af3c` |
| 학부모: academyId `a_wondergym` 고정 | 세션 멤버십에서 도출 (13차 B 반영) |
| 학부모: 결제 멱등키 재시도마다 새로 생성 | `payIdemRef` — 같은 선택엔 같은 키 재사용 (13차 B P0) |
| `@pacefolio/api-client` web dependencies 미선언 | `apps/web/package.json` 에 선언되어 있음 |
| 코치: 출석 저장·수업 완료가 in-memory | #25 — `recordAttendance`/`completeSession` 실 API (담당 검증·전원 검증 서버 강제) |
| 원장: 공지 발송·읽음 추적 fixture | #25 잔여(`c7f89f6`) — `publishNotice`·`listNotices`(수신·미열람 서버 정본) |
| 원장: 수납 수치 fixture (setInterval) | #25 잔여 — `billing/summary` 실 집계(READY 시 타이머 카드 대체) + 리뷰 반영으로 부분수납 정합까지 (`c97af3c`) |

## B. 이번 배치 반영 (E P0)

1. **결제 시뮬레이션 웹훅 명시 게이트** — 브라우저의 mockpg 웹훅 호출(`x-webhook-secret`)은
   `NEXT_PUBLIC_PACEFOLIO_PG_SIMULATION=1` 없이는 실행 불가. 실 PG 전환 시 블록 전체 제거 대상 주석 명시.
2. **proxy 역할 검증(P0-4)** — `REQUIRE_SESSION=1` 이면 쿠키 존재가 아니라 **API `/sessions/me` 세션 정본**으로
   판정: 401→로그인 유도, 라우트별 역할(ACTIVE 멤버십) 불일치·판정불가·API 불통 = **404 fail-closed**.
   맵: /parent=GUARDIAN · /coach=COACH · /owner=OWNER·MANAGER · /pc=OWNER·MANAGER·DESK · /admin=PLATFORM_ADMIN.

## C. 남은 작업 (태스크 등재)

| 태스크 | 내용 | E 리뷰 대응 |
|---|---|---|
| 코치·원장 소통 실연결 | 공지 ACK·전달사항·READ/ACK/RESOLVE 를 Batch 14 chat API 로 — setTimeout 가짜 상태 제거 | P0-3 일부, P1 |
| 안전사고 기록 백엔드 | incidents 테이블 + AuditLog + 원장 알림 Outbox + C2 IncidentSheet 연결(고정 시각 제거) | C2 안전 FAIL |
| 리포트·사진 파이프라인 | **사전 코어 완료**: 동의 영속화(PUT+If-Match·철회)·photo_assets·어댑터 경계(dev 구현)·**동의 게이트 서버 강제**(finalize 422+차단 명단)·열람 권한+감사·미주입 501. 잔여 = 실 사업자 어댑터 1개 + 코치 C3 화면 연결(스토리지 결정 대기) | C3 FAIL → 코어 해소 |
| UI_ONLY 정직 표시 | fixture 화면 데모 배지·"(데모)" 토스트 일관 규약 — **디자인 터미널과 협의**(비주얼 규약) | P0-1 |
| Playwright E2E | 핵심 여정(출석 저장 차단·결제 완료 판정·정지 차단 등) 브라우저 검증 | §7, 13B P1-1 |
| AudienceFilter 공용 확장 | 공지·수납·대회·CSV 재사용(현재 원생 화면만) | P1 |
| PC draft 서버 정본화 | 휴무·회차·할인·청구 draft·강사 교체 — 백엔드 신규 슬라이스 필요(대형) | 13B FAIL |

## D. 리뷰어 회신 요지

- UI 승인 항목 감사히 수용. "운영 기능 미완" 판정 동의 — 단 대상 커밋 이후 A 표의 7개 항목은 이미 실연결/수정됨.
- 방향 합의: 신규 화면 추가보다 **정직한 데모 표시 + 쓰기 API 연결 + 역할 검증 + E2E** 우선.
