import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    proxy: {
      "/api": process.env.INVOICE_API_PROXY || "http://127.0.0.1:3000"
    }
  },
  build: {
    manifest: true,
    assetsDir: "assets"
  }
});
