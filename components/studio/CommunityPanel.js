"use client";

// 스튜디오 → 공지·커뮤니티 탭. 운영자가 구독자에게 보낼 공지를 쓰고, 카카오톡 오픈채팅
// 링크·참여코드를 등록합니다. 구독자는 마이 페이지에서 봅니다.

import { useEffect, useState } from "react";
import { useChannel } from "@/components/ChannelProvider";
import NoticeEditor from "@/components/community/NoticeEditor";
import { CommunityInfo } from "@/lib/community";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

const INPUT = "w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-600";

export default function CommunityPanel() {
  const { repos } = useChannel();
  if (!isSupabaseConfigured) {
    return <p className="text-sm text-stone-500">서버(Supabase)를 연결하면 공지와 오픈채팅을 관리할 수 있어요.</p>;
  }
  return (
    <div className="space-y-8">
      <NoticeEditor repo={repos.notices} />
      <OpenChatEditor />
    </div>
  );
}

function OpenChatEditor() {
  const { repos } = useChannel();
  const [info, setInfo] = useState(new CommunityInfo());
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    repos.community.fetch().then((result) => {
      if (!cancelled && result.ok) setInfo(result.info);
    });
    return () => {
      cancelled = true;
    };
  }, [repos]);

  async function save() {
    setMessage("");
    const result = await repos.community.save(info);
    setMessage(result.ok ? "저장했어요. 구독자의 마이 페이지 → 오픈채팅 참여에 보여요." : result.reason);
  }

  return (
    <section>
      <h2 className="text-base font-semibold text-stone-900">카카오톡 오픈채팅</h2>
      <p className="mt-1 text-sm text-stone-500">
        링크와 참여코드는 구독자에게만 보여요. 링크가 밖으로 퍼질 수 있으니 오픈채팅방에 참여코드를 걸고 가끔 바꿔주세요.
      </p>
      <div className="mt-3 space-y-2 rounded-2xl border border-stone-200 bg-white p-4">
        <input
          value={info.openChatUrl}
          onChange={(e) => setInfo(info.with({ openChatUrl: e.target.value }))}
          placeholder="https://open.kakao.com/o/..."
          className={INPUT}
        />
        <input
          value={info.entryCode}
          onChange={(e) => setInfo(info.with({ entryCode: e.target.value }))}
          placeholder="참여코드(선택)"
          maxLength={20}
          className={INPUT}
        />
        <textarea
          value={info.guide}
          onChange={(e) => setInfo(info.with({ guide: e.target.value }))}
          rows={3}
          maxLength={1000}
          placeholder="참여 안내(선택) — 예: 들어오시면 이름과 교회를 알려주세요."
          className={INPUT}
        />
        <div className="flex justify-end">
          <button type="button" onClick={save} className="rounded-full bg-amber-700 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-amber-800">
            저장
          </button>
        </div>
        {message && <p className="text-xs text-stone-600">{message}</p>}
      </div>
    </section>
  );
}
