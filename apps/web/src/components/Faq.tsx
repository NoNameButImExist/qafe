import { AnimatePresence, motion } from 'motion/react';
import { useId, useState } from 'react';
import { useI18n } from '../i18n/context';
import { PlusIcon } from './icons';
import { Reveal } from './Reveal';
import { SectionHeading } from './SectionHeading';

export function Faq() {
  const { t } = useI18n();
  const [open, setOpen] = useState<number | null>(0);
  const baseId = useId();

  return (
    <section id="pitanja" className="py-24 sm:py-32">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.4fr]">
        <SectionHeading eyebrow={t.faq.eyebrow} title={t.faq.title} />
        <ul className="border-t border-line">
          {t.faq.items.map((item, i) => {
            const isOpen = open === i;
            const panelId = `${baseId}-${i}`;
            return (
              <Reveal key={item.q} delay={i * 0.05} y={16}>
                <li className="border-b border-line">
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    className="flex w-full items-center justify-between gap-6 py-6 text-left font-display text-xl font-semibold transition-colors hover:text-primary sm:text-2xl"
                  >
                    {item.q}
                    <motion.span
                      animate={{ rotate: isOpen ? 45 : 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      className={`grid size-10 shrink-0 place-items-center rounded-full border transition-colors ${isOpen ? 'border-primary bg-primary text-on-primary' : 'border-line'}`}
                    >
                      <PlusIcon className="size-5" />
                    </motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        id={panelId}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <p className="max-w-2xl pb-6 text-lg text-muted">{item.a}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
