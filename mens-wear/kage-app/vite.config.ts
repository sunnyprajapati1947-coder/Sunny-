import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/* Static output is deployed as-is; the Kage frame loads
   /landing-pages/kage.html from the public folder at runtime. */
export default defineConfig({
  plugins: [react()],
  base: "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
});
