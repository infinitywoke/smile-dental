// The tide line between a dark section and the page: two slow waves, the front one in the page's colour
export function Waves({ fill, top = false }: { fill: string; top?: boolean }) {
  return (
    <div className={`h-waves${top ? ' top' : ''}`} aria-hidden="true">
      <svg className="h-wave w2" viewBox="0 0 2880 150" preserveAspectRatio="none">
        <path d="M0 95 Q 240 60 480 95 T 960 95 T 1440 95 T 1920 95 T 2400 95 T 2880 95 V 150 H 0 Z" fill="#2B4E92" />
      </svg>
      <svg className="h-wave" viewBox="0 0 2880 150" preserveAspectRatio="none">
        <path d="M0 118 Q 360 92 720 118 T 1440 118 T 2160 118 T 2880 118 V 150 H 0 Z" fill={fill} />
      </svg>
    </div>
  )
}
