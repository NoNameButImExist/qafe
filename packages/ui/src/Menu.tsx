import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';

interface MenuProps {
  label: string;
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  className?: string;
}

const GAP = 6;

/**
 * Popover menu rendered in a portal with fixed positioning, so scroll containers
 * (tables, cards) never clip it. Opens upwards when there is no room below.
 * Closes on outside click, Esc, scroll and resize.
 */
export function Menu({ label, trigger, children, className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return;
    const anchor = triggerRef.current.getBoundingClientRect();
    const height = menuRef.current.offsetHeight;
    const below = window.innerHeight - anchor.bottom;
    const openUp = below < height + GAP && anchor.top > below;
    setStyle({
      position: 'fixed',
      right: Math.max(8, window.innerWidth - anchor.right),
      ...(openUp
        ? { bottom: window.innerHeight - anchor.top + GAP }
        : { top: anchor.bottom + GAP }),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setStyle({ visibility: 'hidden' });
          setOpen((o) => !o);
        }}
        className={className}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={style}
            className={cn(
              'z-50 min-w-48 rounded-xl border border-line bg-surface py-1.5 shadow-xl shadow-navy-950/15',
            )}
          >
            {children(() => setOpen(false))}
          </div>,
          document.body,
        )}
    </>
  );
}

export function MenuItem({
  onSelect,
  icon,
  children,
  tone = 'default',
}: {
  onSelect: () => void;
  icon?: ReactNode;
  children: ReactNode;
  tone?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors',
        tone === 'danger' ? 'text-danger hover:bg-danger/10' : 'text-ink hover:bg-surface-2',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
