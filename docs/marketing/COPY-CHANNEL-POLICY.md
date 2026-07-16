# 카피 · 채널 정책 (마케팅 리뷰 A-16·A-17)

브랜드 문법 원천: `BRAND-GRAMMAR.md` ("품격 있는 호텔 프런트 직원처럼").
코드에 문자열 흩뿌리기 금지 → `packages/copy`(예정) key/catalog 관리.

## Copy key 체계
```
owner.growthReport.ready
guardian.payment.capturePending
coach.roster.empty
common.session.expired
```
metadata: `audience · channel · containsAmount · containsSensitiveData · legalReviewRequired · brandToneVersion`

## 채널별 금액 표시 (A-17 — "금액은 개인정보")
| 채널 | 금액 |
|---|---|
| 잠금화면 push | **금지** |
| SMS/카카오 알림톡 | 기본 금지 |
| 코치 앱 | **금지** |
| 일반 채팅 | 금지 |
| 보호자 결제 상세 | 허용 |
| 원장 수납 상세 | 허용 |
| 성장판 | 집계 또는 제한적 |
| Admin Support View | 마스킹 기본, 사유 승인 후 제한적 |

⚠️ **발송 서버 단계부터 제외** — payload 에 넣고 클라에서 숨기는 방식 금지.

## 브랜드 문법 예외 (A-16 — 정확성 우선 영역)
인증 오류 · 결제 오류 · 법적 동의 · 개인정보 고지 · 안전사고 · 환불 조건 · 세션 만료 · 데이터 삭제
→ 감성 문구로 흐리지 않는다. **원인 · 현재 상태 · 다음 행동** 3요소 필수.

```
✗ 결제가 잠시 쉬어가고 있어요.
✓ 결제가 완료되지 않았어요.
  결제수단을 확인한 뒤 다시 시도해 주세요.
  중복 결제는 발생하지 않았습니다.
```

- empty state 에는 다음 행동 포함
- 접근성 label 과 시각 카피 일치
- 법적 고지·동의 문구는 legalReviewRequired 플래그 → 검토 전 배포 금지
