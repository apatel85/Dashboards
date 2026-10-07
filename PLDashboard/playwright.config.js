// Minimal Playwright config. Uses the pre-installed Chromium instead of
// downloading one (PLAYWRIGHT_BROWSERS_PATH is set in the environment).
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.js/,
  use: {
    launchOptions: {
      executablePath: process.env.PW_CHROME ||
        '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    },
  },
});
