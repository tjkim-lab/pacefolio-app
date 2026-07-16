# 10. 인증 · 세션 · Route Guard 최소 계약 (R2 P0-10 · R3 P1-7)

API 계약: `api/openapi.yaml` auth 섹션(`/auth/{provider}/start`·`callback`, `/sessions/*`).
화면 목업: `/`(로그인) → `/select`(약관·학원/역할) → 각 앱. 개발 허브 = `/demo`(프로덕션 비활성).

## 흐름
```
로그인 시작(카카오 앵커·네이버·구글·애플)
→ OAuth callback → 세션 발급
→ 신규: 약관·목적별 동의(consentPolicyVersion 기록)
→ 학원/역할 컨텍스트: GET /sessions/me 의 memberships(서버 도출)로 결정
   - 다중 학원 → academy 선택 UI
   - 보호자 & 자녀 미연결 → 자녀 연결 온보딩(docs/05, OTP 검증세션)
→ 보호 route 진입
→ 세션 만료 → 재인증 / 로그아웃·모든 기기 로그아웃
```

## Route Guard 규칙 (서버가 강제 — 클라 선택 신뢰 금지)
| 상태 | 처리 |
|---|---|
| 미인증 | → `/` (로그인) |
| 인증 + 소속 없음 | → 온보딩 또는 초대 대기 |
| 인증 + 다중 학원 | → academy context 선택 |
| 멤버십 SUSPENDED/ENDED | 접근 차단 + **세션·토큰 폐기**(`/sessions/logout-all` 강제) |
| PLATFORM_ADMIN | 일반 앱 진입 금지 — 별도 Admin 인증 경계(MFA, B5 물리분리) |
| `/demo`·`/stage` | 개발·검토 전용 — **프로덕션 빌드에서 비활성**(env guard) |

## 세션 원칙
- 역할·소속·guardianId 는 전부 서버 세션에서 도출(`AuthorizationContext`) — 화면의 "역할 선택"은 다중 컨텍스트 UX일 뿐.
- 멤버십 종료·탈퇴·비밀번호 변경급 이벤트 시 해당 사용자 전체 세션 무효화.
- Admin MFA freshness = 30분(`MFA_FRESHNESS_MINUTES`), Support View 는 별도 단기 세션.

## 시뮬레이션 격리 (R3 P1-6)
- 결제: `parent/_state.tsx` `PG_SIMULATION` — 제출(AUTHORIZED) ≠ 승인(CAPTURED, 시뮬 webhook). 완료 URL 직접 접근 시 성공 단정 금지("결제 상태 다시 확인").
- 프로덕션: simulator 비활성 + 결제준비 API → PG SDK → webhook/재조회 확정 경로로 대체.
