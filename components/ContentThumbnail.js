// 콘텐츠 카드의 정사각형 표지 — 랜딩 페이지와 채널 페이지 카드가 함께 씁니다.
// 표지 이미지(콘텐츠 배경이미지 → 채널 기본 배경 이미지)가 없으면 메신저 이름으로 정해지는 은은한
// 색 그라데이션으로 채웁니다.

const COVER_TONES = [
  "from-amber-200 to-amber-400",
  "from-stone-200 to-stone-400",
  "from-orange-200 to-amber-300",
  "from-yellow-100 to-amber-300",
  "from-rose-100 to-orange-300",
];

export function coverTone(name = "") {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return COVER_TONES[hash % COVER_TONES.length];
}

export default function ContentThumbnail({ item, imageUrl, rank = null, showDuration = true, className = "" }) {
  return (
    <div
      className={`relative flex items-end overflow-hidden rounded-2xl bg-gradient-to-br bg-cover bg-center p-2.5 ${coverTone(item.pastorName)} ${className}`}
      style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
    >
      {imageUrl && (
        // 표지 이미지 위에서도 순위·재생 길이가 읽히도록 위아래만 살짝 어둡게
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/15" />
      )}
      {rank && <span className="absolute left-3 top-2 text-2xl font-bold text-white/90 drop-shadow">{rank}</span>}
      {showDuration && (
        <span className="relative rounded-full bg-black/35 px-2 py-0.5 text-[11px] tabular-nums text-white">
          {item.duration}
        </span>
      )}
    </div>
  );
}
