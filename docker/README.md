# docker

Two subfolders, split by how many of each the host runs:

| | | |
|---|---|---|
| `app/` | the application stack | **one per environment** — instantiated twice on the VPS, as dev and prod |
| `edge/` | the public reverse proxy | **one per host** — owns `:80`/`:443`, routes to the stacks by hostname |

`app/` is the whole application; `edge/` only exists because both environments
share one machine. Locally you run `app/` alone.

## app/

Two containers:

| Service   | Image base       | Role                                                            |
|-----------|------------------|-----------------------------------------------------------------|
| `web`     | `caddy:2-alpine` | Serves the built Vite app on `:80`, proxies `/api/*` to `backend` |
| `backend` | `python:3.12-slim` | Flask under gunicorn on `:8000`, not published to the host      |

## Run

```bash
cd docker/app
docker compose up --build        # http://localhost:8080
WEB_PORT=3000 docker compose up  # different host port
```

The published port is bound to `127.0.0.1` (see *Deployment* below), so the
stack is reachable from the machine running it and nowhere else.

The frontend is built inside the image (`node:22-alpine` stage runs `npm ci &&
npm run build`), so no local `npm run build` is needed first. The build context
for `web` is the repo root; `backend` builds from `docker/app/backend`.

## Layout

```
docker/
  README.md
  app/                    # one stack per environment
    docker-compose.yml    # the template; -p and an env file make it dev or prod
    caddy/
      Dockerfile          # multi-stage: node build -> caddy
      Caddyfile           # static file server + /api reverse proxy
    backend/
      Dockerfile
      requirements.txt
      gunicorn.conf.py    # bind/workers/timeout from env
      wsgi.py             # gunicorn entrypoint
      app/
        __init__.py       # application factory
        api.py            # /api blueprint
  edge/                   # one proxy per host
    docker-compose.yml
    Caddyfile             # TLS + hostname routing to each environment
```

`app/caddy/Dockerfile` builds from the **repo root** (`context: ../..`), so the
Vite source is in scope for its node stage; paths inside it are therefore
written from the root, as `docker/app/caddy/...`. `app/backend` builds from its
own directory.

## Backend

The app is static today, so the backend ships only `GET /api/health` (used by
the compose healthcheck) and `GET /api/version`. Add routes to
`backend/app/api.py`, or register further blueprints in `create_app()`.

Run it outside docker:

```bash
cd docker/app/backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
gunicorn --config gunicorn.conf.py wsgi:app   # http://localhost:8000/api/health
```

Environment knobs (set on the `backend` service in `docker-compose.yml`):
`PORT`, `WEB_CONCURRENCY`, `GUNICORN_THREADS`, `GUNICORN_TIMEOUT`, `LOG_LEVEL`.

## Deployment

Both environments run on a **single VPS**, deployed by
`.github/workflows/on_merge_dev.yml` (branch `dev`) and `on_merge_main.yml`
(branch `main`). Everything that could collide between them is namespaced by
environment, and neither app stack holds a public port:

```
VPS
└─ edge caddy :80/:443              docker/edge/, run from /opt/fretbook-edge
   ├─ PROD_DOMAIN → 127.0.0.1:8081     project fretbook-prod, /opt/fretbook-prod
   └─ DEV_DOMAIN  → 127.0.0.1:8082     project fretbook-dev,  /opt/fretbook-dev
```

| Namespaced by environment | dev | prod |
|---------------------------|-----|------|
| Checkout                  | `/opt/fretbook-dev` | `/opt/fretbook-prod` |
| Compose project           | `fretbook-dev` | `fretbook-prod` |
| Image tags                | `fretbook-*:dev` | `fretbook-*:prod` |
| Loopback port             | `8082` | `8081` |
| Deploy env file           | `/opt/fretbook-dev-deploy.env` | `/opt/fretbook-prod-deploy.env` |

Deploying one environment rebuilds only its own project, so the other keeps
serving throughout. Both workflows share a single concurrency group, because
each run also re-applies the shared edge proxy.

## TLS

The edge proxy terminates TLS for the whole box and issues certificates over
HTTP-01 — no DNS provider credentials, just port 80 open and an A record for
each hostname pointing at the VPS. Certificates live in the `caddy_data` named
volume, so redeploys do not re-issue them.

`caddy/Caddyfile` (the inner, per-environment proxy) therefore stays on plain
`:80` with `auto_https off`: it only ever sees traffic forwarded from the edge
over loopback. Locally there is no edge at all, which is why
`docker compose up` still serves plain HTTP on `localhost:8080`.

Adding a third environment means a loopback port and a site block in
`edge/Caddyfile`, a caller workflow, and a `case` arm in `deploy.yml`.
