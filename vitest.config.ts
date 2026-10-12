import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

// Each physics worker owns a Rapier world; avoid starving individual tests.
export default mergeConfig(viteConfig, defineConfig({ test: { maxWorkers: 2 } }));
