interface ImportMetaEnv {
  readonly VITE_STAFF_URL?: string;
  readonly VITE_PANEL_URL?: string;
  readonly VITE_CONTACT_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
