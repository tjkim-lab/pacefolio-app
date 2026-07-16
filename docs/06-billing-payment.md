# 06 · 청구 · 결제 · 환불 — 엔진 정합 (F9)

⚠️ **새로 만들지 않는다.** 계산 로직은 이미 존재·검증됨: 루트 `payment-engine/` (**40/40 통과**).
이 문서는 그 엔진과 `lib/domain`(모델·계약)을 **정합**시킨다. 원천 스펙: 루트 `PAYMENT-ENGINE-SPEC.md`.

## 1. 두 계층 — 섞지 않는다
| 계층 | 위치 | 역할 |
|---|---|---|
| **계산 엔진** | `payment-engine/` (순수함수, DB없음) | 금액을 **계산**. 일할·할인·상한·환불 바닥·상호승인 |
| **도메인 모델** | `lib/domain` (entities·state-machines) | 계산 결과를 담는 **기록·계약**(ID·상태·관계) |

> 엔진의 `Line/Invoice`(계산 출력) ≠ 도메인 `Invoice/InvoiceLine`(저장 레코드). **엔진은 계산기, 도메인은 장부.** 엔진 출력이 도메인 엔티티를 채운다.

**리뷰 P0-5 원칙:** 결제·수납·환불 계산은 **서버가 유일 기준**. 프런트는 서버(=엔진) 결과를 **표시·확인만**. `useState·setTimeout·고정금액` 금지.

## 2. 계산 순서 (엔진, 불변) — `PAYMENT-ENGINE-SPEC.md` 참조
```
total_sessions → tuition_prorated(일할) → auto_rate(MAX 하나)
→ final_rate = min(cap, 1−(1−auto)(1−event)) → tuition_final
→ vehicle(일할·무할인) → line_total → invoice_total = Σ
```
- 할인 그룹: `auto`(MAX 하나) → `event`(중첩) → `상한` → `coupon`(상한 밖, 정책). `kind`=percent|amount.
- 형제할인 = 둘째부터(최연장 제외). 차량비 = 별도·무할인·일할만.
- 핵심 API: `computeLine` · `computeInvoice` · `buildInvoice`(가족 등록→청구서) · `refundTuitionFloor` · `validateCustomRefund` · `canApproveRefund`.

## 3. 엔진 → 도메인 매핑
| 엔진 출력 | 도메인 엔티티 |
|---|---|
| `Line.tuitionFinal` | `InvoiceLine{type:TUITION}` |
| `Line.vehicle` | `InvoiceLine{type:VEHICLE}` |
| 할인 절감액 | `InvoiceLine{type:DISCOUNT, amount<0}` |
| `Invoice.total` | `Invoice.total` |
| `computeInvoice.lines` | `Invoice` 1장 + `InvoiceLine[]` (형제 = 원생별 Invoice, 합산 결제는 `Payment`+`PaymentAllocation`) |
| `refundTuitionFloor`+`refundVehicle` | `Refund.amount` (교습비·차량 별도) |
| `canApproveRefund` | `Refund` 상태머신 `→ MUTUALLY_APPROVED` guard (docs/03 §3) |

## 4. 불변식 ↔ 우리 검증
| 엔진 불변식 | 우리 쪽 대응 |
|---|---|
| INV1 `final_rate ≤ cap` | 엔진 40/40 테스트 |
| **INV2** 환불 승인 = 학부모+원장 둘 다 | `Refund` MUTUALLY_APPROVED (docs/03 §3) · `canApproveRefund` |
| INV3 커스텀 환불 ≥ 법정바닥 | `validateCustomRefund` |
| INV4 차량비 무할인 | 엔진 `computeLine` |
| **INV5** `invoice_total = Σ lines` | `lib/fixtures` **`checkConsistency()`** (실행 오류0) |
| INV6 전부 정수(원) | `won()` = Math.round |

## 5. 정합 증명 (실행 확인)
검증된 엔진이 **단일 데이터 소스(`lib/fixtures`)의 청구 금액을 그대로 재현**:
```
하준: computeLine(base 180,000 + 차량 30,000, 24/24)      = 210,000  = fixture ✅
하은: computeLine(base 160,000, 형제 20% auto)            = 128,000  = fixture ✅
→ 엔진 ↔ 단일소스 완전 일치 (형제할인 포함)
```
→ mock 데이터가 실제 계산 규칙과 어긋나지 않음을 보장.

## 6. 서버·안전장치 (리뷰 P0-5, docs/03 §2·§3)
- **멱등키**: 청구확정·대량알림·결제준비/승인·자동결제등록·재시도·환불요청/승인.
- **PG**: 토큰만(카드원문 저장금지)·webhook 서명검증·event ID 중복방지·서버 금액 재검증·**UI성공 ≠ PG CAPTURED**·타임아웃 후 PG 재조회.
- 상태 전이 전부 AuditLog.

## 7. 장기(B 아키텍처)
`payment-engine/`는 monorepo 승격 시 **`packages/domain`(또는 `packages/billing`)** 으로 흡수 — `lib/domain`과 한 패키지에서 계산+모델 공존. 지금은 루트 별도 위치 유지, 계약만 이 문서로 정합.
