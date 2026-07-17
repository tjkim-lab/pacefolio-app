# 12. 소통(채팅) — 원장·코치·학부모 (R8 제품 피드백, 2026-07-17)

> 발견 경위: 라이브 화면 검수 중 **원장 앱에 양방향 채팅이 없음**을 확인
> (코치 앱엔 /coach/chat 존재, 원장은 공지·재알림만). 공지만으로는 학원
> 운영을 감당할 수 없음 — **정식 핵심 기능으로 로드맵 등재**.
> 상태: 설계 계약 초안. 구현 = 백엔드(대화방·메시지·읽음) + 3개 앱 화면.

## 세 가지를 분리한다
| 종류 | 방향 | 예 |
|---|---|---|
| **공지** | 학원 → 다수, 일방 | 휴원 안내, 수납 안내 (기존 owner 기능) |
| **채팅** | 양방향 대화 | 결석 문의, 상담 |
| **업무 전달** | 후속 조치 필요 | "결석 처리", "보강 등록" — OperationalTask 와 연결 |

## 대화 구조
- **원장 ↔ 코치**: 1:1 · 전체 코치 단체방 · 반 담당 코치방. 결석/사고/보강 업무 대화는 관련 엔티티(세션·원생) 참조 연결
- **원장 ↔ 학부모**: 1:1(원생 기준 컨텍스트) · 수납/환불/차량/출결 문의 · 코치 대화에 원장 참여/이관
- **코치 ↔ 학부모**: 기존 구조 유지(반 전체방 + 1:1)

## 권한 정책 (초기 버전 확정안 — 리뷰 권고 채택)
> **코치는 담당 원생의 보호자와만 대화할 수 있고, 원장은 학원 내 모든
> 대화의 관리 권한을 가지되 열람·참여 이력이 AuditLog 에 기록된다.**

- 코치 스코프 = ClassAssignment(ACTIVE) 기준 — 배정 종료 시 새 메시지 불가
- 학부모·코치는 원장에게 직접 대화 시작 가능
- 원장 열람·참여 = `chat.owner_viewed` / `chat.owner_joined` 감사 기록 필수
- 퇴사(멤버십 ENDED) 코치: 접근 즉시 차단, **기록은 학원에 보존**(인수인계 철학)
- 금액·건강정보 = 채팅 payload 금지(헌법 — 서버 발송 단계부터 제외)
- 사진 전송 = PhotoAsset 동의 게이트(canSendPhotoAsset) 경유
- 메시지 수정·삭제·신고 → AuditLog + 원문 보존(운영 분쟁 대응)

## 데이터 모델 초안 (packages/domain 확장 대상)
```
ChatRoom        id · academyId · type(OWNER_COACH_DM|COACH_ALL|CLASS_COACHES|
                GUARDIAAN_DM|CLASS_GUARDIANS) · relatedClassId? · relatedParticipantId?
ChatParticipant roomId · userId · role · joinedAt · leftAt? · lastReadAt
ChatMessage     id · roomId · senderUserId · body · attachments?(PhotoAsset 참조)
                · createdAt · editedAt? · deletedAt?(soft — 원문 보존)
```
테넌트: 전부 academyId + 복합 FK. 읽음 = lastReadAt 방식(메시지별 아님, 초기 단순화).

## 구현 순서 제안
1. P0(데이터 정합) — ✅ 완료: 임시 이름 제거·이름/호칭 분리·정합성 자동 테스트
2. P1 설계 확정: 이 문서 검토 → domain 엔티티·state 추가
3. P1 백엔드: chat 테이블(migration) + API(방 생성·메시지·읽음) + 권한 guard
4. P1 화면: **owner 앱에 소통 탭 신설**(← 목업 필요, 디자인 터미널 협업) + coach/parent 기존 화면을 실 API 로

## 미결(디자인 터미널 협의)
- 호칭 표기 통일: 학부모 화면 "김코치" → "김선재 선생님" 전환 여부(카피 결정)
- owner 소통 탭 목업(warm/clean 표준)
