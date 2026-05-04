SHELL := /bin/bash
.DEFAULT_GOAL := help

C := \033[36m
Y := \033[33m
R := \033[0m

.PHONY: help install dev build preview typecheck lint \
        supabase-start supabase-stop supabase-status supabase-reset \
        functions-serve env-template check-tools clean

help: ## Show available targets
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  $(C)%-20s$(R) %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ── Setup ──────────────────────────────────────────────────────────

install: ## Install npm dependencies
	npm install

check-tools: ## Verify node, supabase CLI and Docker are available
	@command -v node >/dev/null 2>&1 || { echo "❌ node not found — install Node 20+ (https://nodejs.org)"; exit 1; }
	@command -v supabase >/dev/null 2>&1 || { echo "❌ supabase CLI not found — run: brew install supabase/tap/supabase"; exit 1; }
	@docker info >/dev/null 2>&1 || { echo "❌ Docker is not running — open Docker Desktop and try again"; exit 1; }
	@test -f .env.local || { echo "❌ .env.local missing — run 'make env-template' or copy values from 'make supabase-status'"; exit 1; }

# ── Dev ────────────────────────────────────────────────────────────

dev: check-tools supabase-start ## Start Supabase + Vite dev server (one-shot bootstrap)
	@echo -e "$(Y)→ Starting Vite dev server (http://localhost:5173)$(R)"
	npm run dev

# ── Supabase ───────────────────────────────────────────────────────

supabase-start: ## Start the local Supabase stack (Postgres, Studio, Edge Functions)
	@if supabase status >/dev/null 2>&1; then \
	  echo -e "$(Y)→ Supabase already running$(R)"; \
	else \
	  echo -e "$(Y)→ Starting Supabase…$(R)"; \
	  supabase start; \
	fi

supabase-stop: ## Stop the local Supabase stack
	supabase stop

supabase-status: ## Show Supabase service URLs and anon/service keys
	supabase status

supabase-reset: ## Drop the DB, re-run all migrations, and apply seed.sql
	supabase db reset

functions-serve: ## Serve Edge Functions locally with hot reload
	supabase functions serve

env-template: ## Write .env.local from current `supabase status` (overwrites!)
	@if ! supabase status >/dev/null 2>&1; then \
	  echo "❌ Supabase is not running — run 'make supabase-start' first"; exit 1; \
	fi
	@URL=$$(supabase status -o json | python3 -c "import sys,json; print(json.load(sys.stdin)['API_URL'])"); \
	 KEY=$$(supabase status -o json | python3 -c "import sys,json; print(json.load(sys.stdin)['ANON_KEY'])"); \
	 echo "VITE_SUPABASE_URL=$$URL" > .env.local; \
	 echo "VITE_SUPABASE_ANON_KEY=$$KEY" >> .env.local; \
	 echo -e "$(Y)→ Wrote .env.local$(R)"

# ── Build / quality ────────────────────────────────────────────────

build: ## Production build (typecheck + Vite bundle)
	npm run build

typecheck: ## TypeScript check (no emit)
	npx tsc -b --noEmit

lint: ## Run ESLint
	npm run lint

preview: ## Preview the production build locally
	npm run preview

# ── Cleanup ────────────────────────────────────────────────────────

clean: ## Stop Supabase and remove the dist/ folder
	-supabase stop
	rm -rf dist
