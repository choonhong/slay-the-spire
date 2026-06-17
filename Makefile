.PHONY: dev backend frontend install

dev:
	npm run dev

backend:
	npm run dev --workspace=backend

frontend:
	npm run dev --workspace=frontend

install:
	npm install
