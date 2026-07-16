# 공개 콘텐츠 발행 스펙 (마케팅 리뷰 A-11)

자동 생성 홈페이지·포스트·Q&A 는 **즉시 공개 금지** — 발행 상태머신을 거친다.

## 상태머신
```
DRAFT → REVIEW_REQUIRED → APPROVED → SCHEDULED → PUBLISHED
                                          ↓            ↓
                                     (수정) UPDATED → UNPUBLISHED → ARCHIVED
```

## 발행 Guard (전이 조건)
- 원장 또는 승인된 게시 담당자만 발행 (권한: SEND_ANNOUNCEMENT 계열 + 게시 승인)
- **공개 데이터만** 사용 — 내부정보 모델과 분리(PublicAcademyProfile ≠ Academy)
- 타 학원 데이터 혼입 금지(tenant 검증)
- **미성년자 이름·사진·건강정보 자동 삽입 금지** — 사진은 consent grant 재검증
- 허위 후기·허위 성과 자동 생성 금지
- **금액 비공개 정책 검사**(구조화 데이터 포함 — SEO-AEO-SPEC)
- 게시 전 structured data validation + canonical URL 확인
- 변경·철회 감사 로그 / **학원 폐점·해지 시 자동 비공개**

## 엔티티
`PublicAcademyProfile · PublicProgram · PublicFAQ · GeneratedContent · ContentRevision · Publication · SeoMetadata · StructuredDataDocument`

### GeneratedContent 필수 필드 (재현성·감사)
```
sourceEntityIds[] · generatorVersion · promptTemplateVersion · generatedAt
reviewedBy · reviewedAt · publishedAt · contentHash
```
