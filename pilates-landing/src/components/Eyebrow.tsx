interface EyebrowProps {
  children: React.ReactNode;
  className?: string;
}

/** Microscopic pill badge that precedes major headings. */
export default function Eyebrow({ children, className = '' }: EyebrowProps) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-ink/10 bg-paper/60 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-sage backdrop-blur-sm ${className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-sage" />
      {children}
    </span>
  );
}
