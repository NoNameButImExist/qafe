import { AnimatePresence, motion, useInView } from 'motion/react';
import { useId, useRef, useState, type ComponentType } from 'react';
import { useI18n } from '../i18n/context';
import { FlameIcon, QrIcon, ShieldIcon, UsersIcon } from './icons';
import { ClaimMock, LiveMock, MenuMock, ReportsMock } from './ProductMocks';
import { Reveal } from './Reveal';
import { SectionHeading } from './SectionHeading';

const MOCKS: Record<string, ComponentType> = {
  live: LiveMock,
  claim: ClaimMock,
  menu: MenuMock,
  reports: ReportsMock,
};

const MORE_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  tables: QrIcon,
  staff: UsersIcon,
  safety: ShieldIcon,
  kds: FlameIcon,
};

// Each tab stays this long before the next one opens (while the section is visible).
const TAB_SECONDS = 7;

export function Product() {
  const { t } = useI18n();
  const p = t.product;
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.35 });
  const baseId = useId();

  const current = p.showcase[active] ?? p.showcase[0];
  const Mock = MOCKS[current?.key ?? 'live'] ?? LiveMock;

  return (
    <section
      id="za-lokale"
      className="relative isolate overflow-hidden bg-navy py-24 text-on-navy sm:py-32"
    >
      <div
        aria-hidden
        className="bg-dots-navy absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,black,transparent_70%)]"
      />
      <div
        aria-hidden
        className="absolute top-[-20%] right-[-10%] -z-10 size-[700px] rounded-full bg-primary/30 blur-[140px]"
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading
          index="02"
          eyebrow={p.eyebrow}
          title={p.title}
          subtitle={p.subtitle}
          onNavy
        />

        <div
          ref={ref}
          className="mt-16 grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12"
        >
          <div role="tablist" aria-orientation="vertical" className="flex flex-col gap-2">
            {p.showcase.map((item, i) => {
              const selected = i === active;
              return (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  id={`${baseId}-tab-${i}`}
                  aria-selected={selected}
                  aria-controls={`${baseId}-panel`}
                  onClick={() => setActive(i)}
                  className={`relative overflow-hidden rounded-2xl p-5 text-left transition-colors duration-300 sm:p-6 ${selected ? 'bg-navy-soft' : 'hover:bg-navy-soft/50'}`}
                >
                  <span className="flex items-baseline gap-4">
                    <span
                      className={`font-display text-sm font-bold ${selected ? 'text-highlight' : 'text-on-navy-muted'}`}
                    >
                      0{i + 1}
                    </span>
                    <span
                      className={`font-display text-xl font-semibold sm:text-2xl ${selected ? 'text-on-navy' : 'text-on-navy-muted'}`}
                    >
                      {item.title}
                    </span>
                  </span>
                  <AnimatePresence initial={false}>
                    {selected && (
                      <motion.span
                        className="block overflow-hidden"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <span className="block pt-3 pl-9 text-on-navy-muted">{item.body}</span>
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {selected && (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 bg-navy-line">
                      <motion.span
                        key={`${active}-${inView}`}
                        className="block h-full origin-left bg-highlight"
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: inView ? 1 : 0 }}
                        transition={{ duration: inView ? TAB_SECONDS : 0, ease: 'linear' }}
                        onAnimationComplete={() => {
                          if (inView) setActive((v) => (v + 1) % p.showcase.length);
                        }}
                      />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div
            id={`${baseId}-panel`}
            role="tabpanel"
            aria-labelledby={`${baseId}-tab-${active}`}
            className="relative h-[440px] sm:h-[480px]"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={current?.key}
                className="absolute inset-0"
                initial={{ opacity: 0, y: 24, rotateX: 8 }}
                animate={{ opacity: 1, y: 0, rotateX: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                style={{ transformPerspective: 1200 }}
              >
                <Mock />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <ul className="mt-20 grid gap-px overflow-hidden rounded-3xl bg-navy-line sm:grid-cols-2 lg:grid-cols-4">
          {p.more.map((item, i) => {
            const Icon = MORE_ICONS[item.key] ?? QrIcon;
            return (
              <li key={item.key} className="bg-navy">
                <Reveal delay={i * 0.06} y={20} className="group h-full p-7">
                  <span className="grid size-11 place-items-center rounded-xl bg-primary/15 text-bright ring-1 ring-primary/30 transition-transform duration-300 group-hover:-rotate-6">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-6 font-display text-xl font-semibold">{item.title}</h3>
                  <p className="mt-2 text-on-navy-muted">{item.body}</p>
                </Reveal>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
