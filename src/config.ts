// Credenciais de front-end são públicas no navegador depois do build.
// Configure VITE_META_ACCESS_TOKEN em .env.local para uso local.
export const META_ACCESS_TOKEN = import.meta.env.VITE_META_ACCESS_TOKEN || '';
export const META_GRAPH_VERSION = import.meta.env.VITE_META_GRAPH_VERSION || 'v25.0';
