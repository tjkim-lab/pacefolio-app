"use client";

import { useState } from "react";
import { AdminShell } from "../_shell";
import { Tag } from "@/components/ui";
import { SubTabs, Panel, Note, useConfirm, useToast } from "../_ui";
import { SENT_NOTICES, BANNERS, QA_TEMPLATES, type QaTemplate } from "../_data";

type Tab = "notice" | "banner" | "qa";
type Target = "all" | "owner" | "guardian";

export default function AdminComm() {
  const [tab, setTab] = useState<Tab>("notice");
  const { confirm, confirmView } = useConfirm();
  const { toast, toastView } = useToast();

  // 공지 작성
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState<Target>("all");
  const [sentMsg, setSentMsg] = useState("");

  // 배너/QA 상태 오버라이드
  const [bannerDone, setBannerDone] = useState<Record<string, boolean>>({});
  const [qaDone, setQaDone] = useState<Record<string, boolean>>({});

  const targetLabel: Record<Target, string> = {
    all: "전체 학원 (원장·코치·보호자)",
    owner: "원장만",
    guardian: "보호자",
  };

  function sendNotice() {
    if (!title.trim() || !body.trim()) {
      toast("제목과 내용을 입력해 주세요");
      return;
    }
    confirm({
      title: "플랫폼 공지 발송 확인",
      sub: title,
      rows: [["대상", targetLabel[target]], ["채널", "앱 푸시 · 알림톡"]],
      warn: "발송하면 대상 전체에게 즉시 전달되고 도달·열람이 추적됩니다.",
      label: "발송",
      onConfirm: () => {
        setSentMsg(`발송 완료 — ${targetLabel[target]}에게 전달 · 도달 추적을 시작했어요 (데모)`);
        setTitle("");
        setBody("");
        toast("플랫폼 공지를 발송했어요");
      },
    });
  }

  function reviewBanner(name: string) {
    confirm({
      title: `배너 검수 — ${name}`,
      sub: "광고 라벨·출처·노출 대상 정책을 확인합니다.",
      warn: "게시하면 노출 대상 학부모 앱의 발견 배너에 PACEFOLIO 출처로 표시됩니다.",
      label: "검수 통과 · 게시",
      onConfirm: () => {
        setBannerDone((p) => ({ ...p, [name]: true }));
        toast("배너를 검수·게시했어요 (데모)");
      },
    });
  }

  function reviewQa(q: string) {
    confirm({
      title: `Q&A 템플릿 검수 — ${q}`,
      sub: "법률 표현·위험 문구를 검토합니다.",
      warn: "기본 템플릿만 관리합니다. 각 학원이 복제·수정한 답변은 무단으로 바꾸지 않아요.",
      label: "검토 완료 · 게시",
      onConfirm: () => {
        setQaDone((p) => ({ ...p, [q]: true }));
        toast("Q&A 기본 템플릿을 게시했어요 (데모)");
      },
    });
  }

  function qaTag(t: QaTemplate) {
    if (qaDone[t.q] || t.st === "posted") return <Tag tone="accent">게시중</Tag>;
    if (t.st === "draft") return <Tag tone="muted">초안</Tag>;
    return (
      <button onClick={() => reviewQa(t.q)} className="rounded-lg border border-accent text-brand text-[11px] font-bold px-2.5 py-1.5">
        검수
      </button>
    );
  }

  return (
    <AdminShell title="커뮤니케이션">
      <div className="space-y-3">
        <div>
          <h2 className="text-[19px] font-extrabold tracking-tight">커뮤니케이션</h2>
          <p className="text-[12.5px] text-ink3 font-medium mt-0.5">
            플랫폼 공지 · 서비스 배너 · Q&amp;A 기본 템플릿 — 정책을 아래(학원 앱)로 내려보냄
          </p>
        </div>

        <SubTabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "notice", label: "플랫폼 공지" },
            { key: "banner", label: "서비스 배너" },
            { key: "qa", label: "Q&A 템플릿" },
          ]}
        />

        {tab === "notice" && (
          <div className="grid grid-cols-2 gap-3 items-start">
            <Panel title="새 플랫폼 공지">
              <label className="block text-[11.5px] font-bold text-ink2 mt-3 mb-1.5">공지 제목</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 12/2(월) 새벽 정기 점검 안내"
                className="w-full rounded-xl bg-fill border border-line px-3 py-2.5 text-[13px] text-ink outline-none focus:bg-surface focus:border-accent"
              />
              <label className="block text-[11.5px] font-bold text-ink2 mt-3 mb-1.5">공지 내용</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="학원 전체 또는 특정 대상에게 전달됩니다"
                className="w-full h-[82px] rounded-xl bg-fill border border-line px-3 py-2.5 text-[13px] text-ink outline-none focus:bg-surface focus:border-accent resize-none"
              />
              <div className="text-[11.5px] text-ink3 font-medium mt-2">대상 선택</div>
              <div className="flex gap-2 flex-wrap mt-1.5">
                {([
                  { k: "all", t: "전체 학원", s: "원장·코치·보호자" },
                  { k: "owner", t: "원장만", s: "운영 관련" },
                  { k: "guardian", t: "보호자", s: "서비스 안내" },
                ] as const).map((o) => (
                  <button
                    key={o.k}
                    onClick={() => setTarget(o.k)}
                    className={`flex-1 min-w-[92px] rounded-xl border px-3 py-2 text-left text-[12px] font-bold transition ${
                      target === o.k ? "border-accent bg-accent-weak text-brand" : "border-line bg-surface text-ink2"
                    }`}
                  >
                    {o.t}
                    <span className={`block text-[10px] font-medium mt-0.5 ${target === o.k ? "text-brand" : "text-ink3"}`}>{o.s}</span>
                  </button>
                ))}
              </div>
              <button onClick={sendNotice} className="w-full rounded-xl bg-accent-strong text-white font-bold text-[13.5px] py-3 mt-3">
                발송 전 확인
              </button>
              {sentMsg && (
                <div className="mt-2.5 bg-accent-weak rounded-xl px-3 py-2.5 text-[12px] font-semibold text-accent-ink leading-normal">{sentMsg}</div>
              )}
            </Panel>

            <Panel title="최근 발송" note="도달·열람 추적">
              {SENT_NOTICES.map((n) => (
                <div key={n.title} className="flex gap-3 items-center py-3 border-b border-line2 last:border-0">
                  <div className={`w-[34px] h-[34px] rounded-xl grid place-items-center shrink-0 ${n.warn ? "bg-warn-weak text-warn-ink" : "bg-fill text-ink2"}`}>
                    {n.warn ? <ClockMini /> : <MegaMini />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-ink">{n.title}</div>
                    <div className="text-[11px] text-ink3 font-medium">{n.sub}</div>
                  </div>
                  <Tag tone={n.st.tone}>{n.st.label}</Tag>
                </div>
              ))}
            </Panel>
          </div>
        )}

        {tab === "banner" && (
          <>
            <div className="rounded-2xl bg-surface border border-line px-4">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-ink3 text-[11px] border-b border-line">
                    <th className="text-left font-bold py-2.5">배너</th>
                    <th className="text-left font-bold py-2.5">유형</th>
                    <th className="text-left font-bold py-2.5">노출 대상</th>
                    <th className="text-left font-bold py-2.5">기간</th>
                    <th className="text-left font-bold py-2.5">광고</th>
                    <th className="text-left font-bold py-2.5">상태</th>
                    <th className="py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {BANNERS.map((b) => {
                    const done = bannerDone[b.name];
                    return (
                      <tr key={b.name} className="border-b border-line2 last:border-0">
                        <td className="py-3 text-ink">{b.name}</td>
                        <td className="py-3 text-ink2">{b.type}</td>
                        <td className="py-3 text-ink2">{b.target}</td>
                        <td className="py-3 text-ink2">{b.period}</td>
                        <td className="py-3">{b.ad ? <Tag tone="warn">광고</Tag> : <span className="text-ink3">-</span>}</td>
                        <td className="py-3">{done ? <Tag tone="accent">게시</Tag> : <Tag tone={b.st.tone}>{b.st.label}</Tag>}</td>
                        <td className="py-3 text-right">
                          {b.action === "perf" && (
                            <button onClick={() => toast("배너 성과: 노출 4,210 · 탭 318 · 전환 41 (데모)")} className="rounded-lg border border-line text-ink2 text-[11px] font-bold px-2.5 py-1.5">
                              성과
                            </button>
                          )}
                          {b.action === "review" && !done && (
                            <button onClick={() => reviewBanner(b.name)} className="rounded-lg border border-accent text-brand text-[11px] font-bold px-2.5 py-1.5">
                              검수
                            </button>
                          )}
                          {b.action === "review" && done && <span className="text-[11px] font-bold text-accent-ink">게시됨</span>}
                          {b.action === "reserve" && (
                            <button onClick={() => toast("게시 예약을 확인했어요 (데모)")} className="rounded-lg border border-line text-ink2 text-[11px] font-bold px-2.5 py-1.5">
                              예약
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Note tone="warn">
              <AlertMini className="text-warn-ink" />
              <span>운영 필수 공지·행동 필요 카드는 <b className="font-bold">배너에만 넣지 않습니다.</b> 배너와 공지는 별도 유지 · <b className="font-bold">광고</b>는 반드시 라벨 표시.</span>
            </Note>
          </>
        )}

        {tab === "qa" && (
          <>
            <Panel title="Q&A 기본 템플릿" note="플랫폼 제공 → 원장이 복제·수정 → 학부모 앱 게시">
              {QA_TEMPLATES.map((t) => (
                <div key={t.q} className="flex items-center gap-2.5 py-3 border-b border-line2 last:border-0">
                  <div className="w-[26px] h-[26px] rounded-lg bg-accent-weak text-brand grid place-items-center text-[12px] font-extrabold shrink-0">Q</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-ink">{t.q}</div>
                    <div className="text-[11px] text-ink3 font-medium">
                      {t.sub} · {t.flag ? <b className="text-warn-ink font-bold">{t.usage}</b> : t.usage}
                    </div>
                  </div>
                  {qaTag(t)}
                </div>
              ))}
            </Panel>
            <Note>
              <ShieldMini />
              <span>운영자는 학원 답변을 무단 수정하지 않습니다 — <b className="text-ink font-bold">기본 템플릿 제공 · 위험 문구 탐지 · 오래된 답변 알림 · 게시 중지</b> 권한만 가집니다.</span>
            </Note>
          </>
        )}
      </div>
      {confirmView}
      {toastView}
    </AdminShell>
  );
}

function AlertMini({ className = "" }: { className?: string }) {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
      <path d="M12 3 2.5 20h19z" /><path d="M12 10v4M12 17.2h.01" />
    </svg>
  );
}
function MegaMini() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M3 11v2a1 1 0 0 0 1 1h2l9 5V5L6 10H4a1 1 0 0 0-1 1z" /><path d="M18 8a4 4 0 0 1 0 8" />
    </svg>
  );
}
function ClockMini() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
    </svg>
  );
}
function ShieldMini() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0">
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M9.5 12l1.8 1.8 3.2-3.6" />
    </svg>
  );
}
