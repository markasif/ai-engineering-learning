.PHONY: help install dev test test-unit test-integration lint format clean docker-build docker-up docker-down

help:
	@echo "AI Engineering Production Service - Developer CLI"
	@echo "------------------------------------------------"
	@echo "make install          - Install package in editable mode with dev dependencies"
	@echo "make dev              - Run FastAPI server locally with auto-reload"
	@echo "make test             - Run complete automated test suite"
	@echo "make test-unit        - Run fast unit tests (no network/LLM calls)"
	@echo "make test-integration - Run API endpoint integration tests"
	@echo "make lint             - Run static analysis and style checks"
	@echo "make format           - Auto-format code with ruff"
	@echo "make docker-build     - Build production Docker image"
	@echo "make docker-up        - Start containers via docker compose"
	@echo "make docker-down      - Stop all containers"
	@echo "make clean            - Remove cache and temporary artifacts"

install:
	pip install -e ".[dev]"
	pre-commit install

dev:
	uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

test:
	pytest tests -v

test-unit:
	pytest tests/unit -v

test-integration:
	pytest tests/integration -v

lint:
	python -m ruff check .
	python -m mypy app

format:
	python -m ruff format .

clean:
	python -c "import pathlib, shutil; [shutil.rmtree(p) for p in pathlib.Path('.').rglob('__pycache__')]"
	python -c "import pathlib, shutil; [shutil.rmtree(p) for p in pathlib.Path('.').rglob('.pytest_cache')]"

docker-build:
	docker compose build

docker-up:
	docker compose up -d

docker-down:
	docker compose down

