// Links to the other apps and the contact address. Override per environment with VITE_* vars.
// Without them the links follow the domain the page is served from: on qafe.ba (or
// www.qafe.ba, qafe.localhost in Docker) they point to staff.<domain> and panel.<domain>;
// on localhost (pnpm dev) to the Vite dev servers.

function appUrl(subdomain: 'staff' | 'panel', devPort: number): string {
  const { protocol, hostname, port } = window.location;
  if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return `${protocol}//${hostname}:${devPort}`;
  }
  const domain = hostname.replace(/^www\./, '');
  return `${protocol}//${subdomain}.${domain}${port ? `:${port}` : ''}`;
}

export const config = {
  staffUrl: import.meta.env.VITE_STAFF_URL ?? appUrl('staff', 5174),
  panelUrl: import.meta.env.VITE_PANEL_URL ?? appUrl('panel', 5175),
  contactEmail: import.meta.env.VITE_CONTACT_EMAIL ?? 'info@qafe.ba',
};
