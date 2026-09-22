import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    proxy: {
      '/steam': {
        target: 'https://steamcommunity.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/steam/, ''),
      },
      '/skin-catalog': {
        target: 'https://raw.githubusercontent.com',
        changeOrigin: true,
        rewrite: () => '/ByMykel/CSGO-API/main/public/api/en/skins.json',
      },
    },
  },
})