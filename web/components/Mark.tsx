/** The mark: a star, and the first collectors of a swarm closing around it. */
export function Mark({ size = 24 }: { size?: number }) {
  const dots = Array.from({ length: 11 }, (_, i) => {
    const a = (-0.35 + (i / 10) * 1.55) * Math.PI;
    return [12 + Math.cos(a) * 9.2, 12 + Math.sin(a) * 9.2, 1.05 - i * 0.04] as const;
  });
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className="mark"
    >
      <circle cx="12" cy="12" r="4.4" fill="var(--accent)" />
      {dots.map(([x, y, r], i) => (
        <circle
          key={i}
          cx={x.toFixed(2)}
          cy={y.toFixed(2)}
          r={r.toFixed(2)}
          fill="currentColor"
          opacity={0.5 + i * 0.05}
        />
      ))}
    </svg>
  );
}
