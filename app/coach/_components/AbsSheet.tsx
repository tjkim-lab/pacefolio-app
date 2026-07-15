"use client";

/* 결석 예정(학부모 접수) → 실제 출결 확정 시트 */

import { useState } from "react";
import { useCoach } from "../_state";
import { ABS_WHY } from "../_data";
import { Sheet, Chip } from "./Bits";
import { Button } from "@/components/ui";

export default function AbsSheet() {
  const { absKid, closeAbs, resolveAbs } = useCoach();
  const [why, setWhy] = useState(ABS_WHY[0]);

  return (
    <Sheet
      open={!!absKid}
      onClose={closeAbs}
      z="z-[400]"
      title={`${absKid ?? ""} · 실제 출결 확정`}
      sub={
        <>
          학부모가 <b className="text-ink">결석 예정(아파요)</b>으로 접수했어요. 예정은 참고용이고{" "}
          <b className="text-ink">실제 출결은 코치가 확정</b>해요 — 사유·이력이 남고 학부모·원장 화면에 반영돼요.
        </>
      }
    >
      <div className="flex flex-wrap gap-1.5 mt-3">
        {ABS_WHY.map((w) => (
          <Chip key={w} on={why === w} onClick={() => setWhy(w)}>
            {w}
          </Chip>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <Button variant="primary" onClick={() => resolveAbs("p", "출석", why)}>
          실제 출석 ○
        </Button>
        <Button variant="ghost" onClick={() => resolveAbs("l", "지각", why)}>
          지각 △
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <Button variant="ghost" onClick={() => resolveAbs("a", "결석", why)}>
          결석 확정 ✕
        </Button>
        <Button variant="ghost" onClick={closeAbs}>
          나중에
        </Button>
      </div>
    </Sheet>
  );
}
