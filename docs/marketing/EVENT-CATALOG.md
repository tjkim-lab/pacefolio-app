# 이벤트 카탈로그 (마케팅 리뷰 A-2·A-4·A-5)

타입 계약: `packages/event-contracts` (Domain 이벤트는 `@pacefolio/domain` — 절대 혼합 금지).
이벤트 추가 시 이 카탈로그에 행 추가 + `EVENT_TRUST` 맵 갱신이 세트.

## 등록 항목 스키마 (A-5 필수 항목)
`eventName · eventVersion · 설명 · 발생 시점 · 발생 주체 · client/server · 필수 속성 · 선택 속성 · 금지 속성(PII 가드 공통) · 중복 처리 기준 · 보관기간 · 필요 동의 · 사용 대시보드 · 담당`

## 초기 카탈로그
| eventName | v | 신뢰 | 발생 | 필요 동의 | 보관 | 사용처 |
|---|---|---|---|---|---|---|
| `landing_visited` | 1 | client | 랜딩 페이지뷰 | ESSENTIAL† | 14개월 | 유입 퍼널 |
| `demo_started` | 1 | client | 데모 진입 | PRODUCT_ANALYTICS | 14개월 | 유입 퍼널 |
| `waitlist_form_clicked` | 1 | client | 폼 버튼 클릭(제출 아님) | PRODUCT_ANALYTICS | 6개월 | 퍼널 진단 |
| `waitlist_submitted` | 1 | **server** | 서버 접수 완료 | ESSENTIAL | 24개월 | 전환(정본) |
| `signup_completed` | 1 | **server** | 가입 완료 | ESSENTIAL | 계정과 동일 | 전환 |
| `academy_registered` | 1 | **server** | 학원 등록 완료 | ESSENTIAL | 계정과 동일 | 전환·관제 |
| `autopay_registered` | 1 | **pg** | PG 정기결제 등록 성공 | ESSENTIAL | 법정(결제) | **북극성** |
| `payment_captured` | 1 | **pg** | 파생 복사본 — 정본은 domain `PAYMENT_CAPTURED` | ESSENTIAL | 법정(결제) | 수납 지표 |
| `growth_report_viewed` | 1 | client | 원장 성장판 조회 | PRODUCT_ANALYTICS | 6개월 | 성장판 사용률 |
| `collection_dashboard_action` | 1 | **server** | 수납 유효행동(미납필터·리마인드·내보내기) | ESSENTIAL | 12개월 | 수납 가시성 사용률 |
| `portfolio_share_requested` | 1 | client | OS 공유창 열림(완료 아님) | PRODUCT_ANALYTICS | 6개월 | 공유 루프 |
| `portfolio_share_link_created` | 1 | **server** | 공유 링크 생성 | ESSENTIAL | 링크 수명+90일 | 공유 루프 |
| `portfolio_share_link_opened` | 1 | **server** | 링크 열람(edge) | ESSENTIAL† | 6개월 | 공유 루프 |
| `portfolio_share_conversion_completed` | 1 | **server** | 공유발 문의 접수 | ESSENTIAL | 24개월 | 바이럴 전환 |

† 비로그인 방문자: 동의 확정 전 = 익명·최소 수집(anonymousSessionId 만). consent 확정 전 마케팅 SDK 실행 금지(A-9).

## 공통 규칙
- 이름: snake_case, 동적 값(ID·이름·학원명) 금지 — `isValidEventName` 강제
- `occurredAt`(발생) ≠ `observedAt`(수집) 분리 저장
- 중복: `eventId` 기준 dedupe, 클라 재전송 허용(수집단 idempotent)
- 금지 속성: `pii-guard.ts` `FORBIDDEN_PROPERTY_KEYS` — **CI 테스트로 강제**
- client 이벤트는 참고 지표 — 전환·확정 집계는 server/pg 이벤트만
