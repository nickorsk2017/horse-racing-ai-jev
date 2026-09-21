PYTHON ?= python3
COMPOSE ?= docker compose
VENV := mcp/.venv
FRONTEND_PORT := 5173

.DEFAULT_GOAL := help
.PHONY: help install run mcp frontend test clean up down restart logs ps build docker-test

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*## ' Makefile | awk 'BEGIN {FS = ":.*## "} {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

$(VENV)/.installed: mcp/pyproject.toml
	$(PYTHON) -m venv $(VENV)
	$(VENV)/bin/pip install -q --upgrade pip
	$(VENV)/bin/pip install -q -e "./mcp[dev]"
	test -f mcp/.env || cp mcp/.env.example mcp/.env
	touch $@

install: $(VENV)/.installed ## Create venv and install Python dependencies

run: install ## Run AI Agent and frontend locally (Ctrl+C stops both)
	@echo "Frontend: http://localhost:$(FRONTEND_PORT)"
	@echo "AI Agent: http://127.0.0.1:8765/mcp"
	@$(MAKE) --no-print-directory -j2 mcp frontend

mcp: install ## Run only the Jev AI Agent (MCP server)
	cd mcp && .venv/bin/python -m jev_agent.main

frontend: ## Run only the frontend static server
	cd frontend && $(PYTHON) -m http.server $(FRONTEND_PORT)

test: install ## Run tests locally
	cd mcp && .venv/bin/python -m pytest -q

clean: ## Remove venv and caches
	rm -rf $(VENV) mcp/.pytest_cache mcp/*.egg-info
	find mcp -name __pycache__ -type d -prune -exec rm -rf {} +

build: ## Build Docker images
	$(COMPOSE) build

up: ## Run the whole stack in Docker (background)
	$(COMPOSE) up -d --build
	@echo "Frontend: http://localhost:$(FRONTEND_PORT)"
	@echo "AI Agent: http://127.0.0.1:8765/mcp"

down: ## Stop Docker stack
	$(COMPOSE) down

restart: down up ## Restart Docker stack

logs: ## Follow Docker logs
	$(COMPOSE) logs -f

ps: ## Show Docker containers status
	$(COMPOSE) ps

docker-test: ## Run tests inside the Docker image
	docker build --target test -t horse-racing-mcp-test ./mcp
	docker run --rm horse-racing-mcp-test
