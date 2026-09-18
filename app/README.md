# HackSpain 2026 template

Spring Boot API, React web app, and an Expo mobile app, sharing one set of
TypeScript types. See `CHEATSHEET.md` for the rename recipe and common
errors.

## Start here

```
make setup   # installs everything (first run only, ~5 min)
make db      # starts Postgres
make api     # backend on :8080
make web     # web app on :5173
make ip      # then, in another terminal: make mobile
```

Scan the QR code `make mobile` prints with the Expo Go app on your phone.
Your phone and this Mac must be on the same Wi-Fi network.

## One-command demo for judges

```
make demo    # builds and runs everything in Docker, on :3000
```

## Adding a feature

1. Copy `backend/src/main/java/com/hackspain/api/item/` to a new package,
   rename `Item` to your entity.
2. Add the matching zod schema to `packages/shared/src/schemas.ts`.
3. Use it from `web/src/pages/` and `mobile/app/`.

Full details, ports, and troubleshooting: `CHEATSHEET.md`.
