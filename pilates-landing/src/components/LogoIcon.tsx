interface LogoIconProps {
  className?: string;
}

/** Abstract spine / breath mark for Let's Pilates LA. */
export default function LogoIcon({ className = '' }: LogoIconProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M16 3c5 4 5 8 1 12-4 4-4 8 0 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M16 3c-5 4-5 8-1 12 4 4 4 8 0 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  );
}
