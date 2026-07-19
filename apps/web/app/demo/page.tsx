import Link from "next/link";
import { academy } from "@/lib/mock/data";
import {
  IconUser,
  IconUsers,
  IconWhistle,
  IconBuilding,
  IconGrid,
  IconChevron,
} from "@/components/ui/icons";

/* 개발·검토용 역할 허브 (R3 P1-7: 루트에서 분리 — 루트는 로그인).
   실서비스에서는 이 라우트를 비활성화한다(route guard 계약 docs/10). */

const apps = [
  {
    group: "모바일 앱",
    items: [
      { href: "/owner", emoji: "🏫", label: "원장 앱", desc: "수납·원생·수업을 손안에서", icon: IconUser, tone: "#12b5a5" },
      { href: "/parent", emoji: "👨‍👩‍👧", label: "학부모 앱", desc: "아이 · 결제 · 알림", icon: IconUsers, tone: "#3b82f6" },
      { href: "/coach", emoji: "🏃", label: "코치 앱", desc: "수업 · 커리큘럼 · 출결", icon: IconWhistle, tone: "#f97316" },
    ],
  },
  {
    group: "데스크톱 콘솔",
    items: [
      { href: "/pc", emoji: "🖥️", label: "원장 PC 콘솔", desc: "운영 관리의 중심", icon: IconBuilding, tone: "#8b5cf6" },
      /* B5(#54): admin 은 분리 배포(apps/console-admin, dev :3002) — 절대 URL 진입 */
      { href: "http://localhost:3002/admin", emoji: "⚙️", label: "관리자 콘솔 (분리 배포)", desc: "멀티테넌트 · 플랫폼 운영 · :3002", icon: IconGrid, tone: "#0e9384" },
    ],
  },
];

export default function DemoHub() {
  return (
    <div className="min-h-screen flex flex-col items-center px-5 py-16">
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-3xl">{academy.logoEmoji}</span>
          <span className="text-sm font-semibold text-accent bg-accent-weak px-2.5 py-1 rounded-full">
            데모 전용 · PROTOTYPE
          </span>
        </div>
        <h1 className="text-[34px] font-extrabold tracking-tight text-ink">
          PACEFOLIO
        </h1>
        <p className="text-ink2 mt-1 text-[15px]">
          유소년 스포츠·교육 아카데미 운영 플랫폼 · 데모({academy.name})
        </p>

        {apps.map((sec) => (
          <section key={sec.group} className="mt-9">
            <h2 className="text-[13px] font-bold text-ink3 mb-3 px-1">
              {sec.group}
            </h2>
            <div className="space-y-2.5">
              {sec.items.map((a) => {
                const Icon = a.icon;
                return (
                  <Link
                    key={a.href}
                    href={a.href}
                    className="group flex items-center gap-4 rounded-2xl bg-surface border border-line p-4 hover:border-accent hover:shadow-sm transition"
                  >
                    <div
                      className="flex items-center justify-center w-12 h-12 rounded-2xl text-white shrink-0"
                      style={{ background: a.tone }}
                    >
                      <Icon size={24} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[16px] font-bold text-ink">
                          {a.label}
                        </span>
                        <span className="text-lg">{a.emoji}</span>
                      </div>
                      <div className="text-[13px] text-ink3 mt-0.5">{a.desc}</div>
                    </div>
                    <IconChevron
                      size={20}
                      className="text-ink3 group-hover:text-accent transition"
                    />
                  </Link>
                );
              })}
            </div>
          </section>
        ))}

        <p className="text-[12px] text-ink3 mt-12 text-center leading-relaxed">
          같은 디자인 시스템 · 같은 데이터로 5개 앱이 함께 구동됩니다.
          <br />
          DB 없음(mock) · 헌법 준수: 목업 확정 전 DB 착공 금지 ·{" "}
          <Link href="/" className="underline hover:text-accent">로그인 화면 보기</Link>
        </p>
      </div>
    </div>
  );
}
