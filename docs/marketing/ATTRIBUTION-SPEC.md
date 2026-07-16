# 유입 귀속 스펙 (마케팅 리뷰 A-8)

타입 계약: `packages/event-contracts/attribution.ts` (`AttributionTouch`, `sanitizeUtm`).

## 귀속 모델 — v1
- **first touch**: 익명 세션 최초 유입 (anonymousId 기준)
- **last non-direct touch**: 전환 직전 비직접 유입
- **conversion touch**: 전환 시점 유입
- **window**: 30일 (`ATTRIBUTION_WINDOW_DAYS`) — 초과 시 direct 처리
- **anonymous → authenticated 결합**: 로그인 성공 시 **서버가** anonymousId↔userId 결합(클라 전송 금지). cross-device 는 v1 미연결 — "미연결"로 집계(무리한 stitching 금지)
- **중복 전환 제거**: 전환 이벤트는 서버 정본(waitlist_submitted 등) `eventId` 기준 1회

## Campaign taxonomy
`source`(naver/google/kakao/instagram/referral/direct) × `medium`(cpc/organic/social/share/crm) × `campaign`(kebab-case, 승인된 명명). 신규 campaign 은 이 문서에 등록 후 사용.

## UTM 보안 규칙 (코드 강제 — sanitizeUtm)
- allowlist: `source, medium, campaign, content, term` 외 폐기
- 길이 ≤100 · CR/LF 제거 · **전화/이메일 패턴 값 거부(PII_SUSPECTED)**
- 전체 URL 저장 금지 → 정규화된 landing path 만
- URL/UTM 에 participantId·guardianId·전화번호 등 개인정보 삽입 금지 — 위반 링크는 발급 단계에서 차단
- Admin 에서 raw UTM 표시 시 HTML escape (표시 계층 의무)
- 광고 click ID(gclid 등)는 `clickIdEncrypted` 별도 보호·별도 보관기간

## 동의 경계 (A-9)
- 수집 목적 분리: `MARKETING_ATTRIBUTION` 동의 시에만 touch 저장(ESSENTIAL 아님)
- `EXTERNAL_AD_PLATFORM` 전송은 별도 opt-in + **법률 검토 선행**(개보위 온라인 행동정보 제재 사례)
- 동의 철회 → 신규 수집 즉시 중단, 기존 데이터 처리 정책은 개인정보 방침 따름
