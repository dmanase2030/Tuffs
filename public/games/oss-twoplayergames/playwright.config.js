"use strict";
const path = require("path");
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:8777",
    trace: "retain-on-failure",
    serviceWorkers: "block",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "node server.js",
    url: "http://127.0.0.1:8777",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      ...process.env,
      PORT: "8777",
      DATA_DIR: path.join(__dirname, "test-results", "account-data"),
    },
  },
});