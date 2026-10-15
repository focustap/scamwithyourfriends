import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', timeout: 40000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:4173/scamwithyourfriends/', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: [
    { command: 'npm start', url: 'http://127.0.0.1:3000/health', reuseExistingServer: false,
      env: { NODE_ENV: 'test', PORT: '3000', AI_ENABLED: 'false', PRIVATE_GAME_PASSWORD: '', DATA_DIR: 'test-results/server-data', ALLOWED_ORIGINS: 'http://127.0.0.1:4173,http://localhost:3000,http://127.0.0.1:3000' } },
    { command: 'node scripts/preview.js', url: 'http://127.0.0.1:4173/scamwithyourfriends/', reuseExistingServer: false },
  ],
});
