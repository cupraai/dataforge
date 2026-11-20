import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, lazyPlugins } from "vite-plus";
import react from "@vitejs/plugin-react";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(rootDir, "..");
const coverageDir = process.env.DATAFORGE_COVERAGE_DIR;

const DEFAULT_UI_PORT = 18081;
const DEFAULT_API_PORT = 18080;

function envPort(raw: string | undefined, fallback: number): number {
  const port = Number(raw?.trim());
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : fallback;
}

export default defineConfig(({ mode }) => {
  // loadEnv("", projectRoot) reads unprefixed keys for server config only. Do not set
  // `envDir`: that would leak OPENAI_API_KEY from the root .env into the client.
  const env = loadEnv(mode, projectRoot, "");
  const uiPort = envPort(env.DATAFORGE_UI_PORT, DEFAULT_UI_PORT);
  const apiPort = envPort(env.DATAFORGE_API_PORT, DEFAULT_API_PORT);

  return {
    lint: {
      plugins: ["eslint", "typescript", "react", "oxc", "jsx-a11y", "import"],
      jsPlugins: [
        "@tanstack/eslint-plugin-query",
        {
          name: "vite-plus",
          specifier: "vite-plus/oxlint-plugin",
        },
      ],
      options: {
        typeAware: true,
        typeCheck: true,
      },
      categories: {
        correctness: "error",
      },
      ignorePatterns: ["dist", "coverage", "test-results", "playwright-report"],
      rules: {
        "no-undef": "off",
        "no-case-declarations": "error",
        "no-fallthrough": "error",
        "no-prototype-builtins": "error",
        "no-array-constructor": "error",
        "no-empty": "error",
        "no-regex-spaces": "error",
        "no-var": "error",
        "no-useless-assignment": "error",
        "preserve-caught-error": "error",
        "prefer-const": "error",
        "prefer-rest-params": "error",
        "prefer-spread": "error",
        "no-unused-vars": [
          "error",
          {
            argsIgnorePattern: "^_",
            varsIgnorePattern: "^_",
          },
        ],
        "no-console": [
          "warn",
          {
            allow: ["warn", "error"],
          },
        ],
        "typescript/ban-ts-comment": "error",
        "typescript/no-unsafe-function-type": "error",
        "typescript/no-empty-object-type": "error",
        "typescript/no-explicit-any": "error",
        "typescript/no-namespace": "error",
        "typescript/no-require-imports": "error",
        "typescript/no-unnecessary-type-constraint": "error",
        "typescript/no-base-to-string": "off",
        "typescript/unbound-method": "off",
        "typescript/no-deprecated": "error",
        "typescript/no-unnecessary-type-assertion": "error",
        "typescript/consistent-type-imports": [
          "error",
          {
            prefer: "type-imports",
            fixStyle: "separate-type-imports",
          },
        ],
        "jsx-a11y/prefer-tag-over-role": "off",
        "jsx-a11y/control-has-associated-label": "off",
        "jsx-a11y/media-has-caption": "off",
        "jsx-a11y/no-autofocus": "off",
        "jsx-a11y/label-has-associated-control": [
          "error",
          {
            controlComponents: ["TimecodeField"],
            depth: 3,
          },
        ],
        "jsx-a11y/no-noninteractive-tabindex": [
          "error",
          {
            roles: ["tabpanel", "region"],
          },
        ],
        "jsx-a11y/no-noninteractive-element-interactions": [
          "error",
          {
            handlers: ["onClick", "onMouseDown", "onMouseUp", "onKeyPress", "onKeyDown", "onKeyUp"],
          },
        ],
        "jsx-a11y/no-noninteractive-element-to-interactive-role": [
          "error",
          {
            ul: ["listbox", "menu", "menubar", "radiogroup", "tablist", "tree", "treegrid"],
            ol: ["listbox", "menu", "menubar", "radiogroup", "tablist", "tree", "treegrid"],
            li: [
              "menuitem",
              "menuitemradio",
              "menuitemcheckbox",
              "option",
              "row",
              "tab",
              "treeitem",
            ],
            table: ["grid"],
            td: ["gridcell"],
            fieldset: ["radiogroup", "presentation"],
          },
        ],
        "import/no-cycle": "error",
        "react/rules-of-hooks": "error",
        "react/exhaustive-deps": "warn",
        "react/only-export-components": [
          "warn",
          {
            allowConstantExport: true,
            allowExportNames: [
              "useJobs",
              "useFolderJob",
              "useJobTransitions",
              "useGallerySelectionContext",
            ],
          },
        ],
        "@tanstack/query/exhaustive-deps": "error",
        "@tanstack/query/no-rest-destructuring": "warn",
        "@tanstack/query/stable-query-client": "error",
        "@tanstack/query/no-unstable-deps": "error",
        "@tanstack/query/infinite-query-property-order": "error",
        "@tanstack/query/mutation-property-order": "error",
        "vite-plus/prefer-vite-plus-imports": "error",
      },
      overrides: [
        {
          files: ["**/*.test.{ts,tsx}", "src/test/**/*.{ts,tsx}"],
          plugins: ["vitest"],
          rules: {
            "vitest/no-commented-out-tests": "error",
            "vitest/no-identical-title": "error",
            "vitest/no-import-node-test": "error",
            "vitest/no-interpolation-in-snapshots": "error",
            "vitest/no-mocks-import": "error",
            "vitest/no-unneeded-async-expect-function": "error",
            "vitest/prefer-called-exactly-once-with": "error",
          },
        },
        {
          files: ["**/*.test.{ts,tsx}"],
          rules: {
            "no-restricted-imports": [
              "error",
              {
                paths: [
                  {
                    name: "@tanstack/react-query",
                    importNames: ["QueryClientProvider"],
                    message:
                      "Use renderWithQueryClient, queryWrapper or AppProviders from @/test: a provider placed around a StrictMode tree silently turns StrictMode off.",
                  },
                ],
              },
            ],
          },
        },
      ],
    },
    test: {
      css: true,
      // Instrumented UI tests need more time than the normal 5s budget.
      testTimeout: coverageDir ? 20_000 : undefined,
      coverage: {
        enabled: Boolean(coverageDir),
        provider: "v8",
        reportsDirectory: coverageDir ? path.join(coverageDir, "frontend") : "coverage",
        reporter: ["json-summary"],
        include: ["src/**/*.{ts,tsx}"],
        exclude: ["src/**/*.test.{ts,tsx}", "src/**/*.d.ts", "src/test/**"],
      },
      projects: [
        {
          test: {
            name: "ui",
            environment: "jsdom",
            setupFiles: ["./src/test/setup.ts"],
            include: ["src/**/*.{test,spec}.{ts,tsx}"],
          },
        },
        {
          test: {
            name: "dev-server",
            environment: "node",
            include: ["vite.test.ts"],
          },
        },
      ],
    },
    fmt: {
      semi: true,
      singleQuote: false,
      trailingComma: "all",
      printWidth: 100,
      tabWidth: 2,
      sortPackageJson: false,
      ignorePatterns: [
        "dist",
        "node_modules",
        "coverage",
        "package-lock.json",
        "test-results",
        "playwright-report",
        "src/shared/types.ts",
        "src/shared/constants.ts",
        "src/shared/wireGuards.ts",
        "src/test/colorAdjustCases.ts",
      ],
    },
    plugins: lazyPlugins(() => [react()]),
    build: {
      // Served from loopback, so bundle size costs parse time, not download time.
      chunkSizeWarningLimit: 2000,
    },
    resolve: {
      alias: {
        "@": path.resolve(rootDir, "src"),
      },
    },
    server: {
      host: "127.0.0.1",
      port: uiPort,
      strictPort: true,
      watch: {
        awaitWriteFinish: {
          stabilityThreshold: 200,
          pollInterval: 25,
        },
      },
      proxy: {
        "/api": {
          target: `http://127.0.0.1:${apiPort}`,
          changeOrigin: true,
          configure: (proxy) => {
            // Uvicorn reloads drop the API briefly; answer with a detail-less 503 so
            // parseApiError maps to "Backend unreachable" instead of Vite's empty 500.
            proxy.on("error", (_err, _req, res) => {
              if (!res || !("writeHead" in res) || res.headersSent || res.writableEnded) {
                return;
              }
              res.writeHead(503, { "Content-Type": "application/json" });
              res.end("{}");
            });
          },
        },
      },
    },
  };
});
