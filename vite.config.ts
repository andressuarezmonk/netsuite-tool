import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import webExtension from 'vite-plugin-web-extension';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, readdirSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('./package.json') as { version: string };

export default defineConfig({
  plugins: [
    react(),
    webExtension({
      manifest: () => ({
        manifest_version: 3,
        name: 'NetSuite Fast Time Tracker',
        version: pkg.version,
        description: 'Fast time entry for NetSuite',
        permissions: ['activeTab', 'storage'],
        host_permissions: [
          'https://*.netsuite.com/*',
          'https://api.github.com/*',
        ],
        content_scripts: [{
          matches: ['https://*.netsuite.com/app/site/hosting/scriptlet.nl*'],
          js: ['src/index.tsx'],
          run_at: 'document_end',
        }],
        action: {
          default_popup: 'src/popup/popup.html',
          default_icon: {
            16: 'icons/icon16.png',
            48: 'icons/icon48.png',
            128: 'icons/icon128.png',
          },
        },
        background: {
          service_worker: 'src/background.ts',
        },
        icons: {
          16: 'icons/icon16.png',
          48: 'icons/icon48.png',
          128: 'icons/icon128.png',
        },
      }),
      additionalInputs: [],
    }),
    // Copy icons to dist after build
    {
      name: 'copy-icons',
      closeBundle() {
        mkdirSync('dist/icons', { recursive: true });
        for (const file of readdirSync('icons')) {
          copyFileSync(`icons/${file}`, `dist/icons/${file}`);
        }
      },
    },
  ],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  build: {
    outDir: 'dist',
    minify: false,
  },
});
