// 공유하기 아이콘 — 오른쪽으로 휘어 나가는 굵은 화살표(속이 빈 외곽선). lucide 아이콘과 같은 props를 받습니다.

export default function ShareArrowIcon({ size = 24, strokeWidth = 1.75, className = "", ...rest }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      <path d="M21.5 10.5 14 3.5v4C8.6 7.6 4.2 11.2 3.5 19.5c2-3.9 5.3-5.6 10.5-5.6v4.1z" fill="none" />
    </svg>
  );
}
