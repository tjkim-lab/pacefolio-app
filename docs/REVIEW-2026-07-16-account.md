# 프론트 리뷰 #2 (2026-07-16) — 계정·프로필·설정 (Heja 벤치마크)

Heja(소셜 팀 앱) 계정 화면을 벤치마크한 "내 정보/계정 설정" 기능 갭 분석.
→ 결론: 화면 구조는 좋은 참고지만, PACEFOLIO는 **"소셜 팀 프로필"이 아니라 "역할·권한·자녀연결·개인정보·운영안전" 중심 계정 설정**으로 바꿔야 함.

## 현재 상태 요약
🔴 없음: Bio, 전화/이메일 편집, 개인정보 공개범위, 캘린더 연동, 알림 설정, 언어, 실로그아웃, 학원 나가기, 계정 삭제, 자녀 실연결(OTP).
🟡 부분: 프로필 편집, 학원/팀 전환, 역할 표시, 도움말 진입점, 온보딩 개념, 요금제, 의료/등번호 정보.

## P0 — 꼭 추가 (인증 구현과 함께)
- **P0-1 공통 계정 메뉴** (역할별로 노출 다름): 프로필·연락처·알림·보안·연결된 학원·역할·도움말·로그아웃·계정탈퇴. 코치/학부모/원장/Admin 각각 메뉴 세트 상이. **Admin은 일반 계정과 분리 — MFA·접속기록·보안세션 중심.**
- **P0-2 자녀 추가·연결**: mock 선택 ❌ → 실제 흐름(학원선택/초대코드 → **보호자 폰 OTP** → 학원 등록정보 일치 확인 → 이름·생년 일부 확인 → 관계 선택 → 동의 → 학원 승인/자동연결). 데이터: guardianId·participantId·academyId·relationshipType·verificationMethod/Status·isPrimaryGuardian + 권한플래그(canViewSchedule/Attendance/HealthInfo/ReceivePhotos/Pay/RequestRefund). **이름+생년만으로 연결 금지.**
- **P0-3 알림 설정**: 카테고리(수업/출결/결제/자동결제/환불/코치메시지/공지/사진리포트/안전사고/대회/프로모션) × 채널(푸시/알림톡/문자/이메일/인앱). **필수/선택/홍보 3종 분리** — 안전사고·결제실패는 못 끔.
- **P0-4 연락처·보안**: 이름·사진·폰·이메일·로그인방식·로그인기기·최근로그인·로그아웃·모든기기 로그아웃. 폰/이메일 변경 = **재인증(OTP)** 필수. Admin·원장 **MFA** 권장.
- **P0-5 탈퇴 ≠ 학원 나가기** (서로 다른 기능):
  - *학원 나가기*: 계정 유지, 소속만 종료. 코치는 즉시 X → **요청 → 담당반·미완료 확인 → 인수인계 → 원장 승인 → 권한 회수 → 세션·토큰 만료**. (헌법: "노하우는 학원에 남는다"와 연결)
  - *계정 탈퇴*: 결제·환불·출결·안전사고·감사 기록 **즉시 전삭 금지**. 즉시삭제 가능 프로필 / 법적·운영상 보관 / 익명화 / 복구가능기간 / 학원·자녀 관계 해제 / 자동결제 해지 구분.

## P1 — 파일럿 전
- **학원 전환** (코치=근무학원, 원장=운영학원, 학부모=아이·학원, Admin=조회대상). ⚠️ **테마만 바뀌는 게 아니라 모든 API의 academyId 범위가 함께 전환**돼야 함. 현재/역할/반/미읽음/브랜드/마지막접속 명확히.
- **캘린더 연동**: 초기엔 양방향 X → ICS 구독 URL·Google/Apple 추가 우선. **건강정보·결제금액·상세 결석사유는 외부 캘린더에 넣지 말 것.**
- **역할별 온보딩 체크리스트**: 원장(학원정보·운영시간·반생성·코치초대·원생등록·보호자초대·PG설정·첫청구·알림·사진동의) / 코치 / 학부모(폰인증·자녀연결·필수동의·알림·결제수단·첫일정·긴급연락처). ⚠️ 하단 상시 검은 패널 X → 홈 상단 진행카드 or 설정 "시작 가이드".
- **통합 도움말·문의**: FAQ검색·역할별·1:1문의·내역. 문의 생성 시 컨텍스트 자동첨부(academyId·participantId·invoiceId·paymentId·classSessionId·currentRoute·appVersion). **긴급 안전사고 ≠ 일반 CS 분리.**

## ⛔ 그대로 도입하면 안 되는 것 (Heja와 다른 지점)
- **의료·건강정보를 일반 프로필/Everyone 공개** ❌ → 원생 "안전정보"로 분리(알레르기·약·응급조치·활동제한·긴급연락·의료기관). 접근=보호자·담당코치·대체코치·원장/승인 안전담당만 + 조회기록. 최소수집.
- **SNS식 임의 Everyone 공개** ❌ → 시스템 정책 공개범위(위 `PrivacyVisibility`). 민감정보는 사용자가 전체공개로 못 바꿈. 폰번호는 원문노출보다 **인앱 채팅·중계전화**.
- **코치 앱에 Premium 요금제·구매 복원** ❌ → 플랫폼 요금제=원장PC, 학원구독=원장PC/Admin, 수강료=학부모 결제. **수강료를 인앱결제로 처리 금지**(기존 PG 흐름과 분리).
- **코치 등번호·포지션을 공통 프로필 필드로** ❌ → 원생 등번호=대회등록/팀배정, 포지션=프로그램/선수프로필, 코치=직책·전문종목·권한역할. **별도 배정 엔티티.**

## 권장 백엔드 모델 (요지)
User / UserProfile / UserContact / UserIdentity / UserSession · Organization / Academy / **AcademyMembership** / Role / Permission / ClassAssignment · GuardianParticipantLink / GuardianVerification · NotificationPreference / CalendarSubscription · ConsentPolicy / ConsentRecord / PhotoConsent · AccountDeletionRequest / MembershipExitRequest / AuditLog · OnboardingChecklist / OnboardingStep.
> **핵심: 프로필과 학원 역할을 한 User 테이블에 합치지 말 것** — 여러 학원 소속 처리 불가. `AcademyMembership`(userId×academyId×role×status×joined/ended×invitedBy×approvedBy×permissionOverrides)로 분리.

---
## 반영 트리아지
- 이 리뷰의 P0 모델(계정·멤버십·자녀연결·동의·알림)은 **첫 리뷰 P0-1(도메인 모델)과 같은 뿌리** → `lib/domain`에 함께 수렴. 이미 `ids.ts`·`enums.ts`에 관련 ID·상태 반영 착수.
- **화면(계정 설정 UI)은 디자인 터미널 몫**(시각). 이 세션은 **모델·상태·권한·연결 규칙**(dev).
- 통합 실행 순서는 [ROADMAP.md](./ROADMAP.md) 참조.
