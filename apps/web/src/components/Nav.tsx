import { AnimatePresence, motion, useMotionValueEvent, useScroll, useSpring } from 'motion/react';
import { useState } from 'react';
import { config } from '../config';
import { locales, useI18n } from '../i18n/context';
import { MenuIcon, PlusIcon } from './icons';
import { Logo } from './Logo';

export function Nav() {
  const { t, locale, setLocale } = useI18n();
  const { scrollY, scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 24 });
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 24));

  const links = [
    { href: '#kako-radi', label: t.nav.howItWorks },
    { href: '#za-lokale', label: t.nav.forVenues },
    { href: '#za-goste', label: t.nav.forGuests },
    { href: '#pitanja', label: t.nav.faq },
  ];

  const languageSwitch = (
    <div
      role="group"
      aria-label={t.nav.language}
      className="relative flex rounded-full border border-line bg-fg/5 p-1 text-xs font-semibold"
    >
      {locales.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          aria-pressed={locale === l}
          className={`relative z-10 min-h-8 min-w-10 rounded-full px-3 uppercase transition-colors ${locale === l ? 'text-canvas' : 'text-muted hover:text-fg'}`}
        >
          {locale === l && (
            <motion.span
              layoutId="lang-pill"
              className="absolute inset-0 -z-10 rounded-full bg-fg"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          {l}
        </button>
      ))}
    </div>
  );

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <motion.div
        className="absolute inset-x-0 top-0 h-0.5 origin-left bg-linear-to-r from-primary via-accent to-accent-2"
        style={{ scaleX: progress }}
      />
      <motion.nav
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        className={`mx-3 mt-3 flex max-w-7xl items-center justify-between gap-4 rounded-full px-4 py-2 transition-[background-color,border-color,backdrop-filter] duration-500 sm:mx-4 sm:px-5 xl:mx-auto ${scrolled ? 'border border-line bg-canvas/70 backdrop-blur-xl' : 'border border-transparent'}`}
      >
        <a href="#top" aria-label="qafe">
          <Logo />
        </a>

        <ul className="hidden items-center gap-1 lg:flex">
          {links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="group relative rounded-full px-4 py-2 text-sm text-muted transition-colors hover:text-fg"
              >
                {link.label}
                <span className="absolute inset-x-4 bottom-1 h-px origin-left scale-x-0 bg-primary transition-transform duration-300 group-hover:scale-x-100" />
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-3 lg:flex">
          {languageSwitch}
          <a href={config.staffUrl} className="text-sm text-muted transition-colors hover:text-fg">
            {t.nav.staffLogin}
          </a>
          <a
            href="#kontakt"
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-transform hover:scale-105 active:scale-95"
          >
            {t.nav.cta}
          </a>
        </div>

        <button
          type="button"
          className="grid size-11 place-items-center rounded-full border border-line lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? t.nav.close : t.nav.menu}
        >
          <motion.span animate={{ rotate: open ? 135 : 0 }} className="grid place-items-center">
            {open ? <PlusIcon className="size-5" /> : <MenuIcon className="size-5" />}
          </motion.span>
        </button>
      </motion.nav>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0, y: -16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="mx-3 mt-2 rounded-3xl border border-line bg-canvas/95 p-6 backdrop-blur-xl lg:hidden"
          >
            <ul className="flex flex-col gap-1">
              {links.map((link, i) => (
                <motion.li
                  key={link.href}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 * i + 0.1 }}
                >
                  <a
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="block py-3 font-display text-3xl font-bold"
                  >
                    {link.label}
                  </a>
                </motion.li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
              {languageSwitch}
              <a href={config.staffUrl} className="text-sm text-muted">
                {t.nav.staffLogin}
              </a>
            </div>
            <a
              href="#kontakt"
              onClick={() => setOpen(false)}
              className="mt-6 flex min-h-12 items-center justify-center rounded-full bg-primary font-semibold text-on-primary"
            >
              {t.nav.cta}
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
