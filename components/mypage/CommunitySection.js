"use client";

// 오픈채팅 참여 — 채널 운영자가 스튜디오에 등록한 카카오톡 오픈채팅 링크와 참여코드.

import { useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { LoadState, useLoaded, useMyPageRepos } from "@/components/mypage/useMyPageData";

export default function CommunitySection() {
  const repos = useMyPageRepos();
  const { result, isLoading } = useLoaded(() => repos.community.list(), [repos]);
  const rooms = (result?.items || []).filter((info) => info.isReady);

  return (
    <LoadState isLoading={isLoading} result={result} empty={rooms.length === 0 && "아직 열린 오픈채팅방이 없어요."}>
      <ul className="space-y-3">
        {rooms.map((info) => (
          <CommunityCard key={info.channelId} info={info} />
        ))}
      </ul>
      <p className="mt-3 text-xs leading-relaxed text-stone-400">
        참여코드는 구독자에게만 보여요. 다른 분께 링크나 코드를 공유하지 말아 주세요. 구독이 끝나면 운영자가 방에서 안내드릴 수 있어요.
      </p>
    </LoadState>
  );
}

function CommunityCard({ info }) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(info.entryCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드를 못 쓰는 브라우저 — 화면의 코드를 직접 보고 입력하면 됩니다.
    }
  }

  return (
    <li className="rounded-2xl border border-stone-200 bg-white p-4">
      <p className="text-sm font-semibold text-stone-800">{info.channelName} 오픈채팅</p>
      {info.guide && <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-stone-500">{info.guide}</p>}
      {info.entryCode && (
        <div className="mt-3 flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2">
          <span className="text-xs text-stone-500">
            참여코드 <span className="ml-1 font-mono text-sm font-semibold tracking-wider text-stone-800">{info.entryCode}</span>
          </span>
          <button type="button" onClick={copyCode} className="flex items-center gap-1 text-xs font-medium text-amber-700">
            <Copy size={12} /> {copied ? "복사됨" : "복사"}
          </button>
        </div>
      )}
      <a
        href={info.openChatUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#FEE500] py-2.5 text-sm font-semibold text-stone-900 transition hover:brightness-95"
      >
        카카오톡 오픈채팅 들어가기 <ExternalLink size={14} />
      </a>
    </li>
  );
}
