# docs/marketing — 마케팅 내장 설계 계약 (마케팅 리뷰 부록 A)

> 원칙: **측정·바이럴·공개 콘텐츠·브랜드 목소리는 처음부터 설계하되, 개인정보와 서비스 정본을
> 분석 도구에 넘기지 않는다. 하나의 사실을 공유하되, 목적·권한·보관기간에 따라
> 이벤트와 조회 모델을 분리한다.** (A-22)

| 문서 | 내용 | 타입 계약 |
|---|---|---|
| [EVENT-CATALOG](./EVENT-CATALOG.md) | 이벤트 등록부(신뢰수준·동의·보관) | `packages/event-contracts` |
| [METRIC-REGISTRY](./METRIC-REGISTRY.md) | 북극성 분자/분모·추정치 규칙 | — |
| [ATTRIBUTION-SPEC](./ATTRIBUTION-SPEC.md) | 귀속 모델·UTM 보안 | `attribution.ts` |
| [SHARE-PRIVACY-SPEC](./SHARE-PRIVACY-SPEC.md) | 포트폴리오 공유·OG·박수루프 | `consent.ts`(domain) |
| [PUBLIC-CONTENT-SPEC](./PUBLIC-CONTENT-SPEC.md) | 자동생성 콘텐츠 발행 상태머신 | — |
| [SEO-AEO-SPEC](./SEO-AEO-SPEC.md) | 표현 정정(FAQ리치결과·llms.txt·Course) | — |
| [GROWTH-SNAPSHOT-SPEC](./GROWTH-SNAPSHOT-SPEC.md) | 성장판·관제탑·HealthScore | — |
| [COPY-CHANNEL-POLICY](./COPY-CHANNEL-POLICY.md) | 카피 key·채널별 금액 정책 | `packages/copy`(예정) |

이벤트 4종 분리(A-2): Domain=`@pacefolio/domain` / Analytics·Attribution·Audit=`@pacefolio/event-contracts`.
PII 금지·UTM·이름 규칙은 **CI 테스트로 강제**(`packages/event-contracts/test`).
목업 확정 후(P2): 수집 SDK·warehouse·대시보드 백엔드·자동 콘텐츠 파이프라인.
