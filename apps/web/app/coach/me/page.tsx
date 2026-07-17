"use client";

/* 내 정보 (배치 C4 — docs/14-coach-product-plan.md)
   순서: ① 이번 주 일정(오늘 강조) ② 담당 수업(펼치면 학생 목록 + 개별
   피드백) ③ 코치 카드·근무 학원 ④ 코치 설정(인사정보·템플릿·알림·
   인수인계·사진·계정). 개별 피드백은 공개 범위(내부/원장/학부모) 명시. */

import { useState } from "react";
import Link from "next/link";
import { AppHeader, AppScroll } from "@/components/mobile/MobileShell";
import { Card, Tag, ProgressBar, cn } from "@/components/ui";
import { useCoach } from "../_state";
import { coach, academies, myClasses, WEEK, weekNote, KIDS, HR_ROWS, TEMPLATE_MAX } from "../_data";

const FB_SCOPES = ["코치 내부 메모", "원장과 공유", "학부모에게 전달"] as const;

export default function CoachMe() {
  const c = useCoach();
  const [openCls, setOpenCls] = useState<string | null>(null);
  const [fbKid, setFbKid] = useState<string | null>(null);
  const [fbScope, setFbScope] = useState<(typeof FB_SCOPES)[number]>("코치 내부 메모");
  const [fbText, setFbText] = useState("");
  const [fbSaved, setFbSaved] = useState<Record<string, string>>({});
  const [hrOpen, setHrOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);

  const roster = KIDS.filter((k) => !k.paused);

  const saveFb = () => {
    if (!fbKid) return;
    if (!fbText.trim()) {
      c.showToast("피드백 내용을 적어주세요");
      return;
    }
    setFbSaved((m) => ({ ...m, [fbKid]: fbScope }));
    c.showToast(`${fbKid} 피드백 저장 — 공개 범위: ${fbScope} (저장은 API_REQUIRED)`);
    setFbKid(null);
    setFbText("");
  };

  return (
    <>
      <AppHeader title="내 정보" />
      <AppScroll>
        <div className="px-1">
          <p className="text-[19px] font-extrabold tracking-tight text-ink">내 정보</p>
          <p className="mt-0.5 text-[12.5px] font-medium text-ink3">PACEFOLIO · {coach.academy}</p>
        </div>

        {/* ① 이번 주 일정 — 최상단 · 오늘(월 27) 강조 */}
        <Card>
          <h4 className="text-[13.5px] font-bold text-ink">이번 주 일정</h4>
          <div className="mt-2 flex gap-1.5">
            {WEEK.map((d) => {
              const today = d.dw === "월"; // 목업 기준일 10/27(월)
              return (
                <div
                  key={d.dw}
                  className={cn(
                    "flex-1 rounded-xl border py-2.5 text-center",
                    today ? "border-accent bg-accent-weak ring-1 ring-accent" : d.time ? "border-accent-weak bg-accent-weak" : "border-line bg-fill",
                  )}
                >
                  <div className={cn("text-[10.5px] font-semibold", today ? "text-accent-ink" : "text-ink3")}>{d.dw}</div>
                  <div className={cn("mt-0.5 text-[13px] font-extrabold", d.time ? "text-accent-ink" : "text-ink")}>{d.dn}</div>
                  <div className="mt-0.5 min-h-3 text-[9px] font-bold text-accent-ink">{d.time ?? ""}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-2.5 text-[11.5px] font-medium text-ink3">{weekNote} · 수업을 누르면 상세로 이동(담당 수업)</div>
        </Card>

        {/* ② 담당 수업 — 펼치면 학생 목록 + 개별 피드백 */}
        <Card>
          <h4 className="text-[13.5px] font-bold text-ink">담당 수업</h4>
          <div className="mt-1 divide-y divide-line2">
            {myClasses.map((m) => {
              const open = openCls === m.name;
              const isPlay2 = m.name.startsWith("플레이2");
              return (
                <div key={m.name}>
                  <button
                    onClick={() => setOpenCls(open ? null : m.name)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-3 py-2.5 text-left"
                  >
                    <div className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl bg-fill text-[17px]">{m.e}</div>
                    <div className="flex-1">
                      <div className="text-[13.5px] font-bold text-ink">{m.name}</div>
                      <div className="text-[11.5px] font-medium text-ink3">{m.sub}</div>
                    </div>
                    <Tag tone="muted">{m.tag}</Tag>
                    <span className={cn("text-[12px] font-bold text-ink3 transition-transform", open && "rotate-180")}>▾</span>
                  </button>
                  {open && (
                    <div className="pb-3 pl-[50px]">
                      {isPlay2 ? (
                        <>
                          <div className="text-[11px] font-bold text-ink3">참여 학생 {roster.length}명 — 누르면 개별 피드백</div>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {roster.map((k) => (
                              <button
                                key={k.n}
                                onClick={() => { setFbKid(fbKid === k.n ? null : k.n); setFbText(""); }}
                                className={cn(
                                  "rounded-full border px-3 py-1.5 text-[12px] font-semibold",
                                  fbKid === k.n ? "border-accent bg-accent-weak text-accent-ink"
                                  : fbSaved[k.n] ? "border-accent-weak bg-fill text-accent-ink"
                                  : "border-line bg-surface text-ink2",
                                )}
                              >
                                {k.n}{fbSaved[k.n] ? " ✓" : ""}
                              </button>
                            ))}
                          </div>
                          {fbKid && (
                            <div className="mt-2.5 rounded-xl border border-line bg-fill p-3">
                              <div className="text-[12px] font-bold text-ink">{fbKid} 개별 피드백</div>
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {FB_SCOPES.map((s) => (
                                  <button
                                    key={s}
                                    onClick={() => setFbScope(s)}
                                    className={cn(
                                      "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                                      fbScope === s ? "border-accent bg-accent-weak text-accent-ink" : "border-line bg-surface text-ink2",
                                    )}
                                  >
                                    {s}
                                  </button>
                                ))}
                              </div>
                              <div className="mt-1 text-[10.5px] font-medium text-warn-ink">
                                공개 범위대로만 전달돼요 — 잘못된 대상 공개 방지
                              </div>
                              <textarea
                                value={fbText}
                                onChange={(e) => setFbText(e.target.value)}
                                placeholder={`${fbKid}에게 남길 피드백`}
                                className="mt-2 h-16 w-full resize-none rounded-lg border border-line bg-surface p-2.5 text-[12.5px] font-medium text-ink focus:border-accent focus:outline-none"
                              />
                              <button onClick={saveFb} className="mt-2 h-9 w-full rounded-[10px] bg-accent-strong text-[12px] font-bold text-white">
                                저장
                              </button>
                            </div>
                          )}
                          <div className="mt-2 text-[10.5px] font-medium text-ink3">
                            최근 출석·진행 활동·원장 전달사항은 수업 상세(API_REQUIRED)
                          </div>
                        </>
                      ) : (
                        <div className="text-[11.5px] font-medium text-ink3">토요특강 8명 — 명단·피드백은 수업 상세(API_REQUIRED)</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* ③ 코치 카드 + 근무 학원 */}
        <Card className="flex items-center gap-3 border-0 bg-side text-white">
          <div className="grid shrink-0 place-items-center rounded-2xl bg-accent text-[19px] font-extrabold" style={{ width: 52, height: 52 }}>
            {coach.initial}
          </div>
          <div>
            <div className="text-[17px] font-extrabold">{coach.name} 코치</div>
            <div className="mt-0.5 text-[11.5px] font-medium opacity-85">
              {coach.academy} · {coach.tenure} · 담당 {coach.classCount}개 반 · 재원 {coach.studentCount}명
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h4 className="text-[13.5px] font-bold text-ink">근무 학원</h4>
            <span className="text-[10.5px] font-semibold text-ink3">전환하면 수업·소통·권한이 함께 바뀌어요</span>
          </div>
          <div className="mt-1 divide-y divide-line2">
            {academies.map((a) => (
              <button
                key={a.id}
                onClick={() => c.showToast(a.current ? "지금 보고 있는 학원이에요" : `${a.name}(으)로 전환하면 해당 학원 정보만 표시돼요 (시연)`)}
                className="flex w-full items-center gap-3 py-2.5 text-left"
              >
                <div className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl bg-fill text-[17px]">{a.emoji}</div>
                <div className="flex-1">
                  <div className="text-[13.5px] font-bold text-ink">{a.name}</div>
                  <div className="text-[11.5px] font-medium text-ink3">{a.role}</div>
                </div>
                {a.current && <Tag tone="accent">현재</Tag>}
              </button>
            ))}
          </div>
        </Card>

        {/* ④ 코치 설정 — 인수인계는 설정 안으로 이동 (C4) */}
        <Card>
          <h4 className="text-[13.5px] font-bold text-ink">코치 설정</h4>
          <div className="mt-1 divide-y divide-line2">
            {/* 내 인사정보 */}
            <div>
              <button onClick={() => setHrOpen((o) => !o)} aria-expanded={hrOpen} className="flex w-full items-center justify-between py-2.5 text-left">
                <span className="text-[13.5px] font-semibold text-ink">내 인사정보</span>
                <span className={cn("text-[12px] font-bold text-ink3 transition-transform", hrOpen && "rotate-180")}>▾</span>
              </button>
              {hrOpen && (
                <div className="pb-2.5">
                  {HR_ROWS.map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 py-1 text-[12.5px]">
                      <span className="shrink-0 font-medium text-ink3">{k}</span>
                      <span className="text-right font-semibold text-ink">{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* 템플릿 관리 */}
            <div>
              <button onClick={() => setTplOpen((o) => !o)} aria-expanded={tplOpen} className="flex w-full items-center justify-between py-2.5 text-left">
                <span className="text-[13.5px] font-semibold text-ink">수업 완료 메시지 템플릿</span>
                <span className="text-[11px] font-bold text-accent-ink">{c.templates.length}/{TEMPLATE_MAX}</span>
              </button>
              {tplOpen && (
                <div className="pb-2.5">
                  {c.templates.map((t, i) => (
                    <div key={i} className="flex items-start gap-2 py-1.5">
                      <span className="flex-1 text-[12px] font-medium leading-snug text-ink2">“{t}”</span>
                      <button
                        onClick={() => { c.removeTemplate(i); c.showToast("템플릿 삭제됨"); }}
                        className="shrink-0 rounded-lg border border-line px-2 py-1 text-[11px] font-bold text-ink3"
                      >
                        삭제
                      </button>
                    </div>
                  ))}
                  <div className="mt-1 text-[10.5px] font-medium text-ink3">
                    새 템플릿은 수업 완료 화면의 &quot;+ 현재 문구 저장&quot;으로 추가 · 최대 {TEMPLATE_MAX}개
                  </div>
                </div>
              )}
            </div>
            <SettingRow label="알림 설정" onClick={() => c.showToast("알림 설정 — 후속 (UI_ONLY)")} />
            <SettingRow label="담당 수업 및 일정" onClick={() => c.showToast("위 담당 수업·이번 주 일정에서 확인해요")} />
            {/* 인수인계 — 고정 메뉴에서 설정 안으로 */}
            <Link href="/coach/me/handover" className="flex w-full items-center justify-between py-2.5">
              <span className="text-[13.5px] font-semibold text-ink">인수인계</span>
              <span className="flex items-center gap-2">
                <span className="w-16"><ProgressBar value={c.byeDone / 4} /></span>
                <span className="text-[11px] font-bold text-accent-ink">작별 피드백 {c.byeDone}/4</span>
              </span>
            </Link>
            <SettingRow label="사진·미디어 설정" onClick={() => c.showToast("사진 파이프라인은 후속 배치 C5 — 오브젝트 스토리지·signed URL·동의 게이트")} />
            <SettingRow label="계정 및 보안" onClick={() => c.showToast("계정·보안 — 후속 (UI_ONLY)")} />
          </div>
        </Card>

        <Link href="/demo" className="block py-3 text-center text-[13px] text-ink3">
          ← 앱 허브(데모)로 돌아가기
        </Link>
      </AppScroll>
    </>
  );
}

function SettingRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between py-2.5 text-left">
      <span className="text-[13.5px] font-semibold text-ink">{label}</span>
      <span className="text-[12px] font-bold text-ink3">›</span>
    </button>
  );
}
