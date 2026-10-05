import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    rolldownOptions: {
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
