import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react';
import { useState } from 'react';
import { config } from '../config';
import { locales, useI18n } from '../i18n/context';
import { CloseIcon, MenuIcon } from './icons';
import { Logo } from './Logo';

export function Nav() {
  const { t, locale, setLocale } = useI18n();
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 16));

  const links = [
    { href: '#kako-radi', label: t.nav.howItWorks },
    { href: '#za-lokale', label: t.nav.forVenues },
    { href: '#za-goste', label: t.nav.forGuests },
    { href: '#pitanja', label: t.nav.faq },
  ];

  const languageSwitch = (
    <div role="group" aria-label={t.nav.language} className="flex text-sm font-semibold">
      {locales.map((l, i) => (
        <span key={l} className="flex items-center">
          {i > 0 && <span className="mx-1 text-line-strong">/</span>}
          <button
            type="button"
            onClick={() => setLocale(l)}
            aria-pressed={locale === l}
            className={`min-h-8 px-1 uppercase transition-colors ${locale === l ? 'text-ink' : 'text-muted hover:text-ink'}`}
          >
            {l}
          </button>
        </span>
      ))}
    </div>
  );

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,border-color] duration-300 ${scrolled || open ? 'border-b border-line bg-paper/85 backdrop-blur-xl' : 'border-b border-transparent'}`}
    >
      <nav className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6">
        <a href="#top" aria-label="qafe.ba">
          <Logo />
        </a>

        <ul className="hidden items-center gap-8 lg:flex">
          {links.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="relative py-2 text-[0.95rem] font-medium text-muted transition-colors after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:origin-right after:scale-x-0 after:rounded-full after:bg-primary after:transition-transform after:duration-300 hover:text-ink hover:after:origin-left hover:after:scale-x-100"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-6 lg:flex">
          {languageSwitch}
          <a
            href={config.staffUrl}
            className="text-[0.95rem] font-medium text-muted transition-colors hover:text-ink"
          >
            {t.nav.staffLogin}
          </a>
          <a
            href="#kontakt"
            className="inline-flex min-h-11 items-center rounded-full bg-ink px-5 text-sm font-semibold text-paper transition-colors hover:bg-primary hover:text-on-primary"
          >
            {t.nav.cta}
          </a>
        </div>

        <button
          type="button"
          className="grid size-11 place-items-center rounded-full border border-line-strong bg-surface lg:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? t.nav.close : t.nav.menu}
        >
          {open ? <CloseIcon className="size-5" /> : <MenuIcon className="size-5" />}
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden lg:hidden"
          >
            <div className="px-4 pt-2 pb-6 sm:px-6">
              <ul className="flex flex-col">
                {links.map((link, i) => (
                  <motion.li
                    key={link.href}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * i + 0.08 }}
                    className="border-b border-line"
                  >
                    <a
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="block py-4 font-display text-2xl font-semibold"
                    >
                      {link.label}
                    </a>
                  </motion.li>
                ))}
              </ul>
              <div className="mt-6 flex items-center justify-between gap-4">
                {languageSwitch}
                <a href={config.staffUrl} className="text-sm font-medium text-muted">
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
