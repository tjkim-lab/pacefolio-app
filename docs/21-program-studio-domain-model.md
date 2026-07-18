# 프로그램 스튜디오 — 도메인 모델·ERD (PS0)

> 기존 스키마 관례 그대로: text PK(prefix ID) · academyId 테넌트 축 · `uq(id, academyId)` + 복합 FK 로 교차 테넌트 DB 차단 · createdAt/updatedAt/version · audit+outbox 동일 tx.
> 상태: PS0 확정 · 2026-07-19

## ERD (PS1 범위)

```
programs ─1:N─ program_modes
    │1:N
program_versions ─1:N─ program_levels
    │1:N                      │
curriculum_sections ─1:N─ curriculum_sessions ─1:N─ curriculum_session_activities
    (parent 자기참조)                                        │N:1
activities ─1:N─ activity_revisions ─1:N─ activity_revision_growth_tags ─N:1─ growth_domains
   (currentRevisionId 포인터)                                  (parent 자기참조)
```

PS4+(후속): class_program_assignments · session_plans · session_activity_results · participant_experience_events / PS5: skills · clearance · badge / PS3: import_batches · import_rows.

## 테이블 (PS1)

| 테이블 | prefix | 핵심 | 불변식(제약) |
|---|---|---|---|
| `programs` | prog_ | name·description·targetAgeLabel·ownershipType·visibility·archivedAt | CHECK ownership/visibility 값 · uq(id,academyId) |
| `program_modes` | pmode_ | programId×mode | UNIQUE(programId, mode) · 복합 FK(programId,academyId) |
| `program_versions` | pv_ | versionLabel·status·basedOnVersionId·publishedAt/By | uq(id,academyId) · 복합 FK(programId) · **PUBLISHED 편집 금지는 서비스 불변식** |
| `program_levels` | plv_ | name·code·sortOrder·color (학원이 만드는 단계) | UNIQUE(programVersionId,name) · 복합 FK(version) |
| `growth_domains` | gro_ | parentId·name·category·color·icon·reportVisible·active | uq(id,academyId) · parent 복합 FK(자기참조) |
| `activities` | act_ | status(ACTIVE/ARCHIVED)·currentRevisionId(포인터)·archivedAt | uq(id,academyId) — **이름 없음(이름은 revision 콘텐츠)** |
| `activity_revisions` | arv_ | revisionNumber·name·description·instructions·easy/standard/challenge·coachingPoints·safetyNotes·difficultyLabel·recommendedMinutes 등 | UNIQUE(activityId,revisionNumber) · 복합 FK(activityId) |
| `activity_revision_growth_tags` | argt_ | revisionId×domainId×role(PRIMARY/SECONDARY) | UNIQUE(revisionId,domainId) · 복합 FK 양쪽 |
| `curriculum_sections` | csec_ | sectionType·name·sortOrder·parentSectionId | 복합 FK(version) · parent 자기참조 |
| `curriculum_sessions` | cses_ | name·sequence·theme·objective | 복합 FK(version·section) |
| `curriculum_session_activities` | csa_ | **activityRevisionId** 연결·sortOrder·required·recommendedMinutes | 복합 FK(session·revision) — 이름이 아니라 개정판 ID 로 연결 |

## 핵심 결정 (조정 사항 — 지시서 대비)

1. **ActivityVariant 와 ActivityRevision 통합**: 지시서 §6.3 variants + 수정문 revisions 를 둘 다 만들면 이중 구조. **PS1 = Activity(불변 ID) + ActivityRevision(모든 콘텐츠·개정)** 하나로 통일. 연령·레벨별 "변형"은 (a) 별도 Activity + 관계(후속) 또는 (b) revision 의 difficultyLabel/recommendedAgeLabel 로 표현. 커리큘럼·수업기록은 revisionId 참조 → 이름 변경이 과거를 못 바꿈(수정문 §3 충족).
2. **개정 정책**: 현재 revision 이 PUBLISHED 버전의 커리큘럼에서 참조되면 편집 시 **자동 새 개정판**(revisionNumber+1, currentRevisionId 갱신). 미참조면 제자리 수정. (후속 PS4: 수업 결과 참조도 동일 게이트에 추가.)
3. **growth_domains 는 테넌트 소유**(academyId NOT NULL): "시스템 기본 템플릿"은 글로벌 행이 아니라 **학원 생성 시/요청 시 복사해 넣는 seed** — 테넌트 격리 단순·안전. (플랫폼 템플릿 공유는 상품화 배치에서 ownership 모델로.)
4. **currentRevisionId 는 FK 없는 포인터**(순환 FK 회피) — 정합은 서비스 tx 가 유지, revision 쪽 복합 FK 가 테넌트 방어.
5. **enum 은 시스템 상태만**: program_version_status · program_mode · activity_status · growth_tag_role. 단계명·영역명·활동명은 전부 데이터.
6. **주차·활동 수 제한 없음**: 12주·3개는 UI 기본값 제안일 뿐 DB 제약 아님.

## 서비스 불변식 (도메인 테스트 대상)

- PUBLISHED/ARCHIVED 버전 하위(레벨·커리큘럼) 변이 금지 — DRAFT 만.
- 게시: DRAFT→PUBLISHED (FOR UPDATE 직렬화 · publishedAt/By 기록 · outbox `PROGRAM_VERSION_PUBLISHED`).
- 복제: PUBLISHED(또는 DRAFT)→새 DRAFT (레벨+커리큘럼 딥카피 · revision 참조는 그대로 · basedOnVersionId).
- ARCHIVED activity 신규 배치 금지 — 기존 참조·과거 기록은 유지.
- 같은 revision 에 같은 growthDomain 중복 태그 금지(UNIQUE).
- 모든 리소스 접근 = academyId 경계 (서비스 where + 복합 FK 이중 방어).
- 변이 = OWNER 만(PS1) · 조회 = 학원 멤버.
