# Build context is the repo root (see docker-compose.yml) so the Vite source is
# in scope for the build stage.

# --- build stage: produce dist/ ---------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Copy manifests first so `npm ci` is cached until dependencies actually change.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- serve stage: caddy over the static output ------------------------------
FROM caddy:2-alpine
COPY docker/app/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv

EXPOSE 80
