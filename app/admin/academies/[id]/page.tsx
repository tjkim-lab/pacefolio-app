"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AdminShell } from "../../_shell";
import { Tag } from "@/components/ui";
import { IconArrowLeft } from "@/components/ui/icons";
import { Panel, Note, MetricRow, useConfirm, useToast } from "../../_ui";
import { acadById, STATUS_META, hsClass } from "../../_data";

interface SessionLog { t: string; act: string; why: string }

export default function AcademyDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const a = acadById(id);
  const { confirm, confirmView } = useConfirm();
  const { toast, toastView } = useToast();

  const [supportOn, setSupportOn] = useState(false);
  const [left, setLeft] = useState(15 * 60);
  const [logs, setLogs] = useState<SessionLog[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  if (!a) {
    return (
      <AdminShell title="학원 상세">
        <Note>학원을 찾을 수 없습니다. <Link href="/admin/academies" className="text-brand font-bold ml-1">목록으로</Link></Note>
      </AdminShell>
    );
  }

  const s = STATUS_META[a.status];
  const showNum = a.status === "ACTIVE" || a.status === "AT_RISK";
  const healthLabel = a.health >= 80 ? "건강 · 규칙 기반" : a.health >= 60 ? "주의 관찰" : a.health > 0 ? "이탈 위험" : "체험/정지 · 미산출";

  function fmt(sec: number) {
    const m = Math.floor(sec / 60);
    const ss = sec % 60;
    return `${m}:${ss < 10 ? "0" : ""}${ss}`;
  }

  function endSupport(reason: string) {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setSupportOn(false);
    setLogs((p) => [{ t: "방금", act: "SUPPORT_VIEW_ENDED", why: reason }, ...p]);
    toast("지원 보기 세션 종료 — 감사 로그 기록 (SUPPORT_VIEW_ENDED)");
  }

  function startSupport(reason: string) {
    setLeft(15 * 60);
    setSupportOn(true);
    setLogs((p) => [{ t: "방금", act: "SUPPORT_VIEW_STARTED", why: reason || "사유 입력" }, ...p]);
    toast("지원 보기 세션 시작 — 읽기전용·마스킹 · 감사 로그 기록 (SUPPORT_VIEW_STARTED)");
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setLeft((prev) => {
        if (prev <= 1) {
          if (timer.current) clearInterval(timer.current);
          timer.current = null;
          setSupportOn(false);
          setLogs((p) => [{ t: "방금", act: "SUPPORT_VIEW_ENDED", why: "접근 시간 만료 · 자동 종료" }, ...p]);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function openSupport() {
    if (supportOn) {
      toast("이미 지원 보기 세션이 활성 상태예요");
      return;
    }
    confirm({
      title: `지원 보기 시작 — ${a!.name}`,
      sub: "운영자가 원장 비밀번호를 우회해 로그인하지 않습니다. 지원 보기(Support View)로 안전하게 접근합니다.",
      rows: [["보기 유형", "원장 콘솔"], ["권한", "읽기전용"], ["개인정보·금액", "마스킹"], ["접근 시간", "15분 · 자동 만료"]],
      warn: "접근 사유는 필수이며, 시작·종료가 감사 로그에 실시간 기록됩니다.",
      memo: { label: "접근 사유 (필수)", placeholder: "예: 청구서 표시 오류 확인 · 티켓번호", required: true },
      label: "지원 보기 시작",
      onConfirm: (reason) => startSupport(reason),
    });
  }

  const tree =
    a.id === "wondergym"
      ? "원더짐 아카데미\n ├ 브레인\n │  ├ 플레이1\n │  ├ 플레이2  (월수반 · 유아반)\n │  └ 플레이3\n └ 액티브\n     ├ 축구\n     ├ 인라인\n     └ 농구 특강"
      : `${a.name}\n ├ 부문 · 프로그램 · 반 구조\n └ (상세는 원장 콘솔 지원 보기로 확인)`;

  const unpaid = a.id === "cheonho" ? "24건" : a.id === "myeongil" ? "5건" : a.status === "ACTIVE" ? "소수" : "–";

  return (
    <AdminShell
      title={
        <span className="flex items-center gap-3">
          <button onClick={() => router.push("/admin/academies")} className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface text-ink2 text-[12.5px] font-bold px-3 py-1.5">
            <IconArrowLeft size={14} /> 목록
          </button>
          <span>{a.name}</span>
          <Tag tone={s.tone}>{s.ko}</Tag>
        </span>
      }
      actions={
        <button onClick={openSupport} className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface text-brand text-[12.5px] font-bold px-3 h-9">
          <EyeMini /> 지원 보기 시작
        </button>
      }
    >
      <div className="space-y-3">
        {supportOn && (
          <div className="flex items-center gap-3 bg-warn-weak border border-[#EAD9A8] rounded-xl px-4 py-3">
            <span className="w-[9px] h-[9px] rounded-full bg-gold animate-pulse shrink-0" />
            <div className="flex-1 text-[12.5px] font-semibold text-warn-ink">
              <b className="font-bold">지원 보기 세션 활성</b> — {a.name} · 원장 콘솔 <b>읽기전용</b> · 개인정보·금액 <b>마스킹</b> · 남은 시간{" "}
              <span className="tabular-nums font-extrabold">{fmt(left)}</span> 후 자동 만료
            </div>
            <button onClick={() => endSupport("운영자 수동 종료")} className="rounded-lg border border-line bg-surface text-ink2 text-[11px] font-bold px-2.5 py-1.5">
              세션 종료
            </button>
          </div>
        )}

        {/* KPI */}
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-2xl bg-accent-strong text-white p-4">
            <div className="text-[11.5px] text-white/80 font-semibold">헬스 스코어</div>
            <div className="text-[22px] font-extrabold tracking-tight mt-1">{a.health > 0 ? a.health : "–"}</div>
            <div className="text-[11px] text-white/80 font-medium mt-1">{healthLabel}</div>
          </div>
          <DetailKpi label="활성 원생" value={a.kids > 0 ? a.kids + "명" : "–"} sub={`알림 수신 보호자 ${a.kids > 0 ? a.guardians + "명" : "–"}`} />
          <DetailKpi label="자동결제 등록률" value={showNum ? a.auto + "%" : "–"} sub={`리포트 발송 ${showNum ? a.report + "%" : "–"}`} />
          <DetailKpi label="담당 운영자" value={a.cs} sub={`가입 ${a.join}`} valueSize="18px" />
        </div>

        {/* 조직 + 이용현황 */}
        <div className="grid grid-cols-[1.6fr_1fr] gap-3">
          <Panel title="조직 · 프로그램 구조" note="부문 › 프로그램 › 반">
            <pre className="bg-fill rounded-xl px-4 py-3 text-[12px] font-semibold text-ink2 leading-[1.95] whitespace-pre font-sans">{tree}</pre>
            <Note tone="inpanel">
              <UsersMini />
              <span>한 원생이 여러 학원을 다녀도 <b className="text-ink font-bold">{a.name} 등록 정보</b>만 이 화면에 표시됩니다.</span>
            </Note>
          </Panel>
          <Panel title="이용 현황" note="최근 7일">
            <MetricRow label="원장 로그인" value={a.status === "ACTIVE" ? "활발" : a.status === "AT_RISK" ? "저조" : "–"} pct={a.status === "ACTIVE" ? 90 : a.status === "AT_RISK" ? 20 : 40} />
            <MetricRow label="코치 수업 기록" value={showNum ? a.report + "%" : "–"} pct={showNum ? a.report : 15} />
            <MetricRow label="학부모 앱 활성" value={showNum ? Math.min(95, a.report + 6) + "%" : "–"} pct={showNum ? Math.min(95, a.report + 6) : 10} />
            <MetricRow label="Q&A 자체 해결" value={showNum ? Math.max(30, a.auto) + "%" : "–"} pct={showNum ? Math.max(30, a.auto) : 5} tone={showNum && a.auto >= 50 ? "normal" : "low"} />
          </Panel>
        </div>

        {/* 수강료 + 지원 이력 */}
        <div className="grid grid-cols-2 gap-3 items-start">
          <Panel title="수강료 현황" note={<Link href="/admin/payments" className="text-brand font-bold">관제 →</Link>}>
            <RL label="12월 시작 수납기간 청구" value={a.status === "ACTIVE" ? "확정·발송" : a.status === "AT_RISK" ? "초안 오류" : "미생성"} />
            <RL label="자동결제 등록" value={showNum ? a.auto + "%" : "–"} />
            <RL label="미납 · 실패" value={unpaid} valueClass="text-danger-ink" />
          </Panel>
          <Panel title="지원 이력" note="감사 로그 연결">
            {logs.length > 0 ? (
              logs.map((l, i) => (
                <div key={i} className="flex gap-2.5 items-center py-2.5 border-b border-line2 last:border-0">
                  <div className="w-8 h-8 rounded-lg bg-fill grid place-items-center shrink-0 text-ink2"><EyeMini /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-semibold text-ink">{l.act}</div>
                    <div className="text-[11px] text-ink3 font-medium">김운영 · {l.t} · {l.why}</div>
                  </div>
                  <Tag tone={l.act === "SUPPORT_VIEW_ENDED" ? "muted" : "accent"}>{l.act === "SUPPORT_VIEW_ENDED" ? "종료" : "활성"}</Tag>
                </div>
              ))
            ) : a.id === "gangdong" ? (
              <div className="flex gap-2.5 items-center py-2.5 border-b border-line2">
                <div className="w-8 h-8 rounded-lg bg-fill grid place-items-center shrink-0 text-ink2"><EyeMini /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-semibold text-ink">지원 보기 · 청구 오류 확인</div>
                  <div className="text-[11px] text-ink3 font-medium">김운영 · 오늘 10:41 · 읽기전용</div>
                </div>
                <Tag tone="accent">완료</Tag>
              </div>
            ) : (
              <div className="flex gap-2.5 items-center py-2.5">
                <div className="w-8 h-8 rounded-lg bg-fill grid place-items-center shrink-0 text-ink2"><ShieldMini /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-semibold text-ink">최근 지원 이력 없음</div>
                  <div className="text-[11px] text-ink3 font-medium">지원 보기 시작 시 여기와 감사 로그에 기록돼요</div>
                </div>
              </div>
            )}
            <Note tone="warn">
              <EyeMini className="text-warn-ink" />
              <span><b className="font-bold">지원 보기</b>는 기본 읽기전용·개인정보/금액 마스킹 · 사유·티켓·시간 제한 필수 · 모든 접근이 감사 로그에 남습니다.</span>
            </Note>
          </Panel>
        </div>
      </div>
      {confirmView}
      {toastView}
    </AdminShell>
  );
}

function DetailKpi({ label, value, sub, valueSize }: { label: string; value: string; sub: string; valueSize?: string }) {
  return (
    <div className="rounded-2xl bg-surface border border-line p-4">
      <div className="text-[11.5px] text-ink3 font-semibold">{label}</div>
      <div className="font-extrabold tracking-tight mt-1 text-ink" style={{ fontSize: valueSize || "22px" }}>{value}</div>
      <div className="text-[11px] text-ink3 font-medium mt-1">{sub}</div>
    </div>
  );
}

function RL({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between items-baseline gap-2.5 py-2.5 border-b border-line2 last:border-0 text-[13px]">
      <span className="text-ink2 font-medium">{label}</span>
      <span className={`font-bold text-ink text-right ${valueClass || ""}`}>{value}</span>
    </div>
  );
}

function EyeMini({ className = "" }: { className?: string }) {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function UsersMini() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0">
      <circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5" /><path d="M16 5a3.5 3.5 0 0 1 0 7M18 20c0-2.5-1-4-3-4.6" />
    </svg>
  );
}
function ShieldMini() {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M9.5 12l1.8 1.8 3.2-3.6" />
    </svg>
  );
}
