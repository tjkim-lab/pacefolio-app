"use client";

import { PCShell } from "../_shell";
import { Card } from "@/components/ui";
import { IconChevron, IconSettings } from "@/components/ui/icons";
import { Note } from "../_ui";
import { SETTINGS_ROWS } from "../_data";

export default function PCSettings() {
  return (
    <PCShell title="설정" actions={<span className="text-[12.5px] text-ink3 font-medium">원더짐 아카데미</span>}>
      <Card className="max-w-[640px]" pad={false}>
        {SETTINGS_ROWS.map((r) => (
          <button
            key={r.label}
            className="w-full flex items-baseline justify-between gap-2.5 px-4 py-3 border-b border-line2 last:border-0 text-left hover:bg-fill transition"
          >
            <span className="text-[13px] text-ink2 font-medium">
              {r.label}
              <small className="block text-[11px] text-ink3 font-medium mt-0.5">{r.sub}</small>
            </span>
            <IconChevron size={15} className="text-ink3 shrink-0" />
          </button>
        ))}
      </Card>

      <div className="max-w-[640px]">
        <Note icon={<IconSettings size={16} />}>
          원장: 전체 접근·수납·환불·권한 승인 / 데스크: 원생·출결 운영, 제한된 수납 / 코치: 담당 반 원생과 안전 정보만 / 차량 담당: 해당 운행 탑승 정보만. <b className="text-ink font-bold">금액은 개인정보</b> — 채팅방·잠금화면에 표시되지 않아요.
        </Note>
      </div>
    </PCShell>
  );
}
