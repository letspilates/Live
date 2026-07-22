interface HeadingProps {
  /** Title fragments, rendered inline and space-joined; wraps responsively. */
  parts: string[];
  /** Index of the fragment to paint in the sage accent color. */
  accent?: number;
}

/** Renders a multi-part headline with one optional accent-colored fragment. */
export default function Heading({ parts, accent }: HeadingProps) {
  return (
    <>
      {parts.map((p, i) => (
        <span key={i} className={i === accent ? 'text-sage' : undefined}>
          {i > 0 ? ' ' : ''}
          {p}
        </span>
      ))}
    </>
  );
}
