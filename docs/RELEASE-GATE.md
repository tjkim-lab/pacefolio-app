# PACEFOLIO 테스트·출시 게이트 (TJ 지침 2026-07-19 반영)

> **핵심 원칙**: 테스트는 마지막에 한 번 돌리는 행위가 아니라 **개발 → 검증 → 배포 → 관찰**을
> 계속 반복하는 업무 프로세스다. 목적은 "오류 없음의 증명"이 아니다(불가능) — **위험한 부분을
> 미리 정의하고, 정상·실패·경계·중복·동시성 시나리오를 검사하고, 운영과 비슷한 환경에서
> 검증하고, 소수 사용자에게 먼저 배포하고, 문제를 즉시 탐지·롤백하고, 발견한 버그를 자동
> 회귀 테스트로 남기는 것**이다.

## 0. 출시 전 전체 흐름
```
요구사항 정의 → 로컬 테스트 → PR 코드리뷰 → CI 자동 테스트
→ 통합/보안/동시성 → Staging 실사용 시나리오 → QA 탐색 테스트
→ 출시 승인 → Canary/점진 배포 → 운영 Smoke Test·모니터링
→ 문제 시 롤백·수정·회귀 테스트
```
각 단계가 잡는 오류가 다르다. 하나라도 **필수 항목이 실패하면 배포 중단**(§6).

## 1. 로컬에서 계속 돌리는 것 (커밋 전)
```bash
npm ci                    # 의존성(한 번)
npm run verify            # typecheck → test → redocly → lint → build (CI 검증 job 재현)
npm run test:e2e -w web   # Playwright — API(PGlite seed)+web+console-admin 자동 기동
```
- **`npm run verify` 한 줄이 커밋 전 게이트다.** 파일을 옮기거나 지운 뒤엔 반드시 재실행
  (B5 admin 이동 후 web 유닛 테스트 미실행 → CI red 재발 방지의 교훈).
- **실 PostgreSQL 동시성 테스트**(`concurrency.pg.test.ts`)는 PGlite 로 skip된다. CI 는
  postgres:16 서비스 + `DATABASE_URL_TEST` 로 실행. 로컬에서 같이 돌리려면 Docker:
  ```bash
  docker run -d -p 5432:5432 -e POSTGRES_USER=pacefolio -e POSTGRES_PASSWORD=pacefolio -e POSTGRES_DB=pacefolio_test postgres:16
  export DATABASE_URL_TEST='postgres://pacefolio:pacefolio@localhost:5432/pacefolio_test'
  npm test
  ```

## 2. 테스트 층위 (무엇이 무엇을 잡나)
| 층 | 도구 | 잡는 것 | PACEFOLIO 예 |
|---|---|---|---|
| 단위 | node:test (domain) | 작은 함수의 규칙 | 수업일 계산·휴무 제외·일할 반올림·상태 전이·환불 불변식·출석률 |
| 통합 | node:test + PGlite/PG | API+DB 가 함께 | 학원생성→등록→배정→청구→수납→미납→출결→상세 |
| 동시성 | node:test + **실 PG** | FOR UPDATE·partial unique·직렬화·deadlock | FREE 30명 동시 등록·같은 청구 동시 결제·같은 환불 양측 동시 승인 |
| E2E | Playwright | 브라우저에서 사용자 행동 | 원장 로그인→원생→청구→보호자 확인 / 코치 출석→완료 |
| 보안 | node:test | 역할·테넌트 경계(§4) | A학원 원장이 B학원 원생 조회 = 403/404 |

> PGlite 만으로는 실 PostgreSQL 의 FOR UPDATE·SKIP LOCKED·partial unique·격리 수준·
> serialization 오류를 **완전히** 검증하지 못한다. 동시성은 실 PG 로 별도 검증한다.

## 3. 오류를 "의도적으로" 찾는 법
정상 경로만 테스트하면 대부분 통과한다. 중요한 건 나머지다.
- **실패 경로**: 세션 없음·권한 없음·CSRF/Origin 위조·없는 ID·이미 처리된 결제·취소된 청구·만료 초대
- **경계값**: 원생 0/29/30/31명 · 금액 0/1/최댓값 · 휴무 하루/전체/기간 경계 겹침
- **순서 변경**: `세션→휴무` vs `휴무→세션` 결과 동일해야 / `결제→환불→승인` vs `결제→환불→연결해제→승인`
- **중복**: 결제 버튼 2연타 · 네트워크 재시도 재전송 · webhook 20회 중복 · 공지 연타
- **동시성**: FREE 29명에 20개 동시 등록(성공 1·402 19·최종 30) · 같은 청구 20개 동시 결제

