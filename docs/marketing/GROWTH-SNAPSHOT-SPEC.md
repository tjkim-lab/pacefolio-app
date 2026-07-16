# 성장판(원장) · 관제탑(본사) 스펙 (마케팅 리뷰 A-1·A-14·A-15)

## 구조 원칙 (A-1)
"같은 이벤트가 양쪽을 먹인다" → **원본 사실은 공유하되 조회 모델·권한·집계는 분리**:
```
신뢰할 수 있는 원본 이벤트/엔티티
  ├─ 원장용 tenant 집계 projection  (자기 academy 만)
  └─ 본사용 cross-tenant 집계 projection (기본 = 집계만)
```
본사 대시보드가 원본 개인정보 이벤트를 직접 조회하거나 원장 화면과 같은 API 사용 금지.
개인 단위 drill-down 은 Support View 권한·감사로만.

## Owner 성장판 (월간 + 상시)
카드: 운영 전화 절감(측정/추정 구분) · 자동 안내 처리 · 수납 가시성 · 홍보 유입 · 월간 성장 편지 · 마케팅 액션 제안
- **금액 기본 숨김**(채널 정책 — COPY-CHANNEL-POLICY)
- 측정값 vs 추정값 구분 표시(METRIC-REGISTRY EST-1)
- **소수 표본 억제**: 분모 <5 → 비율 숨기고 "재등록 대상 1명 중 1명" 원자료 표기
- 수치는 재현 가능해야 함(metricId·기간 명시)

## HQ 관제탑
학원별 Health Score · 전체 funnel · 콘텐츠 생성 현황 · 캠페인 캘린더 · 지표 산식·데이터 신뢰도 표시

### AcademyHealthSnapshot (A-15 — 설명 가능해야 함)
```
academyId · period · scoreVersion
activationScore · billingAdoptionScore · attendanceUsageScore
guardianEngagementScore · contentFreshnessScore
riskSignals[] · positiveSignals[] · calculatedAt · dataCompleteness
```
화면엔 단일 점수 대신 **이유 함께**: "최근 21일 원장 로그인 없음 · 미납 안내 자동화 미사용 · 보호자 활성 18%↓"

### Health Score 금지사항
- "학원 품질" 점수 아님 — 도움 필요 신호
- 원장·코치 **개인 성과평가 자동 사용 금지** / 점수만으로 자동 제재·요금변경·계약해지 금지
- 신규 학원·계절성 보정 / 데이터 부족 시 점수 미산출 / 테스트 tenant 제외
- 산식 변경 시 scoreVersion 업 + 전후 비교 불가 표시
