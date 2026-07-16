# 07 · 알림 · 이벤트 카탈로그 (F11 · F13)

코드: `lib/domain/notifications.ts` · `events.ts`. 리뷰#2 P0-3 · 리뷰 P0-3.

## 1. 알림 (F11)
### 카테고리 × 채널
- **카테고리**: 수업일정·출결·결제예정·자동결제결과·환불·코치메시지·학원공지·사진리포트·안전사고·대회·프로모션.
- **채널**: 앱푸시·카카오 알림톡·문자·이메일·인앱.

### 등급 — 필수/선택/홍보는 **절대 섞지 않는다**
| 등급 | 카테고리 | 사용자 제어 |
|---|---|---|
| **REQUIRED** | 안전사고 · 자동결제결과 · 결제예정 · 환불 | **끌 수 없음** |
| OPTIONAL | 일정·출결·코치메시지·공지·사진리포트·대회 | 채널별 on/off |
| PROMOTIONAL | 프로모션 | 기본 off 권장, 명시 동의 |

- `canMute(category)` → REQUIRED면 false. 금액은 채팅·잠금화면 미표시(헌법).
- 안전사고·결제실패를 못 끄게 = "전화를 없앤다" 실패 방지(알림 실패 = 전화 부활).

## 2. 도메인 이벤트 카탈로그 (F13)
봉투: `DomainEventEnvelope`(eventId·eventType·academyId·actor·occurredAt·**idempotencyKey**·correlationId·causationId·payloadVersion).

### 헤드라인 흐름 — 예정 결석 (한 correlationId로 묶임)
| 이벤트 | 생산자 | 소비자 | 효과 |
|---|---|---|---|
| `ATTENDANCE_NOTICE_CREATED` | 학부모 | 원장·코치 | 예정 결석 등록 |
| `OWNER_TASK_CREATED` | 시스템 | 원장 | 할 일 생성(NEEDS_ACTION) |
| `COACH_ROSTER_UPDATED` | 시스템 | 코치 | 명단에 예정 표시 |
| `ACTUAL_ATTENDANCE_RECORDED` | 코치 | 원장·학부모 | 실제 출결 확정 |
| `OWNER_TASK_RESOLVED` | 시스템 | 원장 | 할 일 해결(RESOLVED) |
| `GUARDIAN_NOTIFIED` | 시스템 | 학부모 | 결과 통지 |

> `/stage/live` 데모가 이 흐름을 실제로 시연(한 데이터, 세 뷰).

### 커머스 이벤트
`INVOICE_ISSUED` · `PAYMENT_CAPTURED`(PG webhook 검증 후) · `REFUND_COMPLETED`.

### 규칙
- 모든 이벤트에 `academyId`(격리) + `idempotencyKey`(중복 처리 방지, 리뷰 P0-5).
- **최종 기준데이터는 엔티티에 저장** — 이벤트는 전달 수단이지 데이터모델 대체 아님.
- `causationId`/`correlationId`로 사건 추적(감사·디버깅).
