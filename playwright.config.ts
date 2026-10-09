import { defineConfig, devices } from '@playwright/test';
import { scryptSync } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const testDataDir = mkdtempSync(join(tmpdir(), 'aoki-eng-e2e-'));
const salt = Buffer.from('aoki-e2e-test-salt');
const password = 'aoki-e2e-test-password-only';
const passwordHash = `scrypt$${salt.toString('base64url')}$${scryptSync(password, salt, 64).toString('base64url')}`;
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3210',
    extraHTTPHeaders: { Origin: 'http://127.0.0.1:3210' },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'npm run dev -- --port 3210',
    url: 'http://127.0.0.1:3210',
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      NEXT_DIST_DIR: '.next-e2e',
      DATA_DIR: testDataDir,
      DEMO_MODE: 'true',
      ALLOW_LIVE_ORDERS: 'false',
      TYPESAFE_API_KEY: '',
      OPENAI_API_KEY: '',
      GEMINI_API_KEY: '',
      EXA_API_KEY: '',
      TAVILY_API_KEY: '',
      APP_ORIGIN: 'http://127.0.0.1:3210',
      ADMIN_PASSWORD_HASH: passwordHash.replaceAll('$', '\\$'),
      SESSION_SECRET: 'e2e-only-aoki-session-secret-with-at-least-32-characters',
    },
  },
});
