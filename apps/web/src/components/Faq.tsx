import { AnimatePresence, motion } from 'motion/react';
import { useId, useState } from 'react';
import { useI18n } from '../i18n/context';
import { PlusIcon } from './icons';
import { RevealItem } from './Reveal';
import { SectionHeading } from './SectionHeading';

export function Faq() {
  const { t } = useI18n();
  const [open, setOpen] = useState<number | null>(0);
  const baseId = useId();

  return (
    <section id="pitanja" className="theme-sand py-24 sm:py-32">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.5fr]">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <SectionHeading index="04" eyebrow={t.faq.eyebrow} title={t.faq.title} />
        </div>
        <ul className="flex flex-col gap-3">
          {t.faq.items.map((item, i) => {
            const isOpen = open === i;
            const panelId = `${baseId}-${i}`;
            return (
              <RevealItem
                key={item.q}
                delay={i * 0.04}
                y={14}
                className={`rounded-2xl transition-colors duration-300 ${isOpen ? 'bg-surface shadow-card ring-1 ring-line' : 'bg-surface/60 ring-1 ring-line hover:bg-surface'}`}
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  className="flex w-full items-center justify-between gap-6 p-5 text-left font-display text-lg font-semibold sm:p-6 sm:text-xl"
                >
                  {item.q}
                  <motion.span
                    animate={{ rotate: isOpen ? 45 : 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className={`grid size-9 shrink-0 place-items-center rounded-full transition-colors ${isOpen ? 'bg-primary text-on-primary' : 'bg-surface-2 text-ink'}`}
                  >
                    <PlusIcon className="size-4" />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={panelId}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="max-w-2xl px-5 pb-6 text-lg text-muted sm:px-6">{item.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </RevealItem>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
