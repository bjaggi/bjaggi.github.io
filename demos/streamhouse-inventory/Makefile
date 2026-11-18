SHELL := /bin/bash
PY := .venv/bin/python
TF := terraform -chdir=terraform
# Optional: make gen PROFILE=grocery (otherwise PROFILE from .env.local, default apparel_drops)
RUN := $(if $(PROFILE),PROFILE=$(PROFILE))

.PHONY: help venv up down plan gen gen-dry explainer dashboard dashboard-offline analytics analytics-offline status

help:
	@echo "Real-time demand forecasting demo"
	@echo ""
	@echo "  make venv                   Create .venv (Python 3.12 via uv) and install dependencies"
	@echo "  make up                     terraform apply: environment, Kafka, Flink, schemas, Tableflow; writes .env"
	@echo "  make gen [PROFILE=grocery]  Run the data generator (+ control API on :8001)"
	@echo "  make explainer              Run the watsonx Granite explainer"
	@echo "  make dashboard              Run the live dashboard on http://localhost:8000"
	@echo "  make analytics              Query Tableflow Iceberg tables with DuckDB"
	@echo "  make down                   terraform destroy"
	@echo ""
	@echo "  make dashboard-offline      Dashboard with synthetic data, no cloud (rehearsal)"
	@echo "  make analytics-offline      Analytics SQL on synthetic data, no cloud"
	@echo "  make gen-dry                Data generator without Kafka"

venv:
	uv venv --python 3.12 .venv
	uv pip install --python $(PY) -r requirements.txt

up:
	$(TF) init -upgrade
	$(TF) apply
	@test -f .env.local || cp .env.local.example .env.local
	@echo ""
	@echo "Infrastructure ready. Next: make gen, make explainer, make dashboard (in three terminals)."

plan:
	$(TF) init -upgrade
	$(TF) plan

down:
	$(TF) destroy

gen:
	$(RUN) $(PY) -m datagen.main

gen-dry:
	$(RUN) $(PY) -m datagen.main --dry-run --backfill 12

explainer:
	$(RUN) $(PY) -m explainer.main

dashboard:
	$(RUN) $(PY) -m uvicorn dashboard.app:app --port 8000

dashboard-offline:
	$(RUN) DASHBOARD_DEMO_DATA=1 $(PY) -m uvicorn dashboard.app:app --port 8000

analytics:
	$(RUN) $(PY) -m analytics.query_iceberg

analytics-offline:
	$(RUN) $(PY) -m analytics.query_iceberg --offline

status:
	@curl -s localhost:8001/state | $(PY) -c "import sys,json;d=json.load(sys.stdin);print(json.dumps({k:d[k] for k in ('profile','active_promos','active_launches','last_period','producer')},indent=2))"
