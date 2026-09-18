# Cheatsheet

## Ports

| Service | Port | URL |
|---|---|---|
| Backend | 8080 | http://localhost:8080/api/items |
| Backend health | 8080 | http://localhost:8080/actuator/health |
| Web | 5173 | http://localhost:5173 |
| Postgres | 5432 | `postgresql://app:hackathon@127.0.0.1:5432/app` |
| Docker demo | 3000 | http://localhost:3000 |

## Rename `Item` to your real entity

1. Copy `backend/src/main/java/com/hackspain/api/item/` to a new package
   (e.g. `task/`). Rename every `Item` to your entity name in each file.
2. Copy `backend/src/test/java/com/hackspain/api/item/ItemControllerTest.java`
   the same way.
3. Add the matching schema to `packages/shared/src/schemas.ts` (copy the
   `Item*` block, rename it) and export the new types from `types.ts`.
4. Update `web/src/pages/` and `mobile/src/app/` to call the new endpoint.
5. Delete `DataSeeder.java` once you have real data, or change what it seeds.

## The mobile app cannot reach the API

The phone is not this Mac. `localhost` on the phone means the phone.

1. Run `make ip` to print this Mac's LAN IP.
2. Run `make mobile` — it writes that IP into `mobile/.env` automatically.
3. Confirm the phone and this Mac are on the **same Wi-Fi network**. A
   venue that isolates devices from each other (many conference Wi-Fi
   networks do this) breaks this no matter what you configure — use your
   phone's hotspot instead, and connect the Mac to it.
4. macOS may prompt to allow incoming connections the first time you run
   `make api`. Click **Allow**.

## Colima will not start on this Mac

`colima start` currently fails with:

```
guest agent binary could not be found for Linux-x86_64
```

The existing `colima` VM profile is pinned to `x86_64` on this arm64 Mac
(emulated through QEMU), and the installed `lima` version does not ship
that guest agent. Two ways to fix it, in order of how disruptive they are:

- **Open Docker Desktop instead** (`open -a Docker`), if it's installed —
  the compose commands work against any running Docker daemon.
- **Recreate the Colima VM as native arm64** — faster, but this deletes
  every container and volume Colima currently holds, including anything
  from `~/hackathon-kit/docker-compose.yml`:
  ```
  colima delete
  colima start --arch aarch64 --cpu 4 --memory 8 --disk 60
  ```

`make db` and `make demo` need a working Docker daemon either way.

## CORS error in the browser console

You are probably calling the API directly instead of through the `/api`
proxy. Use relative paths (`/api/items`, not `http://localhost:8080/api/items`)
from the web app — `web/vite.config.ts` proxies `/api` to the backend, so
the browser never makes a cross-origin request.

## Adding auth

Not included, to save time this weekend. If the challenge needs it:

```
./mvnw org.springframework.boot:spring-boot-maven-plugin  # already present
```

Add `spring-boot-starter-security` and `jjwt` to `backend/pom.xml`, then a
`SecurityConfig` with a JWT filter. Budget at least an hour.

## Adding Flyway

Add `spring-boot-starter-data-jpa`'s sibling `flyway-core` (and
`org.flywaydb:flyway-database-postgresql` on Boot 4) to `backend/pom.xml`,
set `spring.jpa.hibernate.ddl-auto: validate`, and write
`backend/src/main/resources/db/migration/V1__init.sql`.
