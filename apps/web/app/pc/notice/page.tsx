"use client";

/* 공지 · 소통 — 알림톡+푸시 발송·도달·열람 추적 / 코치 전달 / 배너 / Q&A
   목업 pacefolio-owner-pc.html data-pane="notice" 충실 이식 */

import { useEffect, useRef, useState } from "react";
import { PCShell } from "../_shell";
import { useOverlays, Panel, Note, ActBtn, FilterChip, DChip, Spinner } from "../_ui";
import { Button } from "@/components/ui";
import { NT_CHIPS, COACH_CHIPS, BANNERS_INIT, QA_MGR, QA_CATS, type QaItem } from "../_data";
import { IconChat, IconBell, IconSpark } from "@/components/ui/icons";
import { OwnerLiveProvider, useOwnerLive } from "../_live";

type Banner = { title: string; sub: string; pill: string; tone: "accent" | "warn" };

const inputCls =
  "w-full border border-line rounded-xl bg-fill px-3 py-2.5 text-[13px] text-ink focus:outline-none focus:border-accent focus:bg-surface";

function Tile({ icon, hot }: { icon: React.ReactNode; hot?: boolean }) {
  return (
    <div
      className={`w-[34px] h-[34px] rounded-[10px] grid place-items-center shrink-0 ${
        hot ? "bg-danger-weak text-danger-ink" : "bg-fill text-ink2"
      }`}
    >
      {icon}
    </div>
  );
}

