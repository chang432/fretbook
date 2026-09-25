# docker

Two containers:

| Service   | Image base       | Role                                                            |
|-----------|------------------|-----------------------------------------------------------------|
| `web`     | `caddy:2-alpine` | Serves the built Vite app on `:80`, proxies `/api/*` to `backend` |
| `backend` | `python:3.12-slim` | Flask under gunicorn on `:8000`, not published to the host      |

## Run

```bash
cd docker
docker compose up --build        # http://localhost:8080
WEB_PORT=3000 docker compose up  # different host port
```

The frontend is built inside the image (`node:22-alpine` stage runs `npm ci &&
npm run build`), so no local `npm run build` is needed first. The build context
for `web` is the repo root; `backend` builds from `docker/backend`.

## Layout

```
docker/
  docker-compose.yml
  caddy/
    Dockerfile        # multi-stage: node build -> caddy
    Caddyfile         # static file server + /api reverse proxy
  backend/
    dockerfile
    requirements.txt
    gunicorn.conf.py  # bind/workers/timeout from env
    wsgi.py           # gunicorn entrypoint
    app/
      __init__.py     # application factory
      api.py          # /api blueprint
```

## Backend

The app is static today, so the backend ships only `GET /api/health` (used by
the compose healthcheck) and `GET /api/version`. Add routes to
`backend/app/api.py`, or register further blueprints in `create_app()`.

Run it outside docker:

```bash
cd docker/backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
gunicorn --config gunicorn.conf.py wsgi:app   # http://localhost:8000/api/health
```

Environment knobs (set on the `backend` service in `docker-compose.yml`):
`PORT`, `WEB_CONCURRENCY`, `GUNICORN_THREADS`, `GUNICORN_TIMEOUT`, `LOG_LEVEL`.

## TLS

`Caddyfile` listens on plain `:80` with `auto_https off`, assuming TLS is
terminated upstream. To let Caddy handle certificates instead, replace the `:80`
site address with your hostname, drop `auto_https off`, publish `443:443`, and
add a volume for `/data` so certificates survive a restart.
