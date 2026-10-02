import { AnimatePresence, m, useDragControls } from 'motion/react';
import { Notice } from '@qafe/ui';
import { X } from 'lucide-react';
import { useContext, useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CurrentNoticeContext } from '../lib/notice';
import { spring } from './spring';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Full-bleed content above the title (an item's photo). */
  cover?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * The guest's panel: slides up from the bottom and closes by dragging the handle down, by Esc
 * or by tapping outside. Built on the native <dialog> (focus trap, inert page); the dialog
 * closes only after the slide-out finishes.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  description,
  cover,
  children,
  footer,
}: BottomSheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const drag = useDragControls();
  const { t } = useTranslation();
  const titleId = useId();
  const notice = useContext(CurrentNoticeContext);

  useEffect(() => {
    const dialog = ref.current;
    if (open && dialog && !dialog.open) dialog.showModal();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // Esc: run the slide-out first; the dialog closes when it is done.
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // Some browsers close anyway after a second Esc: keep the state in step.
      onClose={(e) => {
        if (e.target === ref.current && open) onClose();
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-transparent p-0 backdrop:bg-transparent"
    >
      <AnimatePresence onExitComplete={() => ref.current?.close()}>
        {open && (
          <m.div
            key="scrim"
            className="fixed inset-0 bg-navy-950/55 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
        )}
        {open && (
          <m.div
            key="panel"
            className="fixed inset-x-0 bottom-0 mx-auto flex max-h-[92dvh] max-w-2xl flex-col overflow-hidden rounded-t-[28px] bg-canvas shadow-[0_-12px_40px_rgb(0_0_0/0.18)]"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={spring}
            drag="y"
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 600) onClose();
            }}
          >
            <div
              className="absolute inset-x-0 top-0 z-10 flex h-7 cursor-grab touch-none justify-center pt-2.5 active:cursor-grabbing"
              onPointerDown={(e) => drag.start(e)}
            >
              <span className="h-1.5 w-11 rounded-full bg-line-strong/80" />
            </div>
            {notice && (
              <div className="absolute inset-x-3 top-8 z-20 rounded-xl bg-surface shadow-lg">
                <Notice notice={notice} />
              </div>
            )}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {cover}
              <header
                className="flex touch-none items-start justify-between gap-4 px-5 pt-7 pb-4"
                onPointerDown={(e) => drag.start(e)}
              >
                <div className="min-w-0">
                  <h2 id={titleId} className="font-display text-xl font-semibold text-ink">
                    {title}
                  </h2>
                  {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  onPointerDown={(e) => e.stopPropagation()}
                  aria-label={t('common.close')}
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-muted hover:text-ink"
                >
                  <X className="size-4" />
                </button>
              </header>
              <div className="px-5 pb-6">{children}</div>
            </div>
            {footer && (
              <footer className="pb-safe border-t border-line bg-surface/95 px-5 pt-4 backdrop-blur">
                <div className="pb-4">{footer}</div>
              </footer>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </dialog>
  );
}
