import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid()],
  server: {
    host: true,
    port: 3000,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
