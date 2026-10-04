# qafe.ba – common commands. `make help` lists them.
# Local stack: http://qafe.localhost (landing), http://panel.qafe.localhost, http://staff.qafe.localhost, http://admin.qafe.localhost,
# guests at http://<venue-slug>.qafe.localhost (Chrome and Firefox resolve *.localhost).

COMPOSE      = docker compose
COMPOSE_PROD = docker compose -f docker-compose.yml -f docker-compose.prod.yml

.DEFAULT_GOAL := help
.PHONY: help setup keys up down restart logs ps build migrate seed infra dev backup backup-restore-test pitr-backup pitr-info pitr-restore-test audit-archive loadtest-seed loadtest loadtest-clean clean prod-pull prod-up prod-down prod-logs

help: ## List the commands
	@grep -hE '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  \033[36m%-11s\033[0m %s\n", $$1, $$2}'

setup: ## First run: install, JWT and VAPID keys (.env must exist, see .env.example)
	@test -f .env || (echo "Copy .env.example to .env and fill it in first." && exit 1)
	corepack enable pnpm
	pnpm install
	@test -f secrets/jwt-private.pem || pnpm keys:generate
	@grep -qE '^VAPID_PUBLIC_KEY=.+' .env || echo "Add VAPID keys to .env: pnpm keys:vapid"

up: ## Build and start the whole stack with monitoring (migrations run first)
	$(COMPOSE) --profile app --profile monitoring up -d --build
	@$(COMPOSE) --profile app --profile monitoring ps --format 'table {{.Service}}\t{{.Status}}'

down: ## Stop the stack (data volumes stay)
	$(COMPOSE) --profile '*' down

restart: ## Rebuild and restart one or more services: make restart s="api worker"
	$(COMPOSE) --profile app --profile monitoring up -d --build $(s)

logs: ## Follow logs: make logs (all) or make logs s=api
	$(COMPOSE) --profile '*' logs -f --tail=100 $(s)

ps: ## Service status
	$(COMPOSE) --profile '*' ps

build: ## Build all images without starting them
	$(COMPOSE) --profile app build

migrate: ## Run database migrations
	$(COMPOSE) --profile app run --rm --build migrate

seed: ## Demo data (development only): admin, demo venue, menu, tables
	pnpm db:seed

infra: ## Only Postgres, Redis and MinIO, for `pnpm dev` with hot reload
	pnpm docker:infra

dev: infra ## Data services in Docker, apps on the host with hot reload
	pnpm db:migrate
	pnpm dev

backup: ## Back up the database now (the backup service does it every night)
	$(COMPOSE) --profile app exec backup backup.sh

backup-restore-test: ## Restore the newest backup into a scratch database and count rows
	$(COMPOSE) --profile app exec backup restore.sh

pitr-backup: ## Take a pgBackRest backup now: make pitr-backup type=full|diff|incr (default diff)
	$(COMPOSE) --profile app exec pitr pgbackrest --stanza=qafe --type=$(or $(type),diff) backup

pitr-info: ## List PITR backups and the WAL range they cover
	$(COMPOSE) --profile app exec pitr pgbackrest --stanza=qafe info

pitr-restore-test: ## Restore the database as of 2 minutes ago (or at="...") into a scratch dir and count rows
	$(COMPOSE) --profile app exec pitr pitr-restore-test.sh $(if $(at),"$(at)",)

audit-archive: ## Move audit log months past AUDIT_RETENTION_MONTHS to S3 (runs nightly too)
	$(COMPOSE) --profile app exec backup archive-audit.sh

# Load test (infra/loadtest): lt-* venues with tables, menu and an "lt.sef" owner.
LT_VENUES ?= 20
LT_TABLES ?= 10
LT_DURATION ?= 5m
LT_THINK ?= 20
LT_PASSWORD ?= LoadTest-2026!

loadtest-seed: ## Create LT_VENUES load test venues (lt-001..) with LT_TABLES tables each
	@hash=$$($(COMPOSE) exec -T api node -e "import('@qafe/auth').then(async (m) => console.log(await m.hashPassword(process.argv[1])))" '$(LT_PASSWORD)'); \
	$(COMPOSE) exec -T postgres sh -c 'psql -q -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -v venues=$(LT_VENUES) -v tables=$(LT_TABLES) -v hash="$$0" -f -' "$$hash" < infra/loadtest/seed.sql

loadtest: ## Run the k6 load test against the local stack (LT_VENUES, LT_TABLES, LT_DURATION)
	docker run --rm -i --network qafe_internal -e VENUES=$(LT_VENUES) -e TABLES=$(LT_TABLES) \
	  -e DURATION=$(LT_DURATION) -e THINK=$(LT_THINK) -e STAFF_PASSWORD='$(LT_PASSWORD)' \
	  grafana/k6:1.3.0 run --quiet - < infra/loadtest/orders.js

loadtest-clean: ## Remove every load test venue (lt-*)
	$(COMPOSE) exec -T postgres sh -c 'psql -q -U "$$POSTGRES_USER" -d "$$POSTGRES_DB" -f -' < infra/loadtest/cleanup.sql

clean: ## Stop everything and DELETE the data volumes
	@read -p "This deletes the database and images in Docker. Type 'yes': " ok && [ "$$ok" = yes ]
	$(COMPOSE) --profile '*' down -v

prod-pull: ## Server: pull released images
	$(COMPOSE_PROD) --profile app --profile monitoring pull --ignore-buildable

prod-up: ## Server: start or update the stack with released images (+ monitoring)
	$(COMPOSE_PROD) --profile app --profile monitoring build backup postgres
	$(COMPOSE_PROD) --profile app --profile monitoring up -d --no-build --remove-orphans

prod-down: ## Server: stop the stack
	$(COMPOSE_PROD) --profile '*' down

prod-logs: ## Server: follow logs (make prod-logs s=api)
	$(COMPOSE_PROD) --profile '*' logs -f --tail=100 $(s)
