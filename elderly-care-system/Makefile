.PHONY: run-api run-ui run-bot test fmt
run-api:
	uvicorn src.api.main:app --reload --port 8000
run-ui:
	streamlit run frontend/app.py
run-bot:
	python -m src.ingestion.telegram_bot
test:
	pytest -q
