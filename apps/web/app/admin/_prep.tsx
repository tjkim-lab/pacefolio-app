import Link from "next/link";

/* 확장 · 준비 중 모듈 플레이스홀더 (파일럿 이후 오픈) — 비클라이언트 */
export function PrepPlaceholder({
  name,
  desc,
  points,
}: {
  name: string;
  desc: string;
  points: string[];
}) {
  return (
    <div className="max-w-2xl">
      <div className="rounded-2xl bg-surface border border-line p-6">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-fill text-ink3 text-[11px] font-extrabold px-2.5 py-1">
          준비 중 · 파일럿 이후 오픈
        </div>
        <h2 className="text-[20px] font-extrabold tracking-tight mt-3">{name}</h2>
        <p className="text-[13px] text-ink2 font-medium mt-1.5 leading-relaxed">{desc}</p>
        <ul className="mt-4 space-y-2">
          {points.map((p) => (
            <li key={p} className="flex gap-2 text-[12.5px] text-ink2 font-medium leading-relaxed">
              <span className="text-accent-ink shrink-0">•</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
        <Link href="/admin" className="inline-block mt-5 text-[12.5px] text-brand font-bold">
          ← 통합 홈으로
        </Link>
      </div>
    </div>
  );
}
