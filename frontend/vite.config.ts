import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // also listen on the LAN, useful when testing from a phone browser
    proxy: {
      // Forwards /api to the Spring Boot API. Avoids CORS in development.
      // VITE_API_TARGET lets a second worktree use another port (phase 4 plan A uses 8081).
      "/api": {
        target: process.env.VITE_API_TARGET ?? "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
