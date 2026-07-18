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

## 대화 구조 (12차 피드백: 소통 탭 우선순위 = 학원방 › 학부모 › 코치 › 업무 확인 대기)
- **학원방** (신규): 두 종류 — ① **공지형 학원방**(학원만 발송, 보호자는 질문 thread 만,
  읽음 추적 — **초기 버전은 여기부터**, 개인정보 리스크 최소) ② 학원 공용방(원장·직원·
  학부모, 학부모간 메시지 허용 = 학원 설정, 전화번호 비노출 + "도담 보호자" 표시 정책,
  신고·차단·관리자 삭제, 참여·퇴장 이력)
- **원장 ↔ 코치**: 1:1 · 전체 코치 단체방 · 반 담당 코치방. 결석/사고/보강 업무 대화는 관련 엔티티(세션·원생) 참조 연결
- **원장 ↔ 학부모**: 1:1(원생 기준 컨텍스트) · 수납/환불/차량/출결 문의 · 코치 대화에 원장 참여/이관.
  결제 대기·기한 초과 명단에서 "대화" 진입 시 관련 청구서 context card 자동 첨부
- **코치 ↔ 학부모**: 기존 구조 유지(반 전체방 + 1:1)

## 메시지 유형·확인 상태 (12차 확정 — 홈 "코치 전달사항"은 일반 채팅이 아님)
- 유형: `NORMAL_CHAT · NOTICE · ACK_REQUIRED · URGENT_ACK_REQUIRED · OPERATIONAL_TASK`
  — 홈 전달사항 기본값 = **ACK_REQUIRED**, 긴급 체크 시 URGENT_ACK_REQUIRED
- 상태: `DRAFT → SENT → DELIVERED → READ → ACKNOWLEDGED → RESOLVED` (+CANCELLED·EXPIRED)
  — **READ(봤다) ≠ ACKNOWLEDGED(확인 버튼) ≠ RESOLVED(처리 결과 보고)**
- 코치 화면: 채팅방 상단 고정 + 홈 할 일 노출, 읽음만으로 사라지지 않음(확인 버튼 필수),
  긴급은 확인 전 반복 알림 + 일정 시간 초과 시 원장에게 미확인 경고
- 원장 화면: "전송됨 → 읽음 → 확인 완료 14:38" 전이 표시, 확인 후 해당 코치 대화방으로.
  결과 보고는 같은 thread 에 처리 완료·내용·시각
- 발송·읽음·확인·처리·수정·취소 전부 AuditLog

## 권한 정책 (초기 버전 확정안 — 리뷰 권고 채택)
> **코치는 담당 원생의 보호자와만 대화할 수 있고, 원장은 학원 내 모든
> 대화의 관리 권한을 가지되 열람·참여 이력이 AuditLog 에 기록된다.**

- 코치 스코프 = ClassAssignment(ACTIVE) 기준 — 배정 종료 시 새 메시지 불가
- 학부모·코치는 원장에게 직접 대화 시작 가능
- 원장 열람·참여 = `chat.owner_viewed` / `chat.owner_joined` 감사 기록 필수
- 퇴사(멤버십 ENDED) 코치: 접근 즉시 차단, **기록은 학원에 보존**(인수인계 철학)
- 금액·건강정보 = ~~채팅 payload 금지~~ → **조건부 허용으로 개정** (12차 통합 피드백,
  2026-07-18 — 회비·부상은 실운영에서 대화가 반드시 필요한 주제):
  - **금액**: 원장·권한 데스크·해당 원생의 결제 보호자만. 자유 텍스트 반복 입력 대신
    **서버 생성 청구서 context card** 로 공유(타 보호자 전달 금지). 잠금화면 알림엔
    금액 숨김(기존 헌법 유지). 열람·전달 AuditLog + 검색·내보내기 권한 제한
  - **건강정보**: 해당 보호자·담당 코치·원장(·안전 담당)만. 관련 원생 지정 +
    건강/부상 category 필수, 전체 학원방 전송 금지, 잠금화면엔 "새 안전 관련
    메시지"로만 표시, 접근 감사 + 보관·삭제 정책. 사고기록과 연결하되 원문 무분별 복제 금지
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
2. P1 설계 확정 — ✅ 완료: domain `chat.ts`(유형·상태머신·민감 카테고리 규칙·dmKey)
3. P1 백엔드 — ✅ **1차 완료 + 13차 C 보강 (2026-07-18)**: migration 0010·0011 +
   API 7종 + 통합 테스트 22종 + 도메인 표 테스트 + DB 교차 테넌트 직접 부정 4종 +
   실 PG 동시 ACK 테스트. 13차 C P0 반영:
   ① BILLING 카드 = **서버 생성만**(클라이언트는 invoiceId 참조 — 위조 불가·canPay 검증)
   ② 방 원생 = 메시지 원생 강제(override 422) ③ HEALTH = 방 보호자 전원
   canViewHealthInfo(전송) + 조회 시점 재인가(철회 시 본문 가림)
   ④ 민감 열람 = 서버 AuditLog(chat.sensitive_message.viewed) · 발송 전체 감사
   ⑤ 발신자 자기 read no-op · DM 생성 onConflict 수렴 · clientMessageId 전송 멱등 ·
   ACK 중복 멱등 + message FOR UPDATE 직렬화 · OpenAPI 7종 등재.
   **정책 명시**: DRAFT 는 클라이언트 로컬 상태(서버 미저장) / 읽음은 receipt 행(readAt)이
   기록 자체이므로 AuditLog 별도 미기록.
   **잔여(P1~P2)**: 코치→원장·원장→보호자 DM 방향 / 단체방(COACH_ALL·CLASS_*·공지형
   발송) / 코치 담당(ClassAssignment) HEALTH 검증 — 출결 배치에서 테이블 신설과 함께 /
   긴급 반복 알림·EXPIRED worker / receipt 요약·pagination / 담당자(assignee) 권한 /
   수정·취소·신고·차단 / 원장 UI 실 API 연결
4. P1 화면: **owner 앱에 소통 탭 신설** — ✅ 구동 목업 완료 (2026-07-17, `apps/web/app/owner/chat/`):
   하단탭 진입(안읽음 뱃지) · 대화 목록(코치 전체/반 담당/1:1 + 학부모 1:1 원생 컨텍스트 +
   코치↔학부모 관리 열람) · 대화방(업무 전달 카드 완료 전이 · 열람→참여/이관 confirm ·
   금액 전송 차단) — 전부 fixture 정본 파생. 실 API 연결은 3번(백엔드) 이후
5. coach/parent 기존 화면을 실 API 로

## 미결(디자인 터미널 협의)
- 호칭 표기 통일: 학부모 화면 "김코치" → "김선재 선생님" 전환 여부(카피 결정)
- ~~owner 소통 탭 목업~~ → 구동 목업으로 대체(clean 표준). 디자인 터미널은 톤·카피 검수만
