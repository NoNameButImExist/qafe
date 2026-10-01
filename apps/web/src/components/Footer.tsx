import { motion } from 'motion/react';
import { config } from '../config';
import { useI18n } from '../i18n/context';
import { Logo } from './Logo';

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="relative overflow-hidden pt-20">
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-muted">{t.footer.tagline}</p>
        </div>
        <ul className="flex flex-col gap-3 text-muted sm:items-end">
          <li>
            <a href={config.staffUrl} className="hover:text-fg">
              {t.footer.staffLogin}
            </a>
          </li>
          <li>
            <a href={config.panelUrl} className="hover:text-fg">
              {t.footer.panel}
            </a>
          </li>
          <li>
            <a href={`mailto:${config.contactEmail}`} className="hover:text-fg">
              {config.contactEmail}
            </a>
          </li>
        </ul>
      </div>
      <p className="mx-auto mt-12 max-w-7xl px-4 text-sm text-muted/70 sm:px-6">
        © {new Date().getFullYear()} qafe.ba. {t.footer.rights}
      </p>
      <motion.p
        aria-hidden
        initial={{ y: '40%', opacity: 0 }}
        whileInView={{ y: '18%', opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        className="text-ghost pointer-events-none mt-6 text-center font-display text-[28vw] leading-none font-extrabold select-none"
      >
        qafe
      </motion.p>
    </footer>
  );
}
