"use client";

/* 보호자 온보딩 — 입력·콘텐츠 필드.
   PhoneField / OtpField / AgreementList / InviteCodeField / AcademyBadge /
   ChildFormCard / ProgramPicker / PermissionGuide.
   기존 토큰(44px·라운드·대비 AA) 준수. */

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/components/ui";
import { IconChevron } from "@/components/ui/icons";
import {
  OTP_LEN, type Agreement, type Academy, type ChildDraft, type Program,
} from "./_data";

/* ---------- 휴대폰 번호 ---------- */
const CARRIERS = ["SKT", "KT", "LG U+", "알뜰폰"];

export function PhoneField({
  phone, onPhone, carrier, onCarrier,
}: { phone: string; onPhone: (v: string) => void; carrier: string; onCarrier: (v: string) => void }) {
  const fmt = (raw: string) => {
    const d = raw.replace(/\D/g, "").slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  };
  return (
    <div>
      <label className="block text-[13px] font-semibold text-ink2 mb-2">휴대폰 번호</label>
      <div className="flex gap-2">
        <div className="relative shrink-0">
          <select aria-label="통신사" value={carrier} onChange={(e) => onCarrier(e.target.value)}
            className="h-[52px] w-[92px] rounded-[14px] border border-line bg-surface pl-3.5 pr-7 text-[14px] font-semibold text-ink appearance-none">
            {CARRIERS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <IconChevron size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink3" />
        </div>
        <input type="tel" inputMode="numeric" autoComplete="tel" placeholder="010-0000-0000"
          value={phone} onChange={(e) => onPhone(fmt(e.target.value))}
          className="flex-1 h-[52px] rounded-[14px] border border-line bg-surface px-4 text-[16px] font-semibold text-ink placeholder:text-placeholder placeholder:font-medium tracking-tight" />
      </div>
    </div>
  );
}

/* ---------- 인증번호 6자리 ---------- */
export function OtpField({
  value, onChange, error,
}: { value: string; onChange: (v: string) => void; error?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const cells = Array.from({ length: OTP_LEN });
  return (
    <button type="button" className="block w-full text-left" onClick={() => ref.current?.focus()}>
      <div className="relative">
        <input ref={ref} type="tel" inputMode="numeric" autoComplete="one-time-code"
          aria-label="인증번호 6자리" maxLength={OTP_LEN} value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, OTP_LEN))}
          className="absolute inset-0 h-full w-full opacity-0" />
        <div className="flex gap-2 justify-between" aria-hidden>
          {cells.map((_, i) => {
            const filled = i < value.length;
            const active = i === value.length;
            return (
              <span key={i}
                className={cn("grid place-items-center h-[54px] flex-1 rounded-[14px] border-[1.5px] text-[20px] font-extrabold text-ink transition-colors",
                  error ? "border-danger bg-danger-weak"
                    : active ? "border-accent bg-accent-weak"
                    : filled ? "border-accent bg-surface" : "border-line bg-surface")}>
                {value[i] ?? ""}
              </span>
            );
          })}
        </div>
      </div>
    </button>
  );
}

/* ---------- 초대코드 ---------- */
export function InviteCodeField({
  value, onChange, invalid,
}: { value: string; onChange: (v: string) => void; invalid?: boolean }) {
  return (
    <div>
      <label className="block text-[13px] font-semibold text-ink2 mb-2">학원 초대코드</label>
      <input aria-label="학원 초대코드" autoCapitalize="characters" autoComplete="off"
        placeholder="예: WG2025" value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 12))}
        className={cn("w-full h-[54px] rounded-[14px] border-[1.5px] bg-surface px-4 text-[18px] font-extrabold tracking-[0.15em] text-ink placeholder:text-placeholder placeholder:tracking-normal placeholder:font-medium",
          invalid ? "border-danger bg-danger-weak" : "border-line")} />
    </div>
  );
}

/* ---------- 학원 확인 뱃지 ---------- */
export function AcademyBadge({ academy }: { academy: Academy }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-accent/30 bg-accent-weak p-4">
      <span className="grid place-items-center w-11 h-11 rounded-xl text-white font-extrabold shrink-0"
        style={{ background: academy.theme }}>{academy.name.slice(0, 1)}</span>
      <div className="min-w-0">
        <div className="text-[12px] font-bold text-brand">이 학원에 등록해요</div>
        <div className="text-[16px] font-extrabold text-ink truncate">{academy.name}</div>
      </div>
      <span aria-hidden className="ml-auto grid place-items-center w-6 h-6 rounded-full bg-accent text-white shrink-0">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5 9-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
    </div>
  );
}

/* ---------- 학원 선택(코드 없을 때) ---------- */
export function AcademyPickRow({ academy, selected, onSelect }: { academy: Academy; selected: boolean; onSelect: () => void }) {
  return (
    <button onClick={onSelect}
      className={cn("flex w-full items-center gap-3 rounded-2xl border-[1.5px] px-4 py-3.5 text-left transition",
        selected ? "border-accent bg-accent-weak" : "border-line bg-surface")}>
      <span className="grid place-items-center w-10 h-10 rounded-xl text-white font-extrabold shrink-0" style={{ background: academy.theme }}>{academy.name.slice(0, 1)}</span>
      <span className="flex-1 text-[15px] font-bold text-ink">{academy.name}</span>
      <span className={cn("w-5 h-5 rounded-full border-2 shrink-0", selected ? "border-accent bg-accent shadow-[inset_0_0_0_3px_#fff]" : "border-line2")} />
    </button>
  );
}

