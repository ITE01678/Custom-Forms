/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AZURE_CLIENT_ID: string;
  readonly VITE_AZURE_TENANT_ID: string;
  readonly VITE_REDIRECT_URI?: string;
  readonly VITE_ALLOWED_DOMAIN?: string;
  readonly VITE_SHAREPOINT_HOSTNAME?: string;
  readonly VITE_SHAREPOINT_SITE_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
