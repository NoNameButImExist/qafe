import { config } from '../config';
import { useI18n } from '../i18n/context';
import { Logo } from './Logo';

export function Footer() {
  const { t } = useI18n();
  const columns = [
    {
      title: t.footer.product,
      links: [
        { href: '#kako-radi', label: t.nav.howItWorks },
        { href: '#za-lokale', label: t.nav.forVenues },
        { href: '#za-goste', label: t.nav.forGuests },
        { href: '#pitanja', label: t.nav.faq },
      ],
    },
    {
      title: t.footer.signIn,
      links: [
        { href: config.staffUrl, label: t.footer.staffLogin },
        { href: config.panelUrl, label: t.footer.panel },
      ],
    },
    {
      title: t.footer.contact,
      links: [{ href: `mailto:${config.contactEmail}`, label: config.contactEmail }],
    },
  ];

  return (
    <footer className="theme-sand pt-16 pb-10">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[1.4fr_2fr]">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-muted">{t.footer.tagline}</p>
        </div>
        <div className="grid gap-10 sm:grid-cols-3">
          {columns.map((col) => (
            <div key={col.title}>
              <p className="text-sm font-semibold">{col.title}</p>
              <ul className="mt-4 flex flex-col gap-3">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <a href={link.href} className="text-muted transition-colors hover:text-bright">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto mt-14 flex max-w-7xl flex-col gap-2 border-t border-line px-4 pt-8 text-sm text-muted sm:flex-row sm:justify-between sm:px-6">
        <p>
          © {new Date().getFullYear()} qafe.ba. {t.footer.rights}
        </p>
        <p>{t.footer.madeIn}</p>
      </div>
    </footer>
  );
}
