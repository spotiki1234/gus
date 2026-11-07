import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Разрешает доступ из локальной сети и туннелей
    allowedHosts: true, // Полностью снимает ограничение на хосты для туннелей
  },
});
