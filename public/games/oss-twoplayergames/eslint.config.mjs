import js from "@eslint/js";
import globals from "globals";

// Các module phía trình duyệt tự gắn vào window và gọi chéo nhau qua tên toàn cục.
const browserGlobals = {
  GameRegistry: "writable",
  makeRng: "readonly",
  Sound: "readonly",
  Net: "readonly",
  I18n: "readonly",
  StatsUtil: "readonly",
  ReplayStore: "readonly",
  GAMES_EN: "readonly",
};

export default [
  {
    ignores: ["node_modules/**", "dist/**", "build/**"],
  },
  js.configs.recommended,
  {
    // Code chạy trên trình duyệt
    files: ["js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        // Một số file hỗ trợ dual-export để unit test require được.
        module: "readonly",
        ...browserGlobals,
      },
    },
    rules: {
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },
  {
    // Service worker
    files: ["sw.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.serviceworker,
        ...globals.browser,
      },
    },
    rules: {
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },
  {
    // Code chạy trên Node: server, accounts store, scripts, tests
    files: ["server.js", "accounts.js", "playwright.config.js", "scripts/**/*.js", "tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
  },
];
