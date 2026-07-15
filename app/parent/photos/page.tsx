"use client";

import { AppScroll } from "@/components/mobile/MobileShell";
import { useParent } from "../_state";
import { NoteRow, PushHeader } from "../_components";

export default function PhotosPage() {
  const { detail } = useParent();
  const photos = detail.report.photos;
  return (
    <>
      <PushHeader title="수업 사진" sub={`${detail.lesson.sub.split(" · ")[0]} · 10/20(월) · ${photos.length}장`} />
      <AppScroll>
        <div className="flex gap-1.5">
          {photos.map((p, i) => <div key={i} className="flex-1 aspect-square rounded-xl bg-fill grid place-items-center text-4xl">{p}</div>)}
        </div>
        <NoteRow icon="cam">반 사진에는 <b className="text-ink">게시 동의를 받은 원생만</b> 포함돼요. 우리 반 학부모만 볼 수 있고, <b className="text-ink">다른 가정으로 재배포는 금지</b>예요. 저장 허용·보관 기간은 학원 설정을 따라요.</NoteRow>
        <NoteRow icon="lock">아이 얼굴 비공개를 원하시면 <b className="text-ink">우리 아이 탭 &gt; 동의 설정</b>에서 언제든 바꿀 수 있어요. 퇴원 후에는 접근이 차단돼요.</NoteRow>
      </AppScroll>
    </>
  );
}
