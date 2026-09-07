import { defineConfig } from '@playwright/test';
import { softwareGraphicsArgs } from './tools/browser-options.mjs';
export default defineConfig({
  testDir: './tests/browser', workers: 1, fullyParallel: false,
  timeout: 120000, expect: { timeout: 12000 },
  reporter: [['list'], ['json', { outputFile: 'artifacts/verification/results.json' }], ['html', { outputFolder: 'artifacts/verification/report', open: 'never' }]],
  outputDir: 'artifacts/verification/tests',
  use: { headless: process.env.POC_HEADLESS === '1', viewport: { width: 1440, height: 960 },
    launchOptions: { args: [...softwareGraphicsArgs, '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] },
  },
});
