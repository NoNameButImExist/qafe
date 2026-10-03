import { motion, useMotionValue, useScroll, useSpring, useTransform } from 'motion/react';
import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n/context';
import { Reveal } from './Reveal';
import { SectionHeading } from './SectionHeading';
import { StepArt } from './StepArt';

function StepCard({ index, title, body }: { index: number; title: string; body: string }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-[2rem] bg-surface ring-1 ring-line">
      <div className="p-7 sm:p-8">
        <div className="flex items-center justify-between">
          <span className="font-display text-5xl font-bold text-bright">0{index + 1}</span>
          <span className="ml-6 h-px flex-1 translate-y-1 bg-line" />
        </div>
        <h3 className="mt-5 font-display text-3xl font-bold xl:text-4xl">{title}</h3>
        <p className="mt-3 text-pretty text-muted xl:text-lg">{body}</p>
      </div>
      <div className="bg-dots relative mt-auto grid min-h-[250px] flex-1 place-items-center bg-paper py-6">
        <div className="w-full">
          <StepArt step={index} />
        </div>
      </div>
    </article>
  );
}

export function HowItWorks() {
  const { t } = useI18n();
  const steps = t.how.steps;
  const sectionRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // How far the track must slide so its last card ends at the right edge.
  const distance = useMotionValue(0);
  useEffect(() => {
    const track = trackRef.current;
    const viewport = viewportRef.current;
    if (!track || !viewport) return;
    const observer = new ResizeObserver(() => {
      distance.set(Math.max(0, track.scrollWidth - viewport.clientWidth));
    });
    observer.observe(track);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [distance]);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });
  const smooth = useSpring(scrollYProgress, { stiffness: 160, damping: 30, mass: 0.4 });
  const x = useTransform(() => -smooth.get() * distance.get());
  const bar = useTransform(smooth, [0, 1], ['0%', '100%']);

  return (
    <section id="kako-radi" className="relative">
      {/* Desktop: vertical scrolling drives the track sideways; the heading leads the track. */}
      <div ref={sectionRef} className="relative hidden h-[340vh] lg:block">
        <div className="sticky top-0 flex h-dvh flex-col justify-center overflow-hidden pt-18">
          <div ref={viewportRef} className="w-full">
            <motion.div
              ref={trackRef}
              style={{ x }}
              className="flex w-max items-stretch gap-6 pr-[max(1.5rem,calc((100vw-80rem)/2+1.5rem))] pl-[max(1.5rem,calc((100vw-80rem)/2+1.5rem))]"
            >
              <div className="flex w-[min(520px,38vw)] shrink-0 flex-col justify-center pr-10">
                <SectionHeading
                  index="01"
                  eyebrow={t.how.eyebrow}
                  title={t.how.title}
                  subtitle={t.how.subtitle}
                />
              </div>
              {steps.map((step, i) => (
                <div
                  key={step.title}
                  className="h-[min(640px,calc(100dvh-9rem))] w-[min(420px,32vw)] shrink-0"
                >
                  <StepCard index={i} title={step.title} body={step.body} />
                </div>
              ))}
            </motion.div>
          </div>
          <div className="mx-auto mt-8 w-full max-w-7xl px-6">
            <div className="h-1 w-56 overflow-hidden rounded-full bg-line">
              <motion.div className="h-full rounded-full bg-primary" style={{ width: bar }} />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile and tablet: the cards stacked. */}
      <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6 lg:hidden">
        <SectionHeading
          index="01"
          eyebrow={t.how.eyebrow}
          title={t.how.title}
          subtitle={t.how.subtitle}
        />
        <ol className="mt-12 flex flex-col gap-5">
          {steps.map((step, i) => (
            <li key={step.title}>
              <Reveal>
                <StepCard index={i} title={step.title} body={step.body} />
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