function Row({
  icon,
  title,
  sub,
  trailing,
  hot,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  sub?: React.ReactNode;
  trailing?: React.ReactNode;
  hot?: boolean;
}) {
  return (
    <div className="flex gap-2.5 items-center py-2.5 border-b border-line2 last:border-0">
      <Tile icon={icon} hot={hot} />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-ink truncate">{title}</div>
        {sub && <div className="text-[11px] text-ink3 font-medium mt-0.5">{sub}</div>}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}

export default function PCNotice() {
  return (
    <OwnerLiveProvider>
      <PCNoticeBody />
    </OwnerLiveProvider>
  );
}

function PCNoticeBody() {
  const { confirm, toast, overlays } = useOverlays();
  const live = useOwnerLive(); // #25: READY 시 발송·읽음 추적이 실 API

  /* 공지 보내기 */
  const [ntTitle, setNtTitle] = useState("");
  const [ntBody, setNtBody] = useState(
    "11월 첫째 주 화요일은 시설 점검으로 휴무예요. 해당 회차는 반별 회차 계산에 자동 반영됩니다.",
  );
  const [audIdx, setAudIdx] = useState(0);
  const aud = NT_CHIPS[audIdx];
  const [sent, setSent] = useState(false);
  const [sentInfo, setSentInfo] = useState<{ title: string; p: number } | null>(null);
  const [read, setRead] = useState(0);
  const tickRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearInterval(tickRef.current), []);

  function sendNotice() {
    if (sent) return;
    if (!ntTitle.trim()) {
      toast("공지 제목을 입력해 주세요");
      return;
    }
    if (!ntBody.trim()) {
      toast("공지 내용을 입력해 주세요");
      return;
    }
    confirm({
      title: "공지를 발송할까요?",
      /* 세션 리뷰: READY 에선 fixture 인원수를 실제 대상처럼 보이지 않게 — 산정은 서버 */
      rows: live.state === "READY"
        ? [
            ["제목", ntTitle.trim()],
            ["대상", `${aud.label} 보호자 — 수신자 수는 서버가 산정해요`],
            ["채널", "알림톡 + 앱 푸시"],
          ]
        : [
            ["제목", ntTitle.trim()],
            ["대상 원생", `${aud.n}명`],
            ["알림 수신 보호자", `${aud.p}명`],
            ["채널", "알림톡 + 앱 푸시"],
          ],
      label: "발송",
      onConfirm: () => {
        /* #25: 실연결 시 서버 발행 — 수신자 수·미열람은 서버 진실 */
        if (live.state === "READY") {
          void (async () => {
            const title = ntTitle.trim();
            const r = await live.publish({ title, body: ntBody.trim(), audience: aud.label });
            if (!r.ok) { toast(r.message); return; }
            /* 세션 리뷰: sent 영구 차단 금지 — 발송 후 폼 리셋으로 연속 발송 허용 */
            setSentInfo({ title, p: r.recipients });
            setNtTitle("");
            toast(r.message);
          })();
          return;
        }
        setSent(true);
        setSentInfo({ title: ntTitle.trim(), p: aud.p });
        setRead(0);
        toast(`원생 ${aud.n}명의 보호자 ${aud.p}명에게 발송`);
        const cap = Math.round(aud.p * 0.4);
        window.clearInterval(tickRef.current);
        tickRef.current = window.setInterval(() => {
          setRead((r) => {
            const next = Math.min(r + 3, cap);
            if (next >= cap) window.clearInterval(tickRef.current);
            return next;
          });
        }, 800);
      },
    });
  }

  /* 코치 전달사항 */
  const [coachIdx, setCoachIdx] = useState(0);
  /* #31: READY 시 코치 목록 = 서버 멤버(ACTIVE COACH) — fixture 칩은 데모 전용 */
  const liveCoaches = live.state === "READY" ? live.coaches : [];
  const coachChips = liveCoaches.length > 0
    ? liveCoaches.map((c) => `${c.name} 코치`)
    : COACH_CHIPS;
  const coachName = coachChips[coachIdx]?.replace(" 코치", "") ?? "";
  const [coachMsg, setCoachMsg] = useState("도담이 오늘 컨디션 확인해주세요 — 어제 병원 다녀왔대요");
  const [coachSent, setCoachSent] = useState(false);
  const [coachBusy, setCoachBusy] = useState(false);
  const [directive, setDirective] = useState<import("../_live").CoachDirective | null>(null);

  function sendCoach() {
    if (coachSent) return;
    if (!coachMsg.trim()) {
      toast("전달할 내용을 적어주세요");
      return;
    }
    /* #31: READY = 실 전송(DM 개설 → ACK_REQUIRED) — setTimeout 가짜 전송은 데모 전용 */
    if (live.state === "READY") {
      const target = liveCoaches[coachIdx];
      if (!target) { toast("재직 코치가 없어요 — 초대·수락 후 전달할 수 있어요"); return; }
      setCoachBusy(true);
      void (async () => {
        const r = await live.sendCoachDirective(target.userId, coachMsg.trim(), false);
        setCoachBusy(false);
        if (!r.ok) { toast(r.message); return; }
        setCoachSent(true);
        setDirective(r.directive ?? null);
        toast(r.message);
      })();
      return;
    }
    setCoachBusy(true);
    window.setTimeout(() => {
      setCoachBusy(false);
      setCoachSent(true);
      toast(`${coachName} 코치에게 전달됐어요`);
    }, 700);
  }

  /* 서버 상태 재조회 — READ/ACKNOWLEDGED 는 코치의 실제 행동으로만 바뀐다 */
  async function refreshDirectiveStatus() {
    if (!directive) return;
    const next = await live.refreshDirective(directive).catch(() => directive);
    setDirective(next);
    toast(next.status === "ACKNOWLEDGED" ? "코치가 확인했어요 ✓" : `현재 상태: ${next.status}`);
  }

  /* 배너 */
  const [banners, setBanners] = useState<Banner[]>([]);
  function newBanner() {
    confirm({
      title: "새 배너를 게시할까요?",
      rows: [
        ["제목", "신규 반 모집 — 플레이2 금토반"],
        ["노출 기간", "12/1 ~ 12/31"],
        ["대상", "전체 · 7~9세"],
        ["버튼", "체험 신청하기"],
        ["게시 위치", "학부모 앱 홈 캐러셀 (학원 배너)"],
      ],
      warn: "학원 배너로 게시돼요 — PACEFOLIO 본사 콘텐츠와 출처가 구분 표시됩니다.",
      label: "게시 예약",
      onConfirm: () => {
        setBanners((b) => [
          ...b,
          {
            title: "신규 반 모집 — 플레이2 금토반",
            sub: "노출 12/1~12/31 · 대상 전체 · 버튼: 체험 신청하기",
            pill: "게시 예약",
            tone: "warn",
          },
        ]);
        toast("배너 게시 예약 — 12/1부터 학부모 앱 노출");
      },
    });
  }

  /* Q&A */
  const [qa, setQa] = useState<QaItem[]>(() => QA_MGR.map((x) => ({ ...x })));
  function togglePub(i: number) {
    setQa((list) => list.map((it, idx) => (idx === i ? { ...it, pub: !it.pub } : it)));
    toast(qa[i].pub ? "학부모 앱에서 숨김" : "학부모 앱에 공개");
  }
  function editQa(i: number) {
    const it = qa[i];
    confirm({
      title: "Q&A 수정",
      sub: "여기 등록한 Q&A가 학부모 앱 홈의 '원더짐 Q&A'에 노출돼요.",
      rows: [
        ["질문", it.q],
        ["카테고리", it.cat],
        ["대상", it.tgt],
      ],
      memo: "새 답변 (선택) — 비우면 유지",
      label: "저장",
      onConfirm: (memo) => {
        if (memo) setQa((list) => list.map((x, idx) => (idx === i ? { ...x, a: memo } : x)));
        toast("Q&A 수정(데모) — 학부모 앱에 반영");
      },
    });
  }
  function newQa() {
    confirm({
      title: "새 Q&A 등록",
      sub: "질문을 입력하면 학부모 앱 홈에 노출돼요. (데모 — 답변·카테고리는 이후 수정)",
      memo: "질문 입력",
      label: "등록",
      onConfirm: (memo) => {
        setQa((list) => [
          ...list,
          { q: memo || "새 질문", a: "답변 준비 중", cat: QA_CATS[QA_CATS.length - 1], tgt: "원더짐 아카데미 전체", pub: true },
        ]);
        toast("Q&A 등록 — 학부모 앱 홈에 노출");
      },
    });
  }

  return (
    <PCShell
      title="공지 · 소통"
      actions={<span className="text-[12px] font-semibold text-ink3">알림톡 + 앱 푸시 동시</span>}
    >
      <p className="text-[12.5px] text-ink3 font-medium -mt-2">발송 → 도달 → 열람 추적 · 안 읽은 보호자에게만 재발송</p>

      {/* 공지 보내기 + 최근 공지 */}
      <div className="grid grid-cols-2 gap-4 items-start">
        {/* LEFT — 공지 보내기 */}
        <Panel title="공지 보내기" hnote="제목·내용은 필수예요">
          <input
            className={inputCls}
            placeholder="제목 — 예: 11월 휴무 안내"
            value={ntTitle}
            onChange={(e) => setNtTitle(e.target.value)}
          />
          <textarea
            className={`${inputCls} h-[88px] resize-none mt-2`}
            placeholder="내용을 적어주세요"
            value={ntBody}
            onChange={(e) => setNtBody(e.target.value)}
          />
          <div className="flex gap-2 flex-wrap mt-2.5">
            {NT_CHIPS.map((c, i) => (
              <DChip key={c.label} active={audIdx === i} title={c.label} sub={c.sub} onClick={() => setAudIdx(i)} />
            ))}
          </div>
          <div className="text-[11.5px] text-ink3 font-medium mt-2">
            대상 원생 {aud.n}명 · 알림 수신 보호자 {aud.p}명
          </div>
          <Button variant="primary" full className="mt-3" onClick={sendNotice}>
            {live.state === "READY"
              ? `${aud.label} 보호자에게 보내기`
              : sent ? "발송 완료 ✓ · 도달 추적 중" : `원생 ${aud.n}명의 보호자에게 보내기`}
          </Button>
          {sentInfo && (
            <div className="mt-2.5 bg-accent-weak text-brand rounded-xl px-3.5 py-2.5 text-[12px] font-semibold leading-relaxed">
              {live.state === "READY"
                ? <>✓ 발송 완료 · 수신 보호자 {sentInfo.p}명 · 읽음 추적은 오른쪽 목록(서버 기준)</>
                : <>✓ 발송 완료 · 도달 {sentInfo.p}/{sentInfo.p} · 읽음 {read}/{sentInfo.p}</>}
            </div>
          )}
        </Panel>

        {/* RIGHT — 최근 공지 + 코치 전달 */}
        <Panel
          title={live.state === "READY" ? "최근 공지 · 읽음 추적 (실 데이터)" : "최근 공지 · 읽음 추적"}
          hnote="안 읽은 보호자에게만 재발송"
          hnoteAccent
        >
          {live.state === "READY" ? (
            <>
              {live.notices.length === 0 && (
                <div className="text-[12px] text-ink3 font-medium py-2">아직 발행한 공지가 없어요 — 왼쪽에서 첫 공지를 보내보세요.</div>
              )}
              {live.notices.map((n) => (
                <Row
                  key={n.noticeId}
                  icon={<IconBell size={18} />}
                  title={n.title}
                  sub={`수신 ${n.recipients ?? 0}명 · 읽음 ${(n.recipients ?? 0) - (n.unread ?? 0)}/${n.recipients ?? 0}${(n.unread ?? 0) > 0 ? ` · 미열람 ${n.unread}명` : ""}`}
                  trailing={
                    (n.unread ?? 0) > 0
                      ? <span className="text-[10.5px] font-bold text-warn-ink bg-warn-weak rounded-full px-2 py-0.5">미열람 {n.unread}</span>
                      : <span className="text-[10.5px] font-bold text-brand bg-accent-weak rounded-full px-2 py-0.5">전원 읽음</span>
                  }
                />
              ))}
              <div className="mt-1.5">
                <ActBtn soft onClick={() => { void live.refreshNotices().then(() => toast("읽음 현황 갱신")); }}>
                  읽음 현황 새로고침
                </ActBtn>
              </div>
            </>
          ) : (
            <>
              {sentInfo && (
                <Row
                  icon={<IconBell size={18} />}
                  title={sentInfo.title}
                  sub={`방금 · 도달 ${sentInfo.p}/${sentInfo.p} · 읽음 ${read}/${sentInfo.p}`}
                  trailing={<span className="text-[10.5px] font-bold text-brand bg-accent-weak rounded-full px-2 py-0.5">방금</span>}
                />
              )}
              <Row
                icon={<IconBell size={18} />}
                title="가을 대회 참가 안내"
                sub="어제 · 읽음 81/87 · 미열람 보호자 6명"
                trailing={
                  <ActBtn soft onClick={() => toast("안 읽은 보호자 6명에게 재알림(데모)")}>
                    안 읽은 6명
                  </ActBtn>
                }
              />
              <Row
                icon={<IconBell size={18} />}
                title="10월 휴무일 안내"
                sub="지난주 · 읽음 84/87"
                trailing={
                  <ActBtn soft onClick={() => toast("공지 상세 보기(데모)")}>
                    보기
                  </ActBtn>
                }
              />
            </>
          )}

          {/* 코치 전달사항 */}
          <div className="bg-fill rounded-xl p-3.5 mt-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h4 className="text-[13px] font-bold text-ink2">코치에게 전달사항</h4>
              <span className="text-[11px] text-ink3 font-medium">수업 전 코치 앱에 떠요</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {coachChips.map((c, i) => (
                <FilterChip key={c} active={coachIdx === i} onClick={() => setCoachIdx(i)}>
                  {c}
                </FilterChip>
              ))}
            </div>
            <textarea
              className={`${inputCls} h-[56px] resize-none mt-2.5`}
              placeholder="예: 도담이 컨디션 확인해주세요"
              value={coachMsg}
              disabled={coachSent}
              onChange={(e) => setCoachMsg(e.target.value)}
            />
            <Button variant="primary" full className="mt-2.5 h-11" onClick={sendCoach} disabled={coachBusy}>
              {coachBusy ? (
                <>
                  <Spinner />
                  전송 중...
                </>
              ) : coachSent ? (
                "전송됨 ✓"
              ) : (
                `${coachName} 코치에게 전송`
              )}
            </Button>
            {coachSent && directive && (
              <div className="mt-2.5 bg-accent-weak text-brand rounded-xl px-3.5 py-2.5 text-[12px] font-semibold leading-relaxed">
                {directive.status === "ACKNOWLEDGED" || directive.status === "RESOLVED"
                  ? <>✓ {coachName} 코치가 확인했어요 (서버 기준)</>
                  : <>✓ 서버 전송됨 · 상태 {directive.status} — 코치가 &quot;확인&quot;을 눌러야 확인함이 돼요</>}
                <button onClick={() => void refreshDirectiveStatus()} className="ml-2 underline font-bold">
                  상태 새로고침
                </button>
              </div>
            )}
            {coachSent && !directive && (
              <div className="mt-2.5 bg-accent-weak text-brand rounded-xl px-3.5 py-2.5 text-[12px] font-semibold leading-relaxed">
                ✓ {coachName} 코치 앱에 표시됨 · 확인 대기 (데모) — 읽으면 &quot;확인함&quot;으로 바뀌어요
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* 배너 관리 */}
      <Panel title="학원 배너 관리" hnote="학부모 앱 홈 캐러셀에 게시 — 캠프·특강·신규 반·체험·대회">
        {BANNERS_INIT.map((b) => (
          <Row
            key={b.title}
            icon={b.icon === "trophy" ? <IconSpark size={18} /> : <IconBell size={18} />}
            title={b.title}
            sub={b.sub}
            trailing={
              <span
                className={`text-[10.5px] font-bold rounded-full px-2.5 py-1 ${
                  b.tone === "accent" ? "bg-accent-weak text-brand" : "bg-warn-weak text-warn-ink"
                }`}
              >
                {b.pill}
              </span>
            }
          />
        ))}
        {banners.map((b, i) => (
          <Row
            key={`new-${i}`}
            icon={<IconBell size={18} />}
            title={b.title}
            sub={b.sub}
            trailing={<span className="text-[10.5px] font-bold rounded-full px-2.5 py-1 bg-warn-weak text-warn-ink">{b.pill}</span>}
          />
        ))}
        <ActBtn className="mt-3" onClick={newBanner}>
          새 배너 만들기
        </ActBtn>
        <Note inPanel icon={<IconSpark size={16} />}>
          여기서는 <b className="text-ink font-bold">학원 배너만</b> 관리해요. PACEFOLIO 자체 콘텐츠·스토어 배너는 본사 운영자
          콘솔에서 관리하고, 학부모 앱에서 <b className="text-ink font-bold">출처가 구분 표시</b>됩니다.
        </Note>
      </Panel>

      {/* Q&A 관리 */}
      <Panel title="학원 Q&A 관리" hnote='학부모 앱 홈의 "원더짐 Q&A"에 노출 — 원장이 등록·수정·숨김'>
        {qa.map((it, i) => (
          <Row
            key={`${it.q}-${i}`}
            icon={<IconChat size={18} />}
            title={it.q}
            sub={`${it.cat} · ${it.tgt} · ${it.pub ? "공개" : "숨김"}`}
            trailing={
              <div className="flex gap-1.5">
                <ActBtn soft onClick={() => togglePub(i)}>
                  {it.pub ? "숨기기" : "공개"}
                </ActBtn>
                <ActBtn soft onClick={() => editQa(i)}>
                  수정
                </ActBtn>
              </div>
            }
          />
        ))}
        <ActBtn className="mt-3" onClick={newQa}>
          새 Q&A 등록
        </ActBtn>
        <Note inPanel>
          여기 등록한 Q&A가 <b className="text-ink font-bold">학부모 앱 홈</b>의 원더짐 Q&A에 그대로 보여요 — 전화 문의를 줄이는
          셀프 안내. 숨김 처리하면 학부모 앱에서 사라집니다.
        </Note>
      </Panel>

      {overlays}
    </PCShell>
  );
}
