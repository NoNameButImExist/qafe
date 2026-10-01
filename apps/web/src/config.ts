// Links to the other apps and the contact address. Override per environment with VITE_* vars.
export const config = {
  staffUrl: import.meta.env.VITE_STAFF_URL ?? 'http://localhost:5174',
  panelUrl: import.meta.env.VITE_PANEL_URL ?? 'http://localhost:5175',
  contactEmail: import.meta.env.VITE_CONTACT_EMAIL ?? 'info@qafe.ba',
};
