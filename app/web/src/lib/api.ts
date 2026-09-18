import { createApiClient } from "@app/shared";

/**
 * baseUrl is "/api" and vite.config.ts proxies it to the Spring Boot API,
 * so the browser never makes a cross-origin request in development.
 */
export const api = createApiClient({ baseUrl: "/api" });
