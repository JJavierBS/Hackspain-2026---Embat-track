.PHONY: setup db api web mobile ip demo test stop

# Every target is one command. Run `make` with no target to see this list.
help:
	@echo "make setup   install everything (first run only)"
	@echo "make db      start Postgres"
	@echo "make api     run the Spring Boot API on :8080"
	@echo "make web     run the Vite web app on :5173"
	@echo "make mobile  run the Expo app (scan the QR code with Expo Go)"
	@echo "make ip      print this Mac's LAN IP"
	@echo "make demo    one-command Docker demo on :3000"
	@echo "make test    backend tests + typecheck every TS package"
	@echo "make stop    stop the Docker containers"

setup:
	pnpm install
	cd ../backend && ./mvnw -q dependency:go-offline

db:
	@command -v colima >/dev/null 2>&1 && ! colima status >/dev/null 2>&1 && \
		{ echo "Colima is not running. Start it with: colima start --cpu 4 --memory 8 --disk 60"; exit 1; } || true
	docker compose up -d postgres
	@echo "Waiting for Postgres..."
	@until docker compose ps postgres --format json | grep -q '"Health":"healthy"'; do sleep 1; done
	@echo "Postgres is ready on 127.0.0.1:5432 (db=app user=app password=hackathon)"

api:
	cd ../backend && ./mvnw spring-boot:run

web:
	pnpm --filter web run dev

ip:
	@./scripts/lan-ip.sh

mobile:
	@ip=$$(./scripts/lan-ip.sh) && \
		echo "EXPO_PUBLIC_API_URL=http://$$ip:8080" > mobile/.env && \
		echo "Wrote mobile/.env with EXPO_PUBLIC_API_URL=http://$$ip:8080"
	pnpm --filter mobile run start

demo:
	@command -v colima >/dev/null 2>&1 && ! colima status >/dev/null 2>&1 && \
		{ echo "Colima is not running. Start it with: colima start --cpu 4 --memory 8 --disk 60"; exit 1; } || true
	docker compose --profile demo up --build

test:
	cd ../backend && ./mvnw -q test
	pnpm run typecheck

stop:
	docker compose --profile demo down
