# Build context is the repo root (see docker-compose.yml) so the Vite source is
# in scope for the build stage.

# --- build stage: produce dist/ ---------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Copy manifests first so `npm ci` is cached until dependencies actually change.
COPY package.json package-lock.json ./
RUN npm ci

# Which bucket this image's site reads its published notes from. Vite inlines
# VITE_* variables at build time, so this has to be present here rather than at
# run time — which is exactly what makes dev and prod different images built
# from the same source. Empty is allowed: /notes then says it was not told
# where the notes are, instead of fetching a nonsense URL.
ARG NOTES_BASE_URL=""
ENV VITE_NOTES_BASE_URL=$NOTES_BASE_URL

COPY . .
RUN npm run build

# --- serve stage: caddy over the static output ------------------------------
FROM caddy:2-alpine
COPY docker/app/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv

EXPOSE 80
