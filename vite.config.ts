/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  build: {
    target: "es2022",
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
