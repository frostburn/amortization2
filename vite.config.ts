import { defineConfig } from "vite";
import { execFileSync } from "node:child_process";

let revision = "unknown";
try { revision = execFileSync("git", ["describe", "--always", "--dirty"], { encoding: "utf8" }).trim(); }
catch { /* Source archives do not always contain Git metadata. */ }

export default defineConfig({
  base: "./",
  define: { __REPLAY_REVISION__: JSON.stringify(revision) },
  build: {
    rolldownOptions: {
      input: { game: "index.html", modelRoom: "model-room.html" },
      output: {
        codeSplitting: {
          groups: [
            { name: "physics", test: /@dimforge/ },
            { name: "three", test: /node_modules\/three/ },
          ],
        },
      },
    },
  },
});
