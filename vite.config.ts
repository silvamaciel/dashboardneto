import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/recharts/')) return 'vendor-charts';
          if (id.includes('/lucide-react/')) return 'vendor-icons';
          if (id.includes('/react-dom/') || id.includes('/react/')) return 'vendor-react';
          return 'vendor';
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