## 4. 보안 테스트 매트릭스 (멀티테넌트 = 최우선)
테스트 계정: A학원 OWNER/DESK/COACH/GUARDIAN · B학원 OWNER · 플랫폼 PLATFORM_ADMIN.
정상 발급된 요청의 **ID만 바꿔** 우회를 시도한다(메뉴가 안 보이는지가 아니라 API 직접 조작):
```
A학원 OWNER → B학원 원생 ID 조회         (기대: 403/404, DB 미노출)
A학원 COACH → OWNER 전용 수납 API         (기대: 403)
보호자 → 다른 보호자 채팅방 조회          (기대: 404 은닉)
일반 OWNER → console-admin/admin API      (기대: 404 은닉)
PLATFORM_ADMIN → 일반 academy API         (기대: 403 경계 분리)
```
검증: HTTP 상태 + **응답 body 에 실제 데이터가 없는지** + 서버 로그에 PII 없는지 +
감사 로그 기록 + **실패 시 DB 미변경**.

## 5. 출시 전 실사용 시나리오 (Staging)
운영과 동일 스택(Node·PG16·migration·CSRF/CORS·HTTPS·worker·outbox dispatcher),
외부는 sandbox(PG 결제·알림톡·스토리지), **가상 개인정보만**(실 학생 데이터 복사 금지).
1. 원생 전 생명주기(등록→연결→배정→출결→청구→결제→휴원→복귀→퇴원, 역할별 화면 확인)
2. 휴무·일할(등록→견적→철회→복원, 반대 순서도 — 결과 다르면 오류)
3. 결제 중복(2연타·webhook 20회·응답 전 새로고침 — 1건만 기록·ledger 1회·알림 1회)
4. FREE 상한(29명+20 동시 → 성공 1·402 19·최종 30)
5. 개인정보(Network 탭에서 원생·상세·채팅·알림·미납·CSV 응답에 전화·금액 유무 직접 확인)
6. 플랫폼 관리자(일반 OWNER vs PLATFORM_ADMIN console-admin 접근·비허용 Origin·CSRF 없는 mutation)

## 6. 출시 게이트 체크리스트 (필수 — 하나라도 실패 시 중단)
```
[ ] npm ci 성공          [ ] typecheck 성공         [ ] 단위 테스트 성공
[ ] API 통합 테스트 성공  [ ] 실 PostgreSQL 동시성 성공  [ ] DB 제약 테스트 성공
[ ] Playwright E2E 성공   [ ] OpenAPI lint 성공       [ ] lint 성공
[ ] production build 성공 [ ] tenant isolation 성공   [ ] 개인정보 응답 검토 완료
[ ] PG sandbox 결제·취소·환불 성공  [ ] migration·rollback 연습 완료
[ ] staging 탐색 테스트 완료  [ ] 운영 알람·대시보드 준비  [ ] 백업·복구 절차 확인
[ ] 배포 승인
```

## 7. 점진 배포 · 롤백 · 회귀 규율
- **Canary/점진**: 내부 계정 → 테스트 학원 1곳 → 1% → 5% → 20% → 50% → 100%.
  각 단계 관찰: 5xx율·지연·DB 커넥션·deadlock·결제 실패율·중복 청구·outbox backlog·CSRF 거부율·PII 이상 로그.
  악화 시 확대 중단 → 이전 버전 롤백.
- **회귀 테스트**: 버그를 고치면 끝이 아니다. `버그 재현 테스트 작성 → 실패 확인 → 수정 →
  성공 확인 → 전체 테스트 → 리뷰 → staging 재검증`. **버그 자체를 테스트 코드로 남긴다.**
  (예: #49 FREE 상한 경쟁 → `plan-gate.test`, #57 OTP 스텁 → `guardian-otp-gate.test`.)

## 8. 현재 상태 (정직한 격차)
| 갖춰짐 ✅ | 남음 ⬜ (준비물·결정) |
|---|---|
| CI 2 job(verify+e2e)·실 PG 동시성 서비스·`npm run verify`·회귀 테스트 축적 | **branch protection**(CI green 강제) — GitHub 설정 |
| 역할×테넌트 격리 테스트·개인정보 응답 최소·감사 | **Staging 환경**(운영 동일 스택) — 호스팅(NCP) 후 |
| PGlite 통합·domain 불변식·OpenAPI drift 가드 | **Canary·모니터링·알람·롤백 절차** — 배포 파이프라인 |
| | **PG/알림톡/스토리지 sandbox** — 사업자 연동(Gate 3) · **migration rollback 연습** |

> 리뷰 미러(공개 `pacefolio-app`)의 CI 는 **커밋된 깨끗한 main 스냅샷**만 떠야 한다 —
> 작업 폴더 통째 스냅샷은 다른 세션의 미완성 WIP 를 섞어 CI 를 오염시킨다(실측 사례).
