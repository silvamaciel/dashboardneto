export interface TenantRoute {
  slug: string;
  companyName: string;
  accountId: string;
}

export interface TenantConfig {
  routes: TenantRoute[];
}

const STORAGE_KEY = 'metrix-tenant-config-v1';
const EMPTY_CONFIG: TenantConfig = { routes: [] };

function validConfig(value: unknown): TenantConfig {
  if (!value || typeof value !== 'object') return EMPTY_CONFIG;
  const candidate = value as Partial<TenantConfig>;
  const routes = Array.isArray(candidate.routes) ? candidate.routes.filter((route): route is TenantRoute =>
    !!route && typeof route.slug === 'string' && typeof route.companyName === 'string' && typeof route.accountId === 'string',
  ) : [];
  return {
    routes,
  };
}

export async function loadTenantConfig(): Promise<TenantConfig> {
  try {
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) return validConfig(JSON.parse(local));
  } catch { /* ignore malformed local config and use deployed config */ }

  try {
    const response = await fetch('/tenant-config.json', { cache: 'no-store' });
    if (response.ok) return validConfig(await response.json());
  } catch { /* use the empty config below */ }
  return EMPTY_CONFIG;
}

export function saveTenantConfigLocally(config: TenantConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function exportTenantConfig(config: TenantConfig) {
  const blob = new Blob([`${JSON.stringify(config, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'tenant-config.json';
  anchor.click();
  URL.revokeObjectURL(url);
}

export function normalizeSlug(value: string) {
  return value.trim().toLowerCase()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
