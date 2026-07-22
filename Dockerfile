# ── Stage 1: Build frontend ──────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
COPY frontend/package*.json ./frontend/
RUN npm install --workspace=frontend
COPY frontend ./frontend
RUN npm run build --workspace=frontend

# ── Stage 2: Build backend ───────────────────────────────────────────────────
FROM node:20-alpine AS backend-builder
WORKDIR /app
COPY package*.json ./
COPY backend/package*.json ./backend/
RUN npm install --workspace=backend
COPY backend ./backend
RUN npm run build --workspace=backend

# ── Stage 3: Production image ────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Runtime dependencies only
COPY package*.json ./
COPY backend/package*.json ./backend/
RUN npm install --workspace=backend --omit=dev

# Compiled backend
COPY --from=backend-builder /app/backend/dist ./backend/dist

# Built frontend (served as static files by Express)
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Static data files (card_text.json, community_cards.json, game_context.json)
COPY data ./data

# SQLite DB lives in /app/data — mount a Fly volume here
VOLUME ["/app/data"]

ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "backend/dist/index.js"]