/* ---------- 약관 리스트 ---------- */
export function AgreementList({
  items, agreed, onToggle, onAll,
}: { items: Agreement[]; agreed: Record<string, boolean>; onToggle: (id: string) => void; onAll: (on: boolean) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const allOn = items.every((it) => agreed[it.id]);
  return (
    <div>
      <button onClick={() => onAll(!allOn)}
        className={cn("flex w-full items-center gap-3 rounded-2xl border-[1.5px] px-4 py-4 text-left transition",
          allOn ? "border-accent bg-accent-weak" : "border-line bg-surface")}>
        <CheckDot on={allOn} />
        <span className="text-[15.5px] font-extrabold text-ink">약관 전체에 동의합니다</span>
      </button>
      <div className="mt-2 rounded-2xl border border-line bg-surface divide-y divide-line2">
        {items.map((it) => (
          <div key={it.id}>
            <div className="flex items-center gap-3 px-4 py-3.5">
              <button onClick={() => onToggle(it.id)} aria-pressed={!!agreed[it.id]} className="flex items-center gap-3 flex-1 text-left min-h-11">
                <CheckDot on={!!agreed[it.id]} small />
                <span className="text-[14px] font-semibold text-ink">
                  <span className={cn("mr-1.5 text-[12px] font-bold", it.required ? "text-accent-ink" : "text-ink3")}>[{it.required ? "필수" : "선택"}]</span>
                  {it.label}
                </span>
              </button>
              <button onClick={() => setOpen(open === it.id ? null : it.id)} aria-label={`${it.label} 상세 보기`}
                className={cn("grid place-items-center min-w-11 min-h-11 text-ink3 transition-transform", open === it.id && "rotate-180")}>
                <IconChevron size={18} />
              </button>
            </div>
            {open === it.id && <p className="px-4 pb-3.5 -mt-1 pl-[52px] text-[12.5px] text-ink2 font-medium leading-relaxed">{it.detail}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function CheckDot({ on, small }: { on: boolean; small?: boolean }) {
  return (
    <span className={cn("grid place-items-center rounded-full shrink-0 transition-colors",
      small ? "w-[22px] h-[22px]" : "w-6 h-6",
      on ? "bg-accent text-white" : "border-2 border-line2 bg-surface text-transparent")}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M5 12l5 5 9-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/* ---------- 프로그램 선택(칩) ---------- */
export function ProgramPicker({ programs, value, onPick }: { programs: Program[]; value: string; onPick: (id: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="프로그램 선택">
      {programs.map((p) => {
        const on = value === p.id;
        return (
          <button key={p.id} onClick={() => onPick(p.id)} aria-pressed={on}
            className={cn("rounded-full border-[1.5px] px-3.5 min-h-11 text-[13.5px] font-bold transition",
              on ? "border-accent bg-accent-weak text-accent-ink" : "border-line bg-surface text-ink2")}>
            {p.label}{p.hint && <span className="ml-1 text-[11px] font-semibold opacity-70">{p.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- 아이 등록 카드(부모 직접 입력) ---------- */
export function ChildFormCard({
  index, child, programs, onChange, onRemove,
}: {
  index: number; child: ChildDraft; programs: Program[];
  onChange: (patch: Partial<ChildDraft>) => void; onRemove?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[14px] font-extrabold text-ink">아이 {index + 1}</h3>
        {onRemove && (
          <button onClick={onRemove} className="min-h-11 -my-2 px-1 text-[12.5px] font-semibold text-ink3 hover:text-danger-ink transition">삭제</button>
        )}
      </div>
      <div className="space-y-3">
        <div>
          <label className="block text-[12.5px] font-semibold text-ink2 mb-1.5">이름</label>
          <input aria-label={`아이 ${index + 1} 이름`} placeholder="아이 이름" value={child.name}
            onChange={(e) => onChange({ name: e.target.value.slice(0, 20) })}
            className="w-full h-[48px] rounded-xl border border-line bg-surface px-3.5 text-[15px] font-semibold text-ink placeholder:text-placeholder placeholder:font-medium" />
        </div>
        <div>
          <label className="block text-[12.5px] font-semibold text-ink2 mb-1.5">생년월일</label>
          <input type="date" aria-label={`아이 ${index + 1} 생년월일`} value={child.birth}
            onChange={(e) => onChange({ birth: e.target.value })}
            className="w-full h-[48px] rounded-xl border border-line bg-surface px-3.5 text-[15px] font-semibold text-ink" />
        </div>
        <div>
          <label className="block text-[12.5px] font-semibold text-ink2 mb-1.5">프로그램</label>
          <ProgramPicker programs={programs} value={child.programId} onPick={(id) => onChange({ programId: id })} />
        </div>
      </div>
    </div>
  );
}

/* ---------- 권한 가치 안내 ---------- */
export function PermissionGuide({ items }: { items: string[] }) {
  return (
    <ul className="rounded-2xl border border-line bg-surface p-4 space-y-3">
      {items.map((t, i) => (
        <li key={i} className="flex items-start gap-2.5 text-[14.5px] font-semibold text-ink">
          <span aria-hidden className="grid place-items-center w-6 h-6 rounded-full bg-accent-weak text-accent-ink shrink-0 mt-px">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5 9-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <span className="leading-snug">{t}</span>
        </li>
      ))}
    </ul>
  );
}

export function NoteCard({ icon, children }: { icon?: string; children: ReactNode }) {
  return (
    <div className="flex gap-2.5 items-start rounded-2xl bg-fill border border-line2 p-3.5 text-[12.5px] text-ink2 font-medium leading-relaxed">
      {icon && <span aria-hidden className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </div>
  );
}
