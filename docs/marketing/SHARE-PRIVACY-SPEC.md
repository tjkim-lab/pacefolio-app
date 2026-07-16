# 포트폴리오 공유 개인정보 스펙 (마케팅 리뷰 A-12·A-13)

가장 강력한 바이럴 자산 = 가장 큰 개인정보 위험. **공유 버튼 = 공개 URL 생성이 아니다.**
사진 동의 계약(`consent.ts` grant)과 반드시 결합.

## PortfolioShare 엔티티
```
id · academyId · participantId · createdByGuardianId · consentRecordIds[]
audience · accessMode · tokenHash · expiresAt · revokedAt
allowDownload · allowIndexing(기본 false) · createdAt
```

## 생성 필수 조건 (서버 검증)
1. 해당 participant 의 **검증된(VERIFIED) 보호자**만 생성 (`canGuardianReceivePhoto` + 링크 결합)
2. 목적×대상 **consent grant 재검증** (asset 별 — 촬영 동의 ≠ 게시 동의)
3. **다른 원생** 얼굴·이름·음성 제거 또는 그 원생 보호자 추가 동의
4. 결제금액·출결 상세·건강정보·연락처 **자동 제거**
5. 만료일 필수, 언제든 철회 가능, 링크 회전(rotate) 지원, 열람 로그

## 공개 범위 (기본 = 최소)
| accessMode | 의미 |
|---|---|
| `PRIVATE_LINK` | 링크 보유자만(로그인 불필요) — **기본값**, 검색 비색인 |
| `AUTHENTICATED_FAMILY` | 인증된 연결 보호자만 |
| `PUBLIC` | 별도 홍보 동의(grant: ACADEMY_PROMOTION/SNS_POST × PUBLIC)가 있을 때만 |

## OG 이미지 (A-12 주의)
- 메신저 OG crawler 는 쿠키 없이 이미지를 가져감 → **보호된 원본 URL 을 og:image 에 금지**
- 공유 전용 **파생 이미지**: 최소 정보 · 타 원생 제거 · 금액/건강/출결 제거 · 필요 시 이름 마스킹 · consent+share 상태 기반 서버 생성
- 철회 시 OG asset 비활성화. 단 **외부 메신저 캐시·이미 저장된 캡처까지 삭제된다고 보장하지 않는다** — UI 에 안내

## 박수 루프 분리 (A-13)
`수업완료 저장(domain) → 박수 알림 생성 → 열람 → 박수 반응 → 공유카드 생성 → 외부 열람` 은 서로 다른 이벤트 — 하나의 CLAP 으로 합치지 않음.
잠금화면·채팅 payload 금지: 금액·건강정보·상세 결석사유·타 원생 이름·전화번호·미동의 사진. **채널 발송 서버 단계부터 제외**(클라 숨김 방식 금지).
