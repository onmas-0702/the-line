"use client";

// 더 라인 플랫폼의 대표 페이지(/) — 모바일 우선.
//   1. 상단 중앙: 플랫폼 표기(로고 자리)
//   2. 그 아래 오른쪽: 로그인 · 회원가입
//   3. 중심부: 최신 / 많이 들은 / 자주 듣는 메신저 콘텐츠 (옆으로 넘겨보기, 개수 조절)
//   4. 배너 광고 · 영상 콘텐츠 자리(준비 중)
//   5. 하단: 제작사 정보 · 환불정책 · 연락처

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import FeedRow from "@/components/landing/FeedRow";
import PlatformFooter from "@/components/landing/PlatformFooter";
import { AudioRepository } from "@/lib/audioStorage";
import { Channel, ChannelRepository, ChannelSlug } from "@/lib/channel";
import { ChannelThumbnails, FeedSections, ListeningHistory } from "@/lib/feed";
import { AudioMapper } from "@/lib/mappers";
import { SiteSettingsRepository } from "@/lib/siteSettings";
import { initialAudios, PLATFORM_TITLE } from "@/lib/mockData";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

const COUNT_STORAGE_KEY = "the-line:landing:count";

function loadSavedCount() {
  try {
    const saved = Number(window.localStorage.getItem(COUNT_STORAGE_KEY));
    return FeedSections.COUNT_OPTIONS.includes(saved) ? saved : FeedSections.DEFAULT_COUNT;
  } catch (e) {
    return FeedSections.DEFAULT_COUNT;
  }
}

/** 콘텐츠마다 "눌렀을 때 갈 주소"와 카드 표지 이미지를 붙입니다. 채널을 알 수 없으면
 *  (채널 구조 적용 전, 샘플 데이터) 지금 유일한 제작 채널인 기본 채널로 보냅니다. */
function withHref(audios, slugMap = new Map(), thumbnails = new ChannelThumbnails()) {
  return audios.map((a) => ({
    ...a,
    href: Channel.contentHref(slugMap.get(a.channelId) || ChannelSlug.DEFAULT, a.id),
    thumbnailUrl: thumbnails.for(a.channelId),
  }));
}

/** 전체 채널의 나눔 — 채널 구분 없는 저장소로 불러오고, Supabase가 없으면 샘플 데이터. */
function usePlatformFeed() {
  const repository = useMemo(() => new AudioRepository(), []);
  const [audios, setAudios] = useState(isSupabaseConfigured ? [] : withHref(initialAudios));
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;
    Promise.all([
      repository.list(),
      new ChannelRepository().slugMap(),
      new SiteSettingsRepository().listAll(),
    ]).then(([result, channels, settings]) => {
      if (cancelled) return;
      const thumbnails = new ChannelThumbnails(settings.rows);
      setAudios(
        result.ok
          ? withHref(result.rows.map(AudioMapper.fromRow), channels.map, thumbnails)
          : withHref(initialAudios)
      );
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [repository]);

  // 재생이 시작되면 화면의 청취수도 바로 1 올립니다(서버에는 recordPlay로 반영).
  function bumpPlays(id) {
    setAudios((prev) => prev.map((a) => (a.id === id ? { ...a, plays: (a.plays || 0) + 1 } : a)));
  }

  return { audios, isLoading, repository, bumpPlays };
}

function CountSelector({ value, onChange }) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-stone-100 p-0.5 text-xs" role="group" aria-label="목록 개수">
      {FeedSections.COUNT_OPTIONS.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-pressed={value === n}
          className={`rounded-full px-2.5 py-1 tabular-nums transition ${
            value === n ? "bg-white font-semibold text-stone-900 shadow-sm" : "text-stone-500"
          }`}
        >
          {n}개
        </button>
      ))}
    </div>
  );
}

