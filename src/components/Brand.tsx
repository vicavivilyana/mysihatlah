/**
 * Brand assets. The mark is a PLACEHOLDER built in code so it ships on-brand
 * today and can be swapped for a designed asset by replacing this one file
 * (nothing else imports the SVG internals).
 *
 * Concept: a heart whose left lobe carries the Malaysian crescent + star in
 * gold, with a navy human figure standing at its centre.
 */
export function Logo({ size = 40, className = '' }: { size?: number; className?: string }) {
  const id = 'mslmark';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label="MySihatLah"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Crescent = big circle minus an offset circle. */}
        <mask id={`${id}-crescent`}>
          <rect width="48" height="48" fill="black" />
          <circle cx="17.5" cy="20" r="7.4" fill="white" />
          <circle cx="21" cy="18.6" r="6.4" fill="black" />
        </mask>
        {/* Keep the figure from painting outside the heart. */}
        <clipPath id={`${id}-heart`}>
          <path d="M24 41.5C9.5 30.8 4.6 21.6 9.8 14.6c4.3-5.8 11.4-4.4 14.2.9 2.8-5.3 9.9-6.7 14.2-.9 5.2 7 .3 16.2-14.2 26.9Z" />
        </clipPath>
      </defs>

      {/* Heart body */}
      <path
        d="M24 41.5C9.5 30.8 4.6 21.6 9.8 14.6c4.3-5.8 11.4-4.4 14.2.9 2.8-5.3 9.9-6.7 14.2-.9 5.2 7 .3 16.2-14.2 26.9Z"
        fill="#12235c"
      />

      <g clipPath={`url(#${id}-heart)`}>
        {/* Crescent + star, in flag gold */}
        <circle cx="17.5" cy="20" r="7.4" fill="#e7b942" mask={`url(#${id}-crescent)`} />
        <path
          d="m30.2 15.1 1.28 2.72 2.92.42-2.1 2.1.5 2.96-2.6-1.4-2.6 1.4.5-2.96-2.1-2.1 2.92-.42Z"
          fill="#e7b942"
        />
        {/* Human figure standing at the centre */}
        <g fill="#f5f6fa">
          <circle cx="24" cy="26.4" r="2.9" />
          <path d="M24 30.2c3.5 0 6 2.3 6 5.6v5.8H18v-5.8c0-3.3 2.5-5.6 6-5.6Z" />
        </g>
      </g>
    </svg>
  );
}

/**
 * "My" + "Sihat" (gold) + "Lah" — Playfair Display.
 * `tone="light"` for use on the navy header.
 */
export function Wordmark({
  className = 'text-xl',
  tone = 'navy',
}: {
  className?: string;
  tone?: 'navy' | 'light';
}) {
  return (
    <span className={`font-serif font-bold tracking-tight ${tone === 'light' ? 'text-white' : 'text-navy'} ${className}`}>
      My<span className="text-gold-light">Sihat</span>Lah
    </span>
  );
}

export function BrandLockup({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <Logo size={size} />
      <Wordmark />
    </div>
  );
}
