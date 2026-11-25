# Build context is the repo root (see docker-compose.yml) so the Vite source is
# in scope for the build stage.

# --- build stage: produce dist/ ---------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Copy manifests first so `npm ci` is cached until dependencies actually change.
COPY package.json package-lock.json ./
RUN npm ci

# The app reads its published notes from its own origin, through the backend,
# so which bucket it serves is the backend's runtime setting
# (FRETBOOK_NOTES_BUCKET), not a build arg. See docs/notes-via-s3-client.md.
#
# The one thing baked in is the Clerk publishable key: Vite inlines VITE_*
# variables at build time, and .env.local never reaches this stage because
# .dockerignore drops *.local. It is a public key, so a build arg is fine.
# Failing here beats shipping a bundle that throws on load.
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=${VITE_CLERK_PUBLISHABLE_KEY}
RUN test -n "$VITE_CLERK_PUBLISHABLE_KEY" || { echo 'VITE_CLERK_PUBLISHABLE_KEY build arg is empty; set it in docker/app/.env' >&2; exit 1; }

COPY . .
RUN npm run build

# --- serve stage: caddy over the static output ------------------------------
FROM caddy:2-alpine
COPY docker/app/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv

EXPOSE 80