export default function LandingPage() {
  const { audios, isLoading, repository, bumpPlays } = usePlatformFeed();
  const [count, setCount] = useState(FeedSections.DEFAULT_COUNT);
  const [playingId, setPlayingId] = useState(null);
  const [history, setHistory] = useState(null);
  const audioRef = useRef(null);

  // localStorage는 브라우저에서만 읽을 수 있어서, 첫 화면을 그린 직후에 불러옵니다.
  useEffect(() => {
    const timer = setTimeout(() => {
      setCount(loadSavedCount());
      setHistory(ListeningHistory.load());
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  function changeCount(n) {
    setCount(n);
    try {
      window.localStorage.setItem(COUNT_STORAGE_KEY, String(n));
    } catch (e) {
      // 저장 불가 — 이번 방문 동안만 적용됩니다.
    }
  }

  // 하나의 오디오 엘리먼트를 재사용합니다. 재생 중인 걸 다시 누르면 정지, 다른 걸
  // 누르면 그걸로 바꿔서 처음부터 재생하고, 그때 청취수와 들은 기록을 남깁니다.
  function togglePlay(item) {
    const el = audioRef.current;
    if (!item?.previewUrl || !el) return;
    if (playingId === item.id) {
      el.pause();
      setPlayingId(null);
      return;
    }
    el.pause();
    el.src = item.previewUrl;
    el.currentTime = 0;
    el.play().catch(() => {});
    setPlayingId(item.id);

    bumpPlays(item.id);
    repository.recordPlay(item.id).catch(() => {});
    setHistory((history ?? ListeningHistory.load()).record(item));
  }

  const sections = new FeedSections(audios);
  const favorites = history ? sections.favoriteMessengers(history, count) : { items: [], personalized: false };
  const rowProps = { playingId, onTogglePlay: togglePlay };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col bg-stone-50">
      <header className="px-4 pt-8">
        <h1 className="text-center text-2xl font-bold tracking-tight text-stone-900">{PLATFORM_TITLE}</h1>
        <div className="mt-4 flex justify-end gap-2">
          <Link
            href="/login"
            className="rounded-full border border-stone-300 bg-white px-4 py-1.5 text-sm font-medium text-stone-600 transition hover:bg-stone-100"
          >
            로그인
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-amber-700 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-amber-800"
          >
            회원가입
          </Link>
        </div>
      </header>

      <main className="mt-4 flex-1">
        <div className="flex items-center justify-between px-4">
          <p className="text-xs text-stone-400">{isLoading ? "콘텐츠를 불러오는 중…" : "옆으로 넘겨서 더 보기"}</p>
          <CountSelector value={count} onChange={changeCount} />
        </div>

        <FeedRow
          title="최신 콘텐츠"
          items={sections.latest(count)}
          emptyText="아직 등록된 나눔이 없습니다."
          {...rowProps}
        />
        <FeedRow
          title="많이 들은 콘텐츠"
          items={sections.popular(count)}
          ranked
          emptyText="아직 청취 기록이 없습니다."
          {...rowProps}
        />
        <FeedRow
          title="자주 듣는 메신저"
          subtitle={
            favorites.personalized
              ? "내가 자주 들은 메신저의 나눔이에요."
              : "나눔을 들을수록 내가 자주 듣는 메신저의 나눔이 모여요. 지금은 인기 메신저 순이에요."
          }
          items={favorites.items}
          emptyText="아직 보여드릴 메신저 콘텐츠가 없습니다."
          {...rowProps}
        />

        {/* 배너 광고 · 영상 콘텐츠 자리 — 추후 진행 */}
        <section className="px-4 py-4" aria-label="배너">
          <div className="flex aspect-[16/7] w-full items-center justify-center rounded-2xl border-2 border-dashed border-stone-300 bg-white text-xs text-stone-400">
            배너 광고 · 영상 콘텐츠 영역 (준비 중)
          </div>
        </section>
      </main>

      <PlatformFooter />

      <audio ref={audioRef} onEnded={() => setPlayingId(null)} className="hidden" />
    </div>
  );
}
