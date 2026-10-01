# qafe.ba – common commands. `make help` lists them.
# Local stack: http://qafe.localhost (landing), http://panel.qafe.localhost, http://staff.qafe.localhost, http://admin.qafe.localhost,
# guests at http://<venue-slug>.qafe.localhost (Chrome and Firefox resolve *.localhost).

COMPOSE      = docker compose
COMPOSE_PROD = docker compose -f docker-compose.yml -f docker-compose.prod.yml

.DEFAULT_GOAL := help
.PHONY: help setup keys up down restart logs ps build migrate seed infra dev clean prod-pull prod-up prod-down prod-logs

help: ## List the commands
	@grep -hE '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  \033[36m%-11s\033[0m %s\n", $$1, $$2}'

setup: ## First run: install, JWT and VAPID keys (.env must exist, see .env.example)
	@test -f .env || (echo "Copy .env.example to .env and fill it in first." && exit 1)
	corepack enable pnpm
	pnpm install
	@test -f secrets/jwt-private.pem || pnpm keys:generate
	@grep -qE '^VAPID_PUBLIC_KEY=.+' .env || echo "Add VAPID keys to .env: pnpm keys:vapid"

up: ## Build and start the whole stack (migrations run first)
	$(COMPOSE) --profile app up -d --build
	@$(COMPOSE) --profile app ps --format 'table {{.Service}}\t{{.Status}}'

down: ## Stop the stack (data volumes stay)
	$(COMPOSE) --profile '*' down

restart: ## Rebuild and restart one or more services: make restart s="api worker"
	$(COMPOSE) --profile app up -d --build $(s)

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

clean: ## Stop everything and DELETE the data volumes
	@read -p "This deletes the database and images in Docker. Type 'yes': " ok && [ "$$ok" = yes ]
	$(COMPOSE) --profile '*' down -v

prod-pull: ## Server: pull released images
	$(COMPOSE_PROD) --profile app pull

prod-up: ## Server: start or update the stack with released images
	$(COMPOSE_PROD) --profile app up -d --no-build --remove-orphans

prod-down: ## Server: stop the stack
	$(COMPOSE_PROD) --profile '*' down

prod-logs: ## Server: follow logs (make prod-logs s=api)
	$(COMPOSE_PROD) --profile '*' logs -f --tail=100 $(s)
