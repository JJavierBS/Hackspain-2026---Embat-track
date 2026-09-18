import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // also listen on the LAN, useful when testing from a phone browser
    proxy: {
      // Forwards to the Spring Boot API started with `make api`.
      // Avoids CORS entirely in development.
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
