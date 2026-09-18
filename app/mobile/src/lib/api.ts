import { createApiClient } from "@app/shared";

/**
 * The phone cannot reach "localhost" — that resolves to the phone itself,
 * not this Mac. `make mobile` writes EXPO_PUBLIC_API_URL to mobile/.env
 * with the Mac's LAN IP before starting Expo. See CHEATSHEET.md.
 */
const baseUrl = process.env.EXPO_PUBLIC_API_URL
  ? `${process.env.EXPO_PUBLIC_API_URL}/api`
  : "http://localhost:8080/api";

export const api = createApiClient({ baseUrl });
