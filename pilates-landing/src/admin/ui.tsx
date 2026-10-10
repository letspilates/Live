// Shared admin UI built from the site's own tokens (tailwind.config.js).
// Shape rule: buttons and chips are pills, inputs 12px, cards 16px, dialogs 20px.
import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { CircleAlert, CircleCheck, Info, type LucideIcon } from 'lucide-react';
import LogoIcon from '../components/LogoIcon';

const ICON = { size: 18, strokeWidth: 1.75, 'aria-hidden': true } as const;

// Same input look as the public training form, but 16px text: iOS Safari zooms
// the page into any field smaller than that and stays zoomed afterwards.
export const inputCls =
  'w-full rounded-xl border border-ink/10 bg-cream/60 px-4 py-3 text-base text-ink outline-none transition-colors duration-200 focus:border-sage focus:bg-paper focus:ring-2 focus:ring-sage/20 disabled:opacity-60';
const inputErrorCls = 'border-red-700/50 ring-2 ring-red-700/10';

type Variant = 'primary' | 'secondary' | 'danger';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-sage text-cream hover:bg-sage-deep',
  secondary: 'bg-paper text-ink shadow-[0_1px_2px_rgb(var(--c-shadow)/0.06)] ring-1 ring-ink/[0.12] hover:bg-sand/50',
  danger: 'bg-red-700 text-white hover:bg-red-800',
};

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-sm font-medium transition-[background-color,transform] duration-200 ease-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function TextField({
  label,
  hint,
  error,
  trailing,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
  trailing?: ReactNode;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? noteId : undefined}
          className={`${inputCls} ${error ? inputErrorCls : ''} ${trailing ? 'pr-20' : ''}`}
          {...input}
        />
        {trailing && <div className="absolute inset-y-0 right-2 flex items-center">{trailing}</div>}
      </div>
      {(error || hint) && (
        <p id={noteId} className={`text-sm ${error ? 'text-red-700' : 'text-mute'}`}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

export function TextArea({
  label,
  hint,
  ...input
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <textarea
        id={id}
        rows={3}
        aria-describedby={hint ? `${id}-note` : undefined}
        className={`${inputCls} resize-y`}
        {...input}
      />
      {hint && (
        <p id={`${id}-note`} className="text-sm text-mute">
          {hint}
        </p>
      )}
    </div>
  );
}

export function Card({
  children,
  className = '',
  pad = true,
  label,
}: {
  children: ReactNode;
  className?: string;
  pad?: boolean;
  label?: string;
}) {
  return (
    <section
      aria-label={label}
      className={`rounded-[20px] bg-paper shadow-card ring-1 ring-ink/[0.05] ${pad ? 'p-5 sm:p-6' : ''} ${className}`}
    >
      {children}
    </section>
  );
}

const NOTICE = {
  error: { cls: 'bg-red-50 text-red-800 ring-red-700/20', Icon: CircleAlert, role: 'alert' },
  success: { cls: 'bg-sage/10 text-sage-deep ring-sage/25', Icon: CircleCheck, role: 'status' },
  info: { cls: 'bg-sand/70 text-ink ring-ink/10', Icon: Info, role: 'status' },
} as const;

/** Inline message with an icon, so meaning never rests on color alone. */
export function Notice({ tone, children }: { tone: keyof typeof NOTICE; children: ReactNode }) {
  const { cls, Icon, role } = NOTICE[tone];
  return (
    <div role={role} className={`flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm ring-1 ${cls}`}>
      <Icon {...ICON} className="mt-px shrink-0" />
      <div>{children}</div>
    </div>
  );
}

/** Full-screen centered card for sign-in and account-state screens. */
export function CenteredCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <LogoIcon className="h-8 w-8 text-sage" />
          <div>
            <p className="font-display text-lg font-semibold tracking-tightest text-ink">Let&rsquo;s Pilates LA</p>
            <p className="text-sm text-mute">Studio Admin</p>
          </div>
        </div>
        <Card>
          {title && <h1 className="mb-5 font-display text-xl font-semibold text-ink">{title}</h1>}
          {children}
        </Card>
      </div>
    </main>
  );
}

export function Splash({ label }: { label: string }) {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-canvas">
      <LogoIcon className="h-9 w-9 text-sage motion-safe:animate-pulse" />
      <p className="text-sm text-mute">{label}</p>
    </main>
  );
}

/** Placeholder bars shaped like the content that is loading. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`rounded-lg bg-ink/[0.06] motion-safe:animate-pulse ${className}`} />;
}

/** Native <dialog>: focus trap, Escape and backdrop come from the browser. */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="max-h-[calc(100dvh-2rem)] w-[min(calc(100%-2rem),28rem)] overflow-y-auto rounded-[20px] bg-paper p-0 text-ink shadow-pop backdrop:bg-ink/30"
    >
      <div className="p-6">
        <h2 className="mb-4 font-display text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}

export function Initials({ name, className = '' }: { name: string; className?: string }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-sage/15 font-semibold text-sage-deep ${className}`}
    >
      {letters || '?'}
    </span>
  );
}

/** A labelled number for summary cards (inside a <dl>). */
export function Stat({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col-reverse">
      <dt className="text-sm text-mute">{label}</dt>
      <dd className={`truncate font-display font-semibold tabular-nums ${strong ? 'text-2xl sm:text-3xl' : 'text-xl'}`}>{value}</dd>
    </div>
  );
}

export function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-ink/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40"
    >
      {children}
    </button>
  );
}

/** Card heading: small icon tile, title, optional link on the right (reference: Nexora / Finance cards). */
export function CardTitle({ icon: Icon, title, action }: { icon?: LucideIcon; title: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex min-h-8 items-center gap-3">
      {Icon && (
        <span aria-hidden="true" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sage/10 text-sage">
          <Icon size={16} strokeWidth={1.75} />
        </span>
      )}
      <h2 className="min-w-0 flex-1 truncate font-display text-base font-semibold text-ink">{title}</h2>
      {action}
    </div>
  );
}

const CHIP = {
  neutral: 'bg-ink/[0.05] text-mute before:bg-mute/60',
  good: 'bg-sage/10 text-sage-deep before:bg-sage',
  warn: 'bg-clay/15 text-ink before:bg-clay',
  bad: 'bg-red-700/10 text-red-800 before:bg-red-700',
} as const;

/** Status chip with a dot (reference: invoice list). Text always says the status, the dot only repeats it. */
export function Chip({ tone = 'neutral', children }: { tone?: keyof typeof CHIP; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium before:h-1.5 before:w-1.5 before:rounded-full before:content-[''] ${CHIP[tone]}`}
    >
      {children}
    </span>
  );
}
