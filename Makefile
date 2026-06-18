.PHONY: dev backend frontend install scrape scrape-text

dev:
	npm run dev

backend:
	npm run dev --workspace=backend

frontend:
	npm run dev --workspace=frontend

install:
	npm install

scrape:
	python3 scripts/scrape_community_cards.py

scrape-text:
	python3 scripts/scrape_card_text.py
