# Includes dev tools, so it can run database migrations.
FROM node:26-slim AS migrate
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY migrations ./migrations
USER node
CMD ["npx", "node-pg-migrate", "up"]

# The running API, with production packages only.
FROM node:26-slim AS api
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY app.js server.js ./
COPY config ./config
COPY controllers ./controllers
COPY middleware ./middleware
COPY queries ./queries
COPY routes ./routes
COPY scripts ./scripts
COPY services ./services
COPY validators ./validators
USER node
CMD ["node", "server.js"]
