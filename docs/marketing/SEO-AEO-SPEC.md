# SEO/AEO 스펙 (마케팅 리뷰 A-10 — 표현 정정 반영)

원칙: **people-first 콘텐츠 우선.** AI 전용 문장 구조·파일보다 고유하고 유용한 정보 + 명확한 기술 구조.

## 유지 (기본 계약)
학원명·위치·종목·연령 일관 표기 · crawl 가능한 공개 페이지 · canonical URL · sitemap · semantic HTML · JSON-LD · Search Console 연동 · 실사용자용 Q&A · 고유한 현장 정보(수업 철학·연령별 준비물·시설 안전) · 콘텐츠 검수자·갱신일 표기 · 검색/생성형 AI 유입 측정

## 정정 (기대 수준 수정 — 과장 금지)
| 항목 | 정정된 표현 |
|---|---|
| **FAQPage** | Google FAQ 리치 결과는 **2026-05 종료** → "리치 결과 기대하지 않음". Q&A 는 사용자용 콘텐츠로 유효, 필요 시 schema.org 어휘만 사용 |
| **llms.txt** | 🧪 **선택 실험** — 커뮤니티 제안일 뿐 표준 아님. Google 은 생성형 검색에 불필요·미사용 명시. 검색순위·AI 인용 효과 약속 금지, robots/sitemap/canonical 대체 아님, 공개 가능 정보만 |
| **Course** | Google Course list 는 영어 중심 + 조건(실교육과정·학습결과·roster·최소 3개·고유 URL). 한국어 유소년 학원에서 리치 결과 효과 단정 금지 — schema.org 의미 표현으로만 사용 |
| **LocalBusiness** | 스포츠 시설 → `SportsActivityLocation` 등 적합 하위 타입 검토 |

## 공개 모델 최소 항목
`academyPublicName · canonicalUrl · publicAddress · geo · 공개 문의채널 · openingHours · sportsOrActivityTypes · ageRanges · publicPrograms · publicImages(동의 검증) · sameAs · lastVerifiedAt`

## 금지
- **가격 비공개 정책**(금액은 개인정보 철학): `priceRange`·`Offer.price` 생략. **구조화 데이터에만 몰래 넣는 것도 금지**
- 공개 구조화 데이터에 미성년자 개인정보 금지
- "AI 가 인용하기 좋은 문장 자동생성"을 노출 보장처럼 표현 금지
- AI 대량생성 콘텐츠 자동 공개 금지(PUBLIC-CONTENT-SPEC 검수 필수)
