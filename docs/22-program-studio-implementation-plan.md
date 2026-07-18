# 프로그램 스튜디오 — 구현 계획 (PS0)

> 배치 PS0~PS7 · 이번 1차 = PS0→PS1→PS2 (+가능하면 PS3 preview). 상태: 2026-07-19

## 배치 지도

| 배치 | 범위 | 완료 기준 |
|---|---|---|
| **PS0** ✅ | 구조 조사·설계 문서(docs/20·21·22) | 이 문서 3종 |
| **PS1** | 스키마 11테이블 + 도메인 불변식 + CRUD API + OpenAPI + 테스트 | 빈 학원에서 코드 수정 없이 API 로 프로그램→단계→영역→활동→12주 커리큘럼→게시 |
| **PS2** | `/pc/programs` UI(목록·마법사·활동 그리드·커리큘럼 편집·게시) — live API, fixture fallback 금지 | 원장이 PC 로 12주×3활동 구성·게시 |
| PS3 | CSV import staging(batches/rows·정규화·중복후보·preview·commit) | 원더짐형 CSV 안전 반영 |
| PS4 | 반 적용·코치 BS 실행·경험 이벤트 | 수업 완료→경험지도 |
| PS5 | 기술·클리어·뱃지(+outbox·동시성) | 코치 확정→뱃지 1회 발급 |
| PS6 | 보호자 성장보고서 | 보호자 안전 조회 |
| PS7 | 상품화 준비(복제·소유권·설치본) | — |

## PS1 API 목록 (전부 `/academies/:academyId` 하위 · guard+csrf+academyCtx)

```
POST/GET        /programs                  · GET /programs/:programId
PATCH           /programs/:programId       (이름·설명·archive)
POST            /programs/:programId/versions            (새 DRAFT · basedOn 복제)
GET             /programs/:programId/versions
POST            /versions/:versionId/publish
GET             /versions/:versionId                     (레벨·커리큘럼 포함 상세)
POST/PATCH/DELETE /versions/:versionId/levels[/:levelId]
POST/GET/PATCH  /growth-domains[/:domainId]
POST/GET        /activities                · GET /activities/:activityId
PATCH           /activities/:activityId    (개정 정책 적용)
POST            /activities/:activityId/archive
PUT             /activities/:activityId/growth-tags      (현재 개정판 태그 세트 교체)
POST/PATCH/DELETE /versions/:versionId/sections[/:sectionId]
POST/PATCH/DELETE /versions/:versionId/sessions[/:sessionId]
PUT             /sessions/:curriculumSessionId/activities (배치 세트 교체 — 순서 포함)
```

## 화면 IA (PS2)

`/pc/programs`(목록·필터·새로 만들기) → `/pc/programs/[id]`(개요·버전) → `/pc/programs/[id]/curriculum`(3단: 구조|회차 편성|활동 상세) · `/pc/activities`(그리드+사이드패널) · `/pc/growth-domains`. 기존 `_shell` 재사용.

## 마이그레이션

`packages/db/schema.ts` 에 테이블 추가 → `drizzle-kit generate`(0022) — journal·snapshot 자동. 기존 테이블 변경 없음(추가만) → 기존 기능 영향 없음.

## 기존 기능 영향 분석

- 재사용: guard(academyCtx)·audit/outbox·newId·멤버십. 신규 라우트는 app.ts 에 **추가만**(기존 라우트 무변경).
- index.ts 는 건드리지 않음(옆 작업과 충돌 회피). classes/sessions 스키마 무변경 — 반 적용(PS4)에서 FK 로 연결 예정.

## 핵심 모호성 → 문서화된 가정

| 모호성 | 가정(진행) |
|---|---|
| Variant vs Revision 이중 개념 | Revision 으로 통일(docs/21 결정 1) — variant 필드는 revision 속성으로 흡수 |
| MANAGER 프로그램 권한 부여 방식 | PS1 은 OWNER 만 변이. 권한 테이블은 후속(스키마 확장 여지만 확보) |
| growth_domains 글로벌 템플릿 | 테넌트 소유 + seed 복사 방식(docs/21 결정 3) |
| IN_REVIEW 워크플로 | 상태만 존재(전이 DRAFT↔IN_REVIEW 허용) — 편집은 DRAFT 만, 승인 플로는 후속 |
| 게시 시 최소 콘텐츠 검증 | 검증 없이 게시 허용(빈 커리큘럼도) — 경고는 UI 몫 |
