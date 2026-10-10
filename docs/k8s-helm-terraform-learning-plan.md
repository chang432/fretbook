# Learning plan — Fretboard Notebook on Kubernetes, Helm and Terraform

A guided migration of this repo from Docker Compose on one OVH VPS to k3s +
Helm + Terraform on the *same* VPS. Designed as a teaching curriculum: each
module explains the concepts, then **you** write the files and I review them.

**How to use it:** work one module at a time, in order. Open a session with
"Module N" and I'll teach the concepts, point you at the exact docs, and hand
you the task. You write it; I review the diff, quiz you on the Self-check
questions, and we commit before moving on. Nothing in a later module is needed
to finish an earlier one.

---

## 1. The honest tradeoff

For a two-container app on a single box, Kubernetes is more machinery than the
problem needs: Compose already does this in 40 lines, and k3s will consume
~500MB–1GB of the VPS's RAM to do the same job. The payoff is that you learn
the thing the industry runs on, and you end up with declarative
infrastructure, rolling updates with real rollback, and a deploy path that
survives moving to a second node or a managed cluster.

Two things genuinely get *better* even at this size:

- **Builds leave the VPS.** Today the box runs `npm ci && npm run build` on
  every deploy. Kubernetes never builds images — it pulls them — so the VPS
  stops doing compile work and just runs containers.
- **Rollback becomes one command.** Today a bad deploy is `compose down` +
  rebuild from an older commit. Later it's `helm rollback`.

The cost is complexity you now have to understand. That's the point of the
plan.

---

## 2. Where you are today

```
VPS (OVH, classic VPS product)
└─ edge Caddy :80/:443  (host network, TLS via HTTP-01, routes by Host)
   ├─ PROD_DOMAIN → 127.0.0.1:8081 → compose project fretbook-prod
   └─ DEV_DOMAIN  → 127.0.0.1:8082 → compose project fretbook-dev

each compose project = 2 containers
  web      caddy:2-alpine, serves dist/ on :80, reverse_proxies /api/* → backend
  backend  python:3.12-slim, Flask under gunicorn :8000  (/api/health, /api/version)

deploy = GitHub Actions → ssh to VPS → git reset --hard → docker compose up --build
images are built on the box, tagged :dev / :prod
notes are baked into the web image at build time from public/notes/
```

Two facts that make this migration easy, and worth noticing now:

- **There is no state.** No database, no uploads, no PVC needed. Notes are
  static JSON compiled into the image by `vite-plugin-notes.js`. Both
  Deployments will be purely stateless — you get to skip the hardest part of
  Kubernetes entirely.
- **`/api` is a real prefix.** The Flask blueprint is registered at
  `url_prefix="/api"`, so an Ingress can route `/api` to the backend with **no
  path rewriting**. Rewrite rules are the #1 source of Ingress confusion;
  you've accidentally avoided them.

## 3. Where you're going

End state, after the final (prod) phase:

```
VPS
└─ ingress-nginx :80/:443   (k3s, TLS via cert-manager + Let's Encrypt)
   ├─ PROD_DOMAIN → Ingress → namespace fretbook-prod
   └─ DEV_DOMAIN  → Ingress → namespace fretbook-dev

each namespace = one Helm release of ./charts/fretbook
  Deployment web      ghcr.io/<you>/fretbook-web:<git-sha>      Service :80
  Deployment backend  ghcr.io/<you>/fretbook-backend:<git-sha>  Service :8000
  Ingress: /api → backend, / → web

Terraform owns:  Route 53 records, S3 state, namespaces, ingress-nginx, cert-manager
Helm + CI own:   the application releases
```

Intermediate state you'll live in for most of this plan (dev first, prod
untouched):

```
VPS
└─ edge Caddy :80/:443                     ← stays, still terminates TLS
   ├─ PROD_DOMAIN → 127.0.0.1:8081         → compose fretbook-prod  (untouched)
   ├─ DEV_DOMAIN  → 127.0.0.1:30080        → k3s ingress → namespace fretbook-dev
   └─ k3s-dev.<domain> → 127.0.0.1:30080   → same, temporary test hostname
```

This is deliberate: prod keeps serving from Compose through every module
below, and TLS stays Caddy's job until the very last phase. One moving part at
a time.

## 4. Who owns what — the boundary that matters most

People misuse these three tools by letting their scopes bleed. Hold this
table in your head:

| Tool | Owns | Cadence | In this project |
|---|---|---|---|
| **Kubernetes** | The *runtime*: what containers exist, where, with what networking | Continuous (controllers reconcile constantly) | k3s on the VPS |
| **Helm** | *Packaging* a set of k8s objects as one versioned, parameterised release | Every app deploy (many/day) | `charts/fretbook`, two values files |
| **Terraform** | *Provisioning* long-lived infrastructure that isn't the app | Rarely (weeks/months) | Route 53 DNS, S3 state, cluster add-ons |

Rules this plan follows:

1. **Terraform does not deploy the app.** It's technically possible with the
   `helm` provider, and it's a trap: app deploys happen 20× more often than
   infra changes, and they'd contend on one state lock and conflate "my DNS is
   wrong" with "my deploy failed". CI runs `helm upgrade`; Terraform installs
   the *cluster* Helm releases (ingress-nginx, cert-manager) that change twice
   a year.
2. **Terraform does not manage the OVH box.** You're on the classic VPS
   product, not Public Cloud/OpenStack, so there's no meaningful
   Terraform resource for the instance. The VPS and its k3s install stay
   manual + documented. If this ever moves to OVH Public Cloud, the OpenStack
   provider would own the instance and that's a natural follow-up module.
3. **Helm does not template everything.** Only what actually differs between
   dev and prod gets a value. Over-parameterised charts are unreadable.

## 5. Decisions made, and decisions still open

Settled:

| Question | Decision | Why |
|---|---|---|
| Distribution | **k3s** | Single binary, ~1 process, bundles containerd/CoreDNS/metrics-server/local-path; full kubeadm on one 2-core VPS is wasteful |
| Registry | **GHCR** (`ghcr.io`) | Free for public repos, auth via the Actions `GITHUB_TOKEN` you already have, public images need no `imagePullSecret` |
| Image tags | **Git SHA**, immutable | `:dev` can't tell you what's running or roll back to a known build |
| Ingress controller | **ingress-nginx** | Most documented; you'll learn transferable concepts. (k3s's bundled Traefik gets disabled at install.) |
| Env separation | **Namespaces** `fretbook-dev` / `fretbook-prod` | Direct analogue of the Compose `-p` project you already use |
| Migration order | **Dev fully, then prod much later** | Prod never at risk while you're learning |
| DNS | **Route 53** via Terraform `aws` provider | Your zone is on AWS; a DNS record is the ideal first Terraform resource |
| TF state | **S3 backend** (+ native lockfile) | You already have AWS; teaches remote state properly, costs cents |
| Practice | **k3d locally + k3s on the VPS** | Break things locally for free; use the VPS only for what's environment-specific |

Open, and we'll decide them inside the module that needs them:

- **How CI reaches the cluster** (Module 10): SSH to the box and run Helm
  there (reuses today's `SSH_PASSWORD`, exposes nothing new) vs. a kubeconfig
  in a GitHub secret with the API server open on 6443. I'll recommend SSH for
  now, and we'll discuss why pull-based GitOps (Flux/Argo) is the real answer
  at scale.
- **Whether prod ever migrates** (Module 12). You may decide the Compose prod
  stack is fine. That's a legitimate outcome.

## 6. Concept map — translate what you already know

Learn Kubernetes by mapping it onto this repo rather than from scratch:

| Today | Kubernetes equivalent | Note |
|---|---|---|
| `services: backend:` in compose | **Deployment** + **Service** | Compose conflates "what to run" and "how to reach it"; k8s splits them |
| `restart: unless-stopped` | Deployment's **ReplicaSet** controller | Restarting isn't a flag, it's the whole model: declare desired state, a controller reconciles |
| `healthcheck:` (the python urllib one-liner) | **readinessProbe** / **livenessProbe** | Compose has one notion of health; k8s has two, and the distinction matters |
| `depends_on: condition: service_healthy` | *nothing* — and that's correct | Pods start in any order; readiness + retries replace ordering. The web pod must tolerate a missing backend |
| `docker compose -p fretbook-dev` | **Namespace** | |
| `/opt/fretbook-dev-deploy.env` | **ConfigMap** / **Secret** + Helm values | |
| `${WEB_PORT}` / `${IMAGE_TAG}` interpolation | `values-dev.yaml` / `values-prod.yaml` | |
| loopback port `8082` per env | **Service** + **Ingress** (no per-env host port) | |
| app Caddy's `reverse_proxy /api/* → backend` | **Ingress** path rule | This block gets *deleted* from the Caddyfile |
| app Caddy's `try_files {path} /index.html` | stays in the Caddyfile | SPA fallback is still the static server's job |
| edge Caddy TLS + Host routing | **Ingress controller** + **cert-manager** | Last phase only |
| `compose up --build` on the box | CI builds → pushes → `helm upgrade --install` | The core workflow change |
| `compose down && up --force-recreate` | **rolling update** | k8s default: new pod ready before old one dies |
| `git reset --hard` on the VPS | nothing — the box no longer holds source | A real simplification |
| `docker image prune -f` | kubelet image GC | Automatic, but tune it on a small disk |

## 7. How each session works

1. I teach the concepts with the *why*, and link the specific upstream docs
   (not a dump — 1–3 pages per module).
2. I give you the task and the acceptance criteria. You write every file.
3. You get stuck → ask. I'll explain and point, not paste a solution, unless
   you explicitly ask me to write it.
4. I review your work like a code review: correctness, then idiom.
5. I ask you the Self-check questions. If an answer is shaky we go back to the
   concept, not forward.
6. You commit. Each module is one commit on `dev` with a message naming the
   module.

Ask me at any point for: a deeper dive, a diagram, a "what breaks if I do X"
walkthrough, or a deliberately broken manifest to debug (that last one is the
single most useful exercise in this plan — use it).

---

# The curriculum

Twelve modules, ~1.5–2.5h each. Phases 0–3 are local and risk-free; Phase 4 is
the first time you touch the VPS. Estimate ~25 hours total.

## Phase 0 — Mental models and toolchain

### Module 0 — Orientation (local, no project changes)

**Concepts:** declarative vs imperative (the reconciliation loop is *the*
Kubernetes idea); the control plane (API server, scheduler, controller
manager, etcd/sqlite) vs the node (kubelet, container runtime, kube-proxy);
what a Pod actually is (shared network namespace + lifecycle, not "a
container"); why k3s exists; `kubectl` as a thin REST client (`-v=8` to prove
it).

**You build:** install `kubectl`, `helm`, `k3d`, `terraform` (ask me for the
Homebrew lines). Create a local cluster: `k3d cluster create fretbook-local`.
Run `kubectl get nodes`, `kubectl api-resources`, `kubectl explain deployment.spec`.

**Done when:** you can explain, in your own words, what happens between
`kubectl apply -f pod.yaml` and the container running — naming four
components.

**Gotcha:** `kubectl` version-skews silently. Keep client and cluster within
one minor version.

**Self-check:** Why is there no `kubectl restart`? What does Kubernetes do if
you `docker rm` a container it manages, and why?

## Phase 1 — Kubernetes fundamentals, by hand

Deliberately **no Helm** in this phase. Writing raw YAML once makes Helm
obvious later; starting with Helm makes Kubernetes a mystery.

### Module 1 — Pods, Deployments, Services

**Concepts:** Pod → ReplicaSet → Deployment ownership chain; labels and
selectors (the only coupling mechanism in Kubernetes — get this wrong and
nothing finds anything); Service types (ClusterIP / NodePort / LoadBalancer)
and what cluster DNS gives you (`backend.fretbook-dev.svc.cluster.local`);
`kubectl describe` and `kubectl get events` as primary debugging tools.

**You build:** `k8s/raw/backend-deployment.yaml` and
`k8s/raw/backend-service.yaml`. Build the backend image locally, import it
into k3d (`k3d image import`), apply, and reach `/api/health` via
`kubectl port-forward`.

**Done when:** `kubectl get pods -l app=backend` shows 1/1 Running, and
port-forward returns `{"status":"ok"}`.

**Gotchas:** `imagePullPolicy: IfNotPresent` for locally-imported images, or
the kubelet tries GHCR and fails; a label typo between `spec.selector` and
`template.metadata.labels` yields a Deployment that creates nothing and no
error. Expect to hit both — they're the point.

**Self-check:** Why does deleting a Pod directly not fix anything? What
actually load-balances a Service — the Service object, or something else?

### Module 2 — Ingress, probes, and configuration

**Concepts:** Ingress vs Service (L7 vs L4) and that an Ingress object does
nothing without a controller; `pathType: Prefix` vs `Exact` and rule ordering;
liveness vs readiness vs startup probes (liveness restarts, readiness
de-registers from the Service — confusing them causes restart storms);
ConfigMap and Secret as env vars; why `WEB_CONCURRENCY` belongs in a ConfigMap
and nothing here belongs in a Secret yet.

**You build:** `k8s/raw/` grows `web-deployment.yaml`, `web-service.yaml`,
`ingress.yaml`, `configmap.yaml`. Translate the compose healthcheck into an
`httpGet` readiness probe on `/api/health`. Install ingress-nginx in k3d and
reach the whole app — SPA *and* `/api/version` — through one hostname.

**Done when:** `curl -H 'Host: fretbook.localtest.me' localhost:8080/api/version`
and `/` both answer correctly, through the Ingress, with no port-forward.

**Gotchas:** k3d needs its loadbalancer port mapped at cluster-create time;
`ingressClassName` is mandatory in practice; a readiness probe with too short
an `initialDelaySeconds` makes gunicorn flap on startup.

**Self-check:** Why does the app Caddyfile lose its `/api` reverse_proxy block
but keep `try_files`? If the backend pod dies, what does a request to `/api`
return and which component decided that?

## Phase 2 — Images become artifacts

### Module 3 — Registry, immutable tags, and splitting the web image

**Concepts:** why Kubernetes can't build (no build step exists in the API);
registries, manifests and digests; tag mutability as a correctness problem
(`:dev` makes "what's running?" unanswerable); `imagePullPolicy` semantics vs
tag choice; layer caching in CI (`cache-from`/`cache-to` with GHA cache);
public vs private packages and `imagePullSecret`.

**You build:** `.github/workflows/build-images.yml` — build both images on
push, tag `ghcr.io/<you>/fretbook-{web,backend}:<sha>` plus a moving
`:dev-latest` for convenience, push with `docker/build-push-action`. Edit
`docker/app/caddy/Caddyfile` to drop the `/api` proxy block. Point your local
raw manifests at the GHCR tags and redeploy in k3d from the registry.

**Done when:** a push to `dev` produces two pullable images, and your local
cluster runs the *registry* images, not locally-built ones.

**Gotchas:** `packages: write` permission on the job; the first push creates a
*private* package even in a public repo — flip it to public or you'll need a
pull secret; the web image's build context is the repo root (keep the existing
`context: ../..` arrangement in mind when writing the workflow).

**Self-check:** You're paged and `kubectl get deploy -o wide` shows
`fretbook-web:dev`. What can you determine about the running code? Now with a
SHA tag?

## Phase 3 — Helm

### Module 4 — Chart fundamentals

**Concepts:** what a chart is (templates + values + metadata) and what Helm
*adds* over `kubectl apply` (one named release, history, atomic upgrade,
rollback); chart layout (`Chart.yaml`, `values.yaml`, `templates/`,
`_helpers.tpl`, `NOTES.txt`); Go templating basics — `.Values`, `.Release`,
`.Chart`, `include`, `nindent`, `toYaml`, `quote`; `helm lint`,
`helm template`, `--dry-run=server`; where Helm stores release state (a Secret
in the namespace — Helm is not a server).

**You build:** `charts/fretbook/` — convert every file in `k8s/raw/` into
templates with a sane `values.yaml` and a `_helpers.tpl` providing
`fretbook.fullname` and the standard label set. `helm install fretbook-dev
charts/fretbook -n fretbook-dev --create-namespace` into k3d. Then delete
`k8s/raw/` — it was scaffolding, and leaving two sources of truth is the
mistake to avoid.

**Done when:** `helm template` output is byte-equivalent in behaviour to your
raw YAML, and the local release serves the app.

**Gotchas:** YAML indentation inside templates (`nindent` vs `indent`); a
missing `{{- if }}` guard rendering an empty block; templating the Service
*selector* so it can drift from the Deployment labels — put both behind one
helper.

**Self-check:** Where does Helm keep the fact that release `fretbook-dev` is
at revision 4? What does `helm rollback` actually re-apply, and what is it
unable to roll back?

### Module 5 — Multi-environment values and release lifecycle

**Concepts:** values precedence (`values.yaml` → `-f` files → `--set`);
designing the dev/prod axis (replicas, resources, hostname, image tag) and
resisting the urge to parameterise more; requests vs limits and QoS classes —
critical on a 2GB VPS; `helm upgrade --atomic --wait --timeout`;
`helm history` / `rollback`; `helm diff` (plugin) as the Helm equivalent of
`terraform plan`.

**You build:** `charts/fretbook/values-dev.yaml` and `values-prod.yaml`.
Resource requests/limits sized for the VPS (we'll compute them together from
gunicorn's 2 workers × 4 threads). Drill the lifecycle locally: upgrade to a
new SHA, watch the rolling update with `kubectl get pods -w`, break it
deliberately with a bad image tag, observe `ImagePullBackOff`, then
`helm rollback`.

**Done when:** you can install either environment from one chart with one
flag, and you've recovered from a deliberately broken upgrade without deleting
anything.

**Gotchas:** `--atomic` without `--timeout` hangs CI; limits that are too low
get the backend OOMKilled under gunicorn's preload; no `maxUnavailable`
thought-through means a 1-replica dev deploy *does* have a gap.

**Self-check:** With `replicas: 1` and default rolling-update settings, is
there downtime on upgrade? What changes with 2 replicas? Why might you still
choose 1 here?

## Phase 4 — The real cluster (dev only)

First VPS contact. Prod Compose keeps serving throughout — that's the whole
design of this phase.

### Module 6 — k3s on the OVH VPS, alongside Compose

**Concepts:** what k3s bundles and what to disable; why Traefik must be
disabled here (edge Caddy owns :80/:443 and two things cannot bind them); how
a NodePort is reachable on `127.0.0.1` so the edge can proxy to it; kubeconfig
anatomy (cluster/context/user) and merging contexts on your Mac; the
`--tls-san` flag and why remote `kubectl` fails without it; firewall posture —
6443 and the NodePort must not be world-reachable.

**You build:** install k3s with `--disable traefik --disable servicelb
--write-kubeconfig-mode 644 --tls-san <VPS_IP>`; install ingress-nginx with a
fixed `NodePort` 30080; add a third site block to `docker/edge/Caddyfile` for
a temporary `k3s-dev.<domain>` → `127.0.0.1:30080`; add the matching Route 53
A record *by hand* (Module 8 will adopt it into Terraform — adopting an
existing resource is a Terraform lesson in itself); firewall rules; take a VPS
snapshot first.

**Done when:** `kubectl get nodes` works from your Mac, and
`k3s-dev.<domain>` reaches the ingress controller (a 404 from nginx is a pass
— nothing is deployed yet). `PROD_DOMAIN` and `DEV_DOMAIN` are still served by
Compose and unaffected.

**Gotchas:** k3s on a small VPS — check free RAM before and after; the
kubeconfig's `server:` is `127.0.0.1` and must be rewritten to the VPS IP for
remote use; `ufw` and container iptables rules interact badly, so *verify from
off-box* that 30080 and 6443 are closed rather than assuming; k3s's embedded
sqlite datastore lives in `/var/lib/rancher/k3s` — note it for backups.

**Self-check:** Why is `--disable servicelb` right here, but wrong on a cloud
provider with a real load balancer? What breaks if you skip `--tls-san`?

### Module 7 — Deploy dev to the VPS, then retire the dev Compose stack

**Concepts:** release promotion by values, not by chart change; the cutover
pattern (new path alongside old → verify → flip the name → retire old); what
to check before you trust a deployment (rollout status, events, logs,
end-to-end request, *and* the SPA deep-link path).

**You build:** `helm upgrade --install fretbook-dev charts/fretbook -n
fretbook-dev -f values-dev.yaml --set image.tag=<sha>` from your laptop
against the VPS. Verify through `k3s-dev.<domain>`, including a deep link like
`/notes/passionfruit_by_drake` and a published note JSON. Then repoint
`DEV_DOMAIN` in `docker/edge/Caddyfile` from `127.0.0.1:8082` to
`127.0.0.1:30080`, and only after that `docker compose -p fretbook-dev down`.

**Done when:** `DEV_DOMAIN` serves from Kubernetes, prod still serves from
Compose, and you have a written one-line rollback (flip the Caddy block back,
`compose up -d`) that you have actually tested once.

**Gotcha:** `deploy.yml` re-applies `docker/edge/Caddyfile` on *every* deploy
of either environment — so your edited Caddyfile must be committed, or the
next prod deploy silently reverts your cutover. This coupling is worth
understanding before you flip anything.

**Self-check:** Which component serves TLS for dev right now? Which serves the
SPA fallback? Which routes `/api`? (Three different answers — name each.)

## Phase 5 — Terraform

### Module 8 — Terraform fundamentals, on DNS

**Concepts:** HCL syntax; providers and version constraints with the lockfile;
resources vs data sources; **state** — what it is, why it's the source of
truth, why it must be remote and must never be committed (it holds
secrets in plaintext); the plan/apply cycle and reading a plan properly
(create/update/**replace**/destroy — learn to spot a destroy you didn't
intend); variables, locals, outputs; drift; `terraform import` for resources
that already exist; `fmt` and `validate`.

**You build:** `terraform/dns/` with the `aws` provider managing the Route 53
A records for dev, prod and `k3s-dev`. Import the records that already exist
rather than recreating them. Then migrate state to an S3 backend with native
locking. Scope the IAM credentials to that one hosted zone and that one bucket
— least privilege is part of the lesson.

**Done when:** `terraform plan` is clean against reality (no changes), and you
can change a TTL through Terraform and see it in Route 53.

**Gotchas:** apex vs subdomain records; TTL caching will mislead you while
testing; a `destroy` plan on a live DNS record is the first genuinely
dangerous thing in this plan — read every plan before applying; never commit
`terraform.tfstate` or `.tfvars` with keys (add both to `.gitignore` in this
module).

**Self-check:** You delete a record in the AWS console. What does the next
`plan` say, and what does `apply` do? Why is that different from what Helm
would do?

### Module 9 — Terraform as cluster bootstrap

**Concepts:** layering (`dns/` vs `bootstrap/`) and why blast radius, not
tidiness, decides the split; the `kubernetes` and `helm` providers;
provider-configuration-from-another-resource as a known Terraform sharp edge;
what belongs in Terraform (namespaces, add-ons, cluster-scoped config) vs CI
(the app release); `terraform destroy` semantics on a cluster add-on.

**You build:** `terraform/bootstrap/` managing the `fretbook-dev` (and later
`fretbook-prod`) namespaces and the ingress-nginx Helm release you installed
by hand in Module 6 — again by **import**, so the manual install becomes
code without downtime.

**Done when:** `plan` is clean, and you can articulate why the *app* release
is not in this directory.

**Gotcha:** the Helm provider holding a release means two tools believe they
own cluster state. Draw the line explicitly and write it in a README in that
directory.

**Self-check:** Name two resources that would be wrong to put in
`bootstrap/`, and say why. What happens to running pods if you
`terraform destroy` the namespace?

## Phase 6 — CI/CD

### Module 10 — The new dev pipeline

**Concepts:** build-once/deploy-many; the deploy job's identity problem (how
does a runner authenticate to a cluster?) and the three options — SSH + Helm
on the box, kubeconfig secret with 6443 exposed, or pull-based GitOps; why
GitOps (Flux/Argo) is the real answer at scale and why it's overkill at one
app; `kubectl rollout status` as the gate; failure handling with `--atomic`;
keeping the verify phase you already have.

**You build:** rewrite `.github/workflows/deploy.yml` for dev: keep phase 1
(lint, build, `test -f dist/notes.json`, Flask import — all still valuable),
replace the compose-on-box phase with build/push + `helm upgrade --install
--atomic --wait`, and make the job fail loudly on a bad rollout. Keep the prod
caller on the *old* compose path until Module 12 — the two deploy paths
coexist, on purpose.

**Done when:** a merge to `dev` deploys to Kubernetes with no SSH build step,
and a deliberately broken commit fails CI without taking dev down.

**Gotchas:** the `verify` → `deploy` job boundary loses the built `dist/`
(images are built in the deploy phase, not reused from verify — know why);
concurrency groups still matter; the image tag must be the *commit SHA of the
merge*, not `latest`.

**Self-check:** Your pipeline pushes an image and the `helm upgrade` fails.
What state is dev in? With `--atomic`? Without?

## Phase 7 — Operate it

### Module 11 — Ops drills and survival skills

**Concepts:** the debugging loop (`get` → `describe` → `logs` →
`get events --sort-by=.lastTimestamp` → `exec`); reading pod states
(`Pending` = scheduling, `CrashLoopBackOff` = app, `ImagePullBackOff` =
registry — three different teams' problems); resource pressure, eviction and
OOMKill on a small node; kubelet image GC and disk watermarks; k3s backup
(sqlite datastore + your manifests are the whole recovery story); upgrading
k3s on a single node; `metrics-server` and `kubectl top`.

**You build:** a short `docs/runbook.md` you'd trust at 2am: deploy, roll
back, read logs, restart, where TLS comes from, what to do if the VPS reboots.
Then I'll hand you 4–5 deliberately broken scenarios to diagnose
blind — bad selector, wrong port, OOM limit, missing ConfigMap key, bad probe.

**Done when:** you diagnose each scenario from `kubectl` output alone, without
me telling you what I broke.

**Self-check:** A pod is `Running` but the site 502s. List the three most
likely causes in the order you'd check them.

## Phase 8 — Later: production

### Module 12 — cert-manager, the ingress takes :443, Compose retires

Do this only once dev has run on k3s long enough that you trust it (weeks, not
days).

**Concepts:** cert-manager's CRDs (`Issuer`/`ClusterIssuer`, `Certificate`,
`Order`, `Challenge`) and the ACME HTTP-01 flow you already use via Caddy —
same protocol, different implementation; the Let's Encrypt **staging** issuer
and rate limits (the single most common cert-manager mistake is burning the
prod rate limit while debugging); TLS Secrets and `ingress.tls`; port handover
from edge Caddy to ingress-nginx; zero-downtime cutover planning.

**You build:** cert-manager + a staging `ClusterIssuer` via Terraform
`bootstrap/`; a `Certificate` for dev first, verified against staging, then
prod issuer; a `fretbook-prod` release; then the handover — stop edge Caddy,
move ingress-nginx to `hostPort`/NodePort 80+443, confirm both hostnames and
certificate issuance. Finally delete `docker/` and the compose paths in CI,
and rewrite `README.md` + `docker/README.md` into one architecture doc that
matches reality.

**Done when:** both hostnames serve valid Let's Encrypt certificates from
Kubernetes, `docker/` is gone, and the repo's docs describe the system you
actually have.

**Gotchas:** certificates currently live in the `caddy_data` volume and are
**not** reused — cert-manager issues fresh ones, so there's a brief
issuance window; do the port handover with a tested rollback (keep the edge
compose file until the next day); HTTP-01 needs :80 reachable *by Let's
Encrypt*, so the firewall rules from Module 6 matter here.

**Self-check:** Why test with the staging issuer first? If issuance fails,
which CRD do you inspect, and in what order?

---

## 8. Risks and rollback

| Risk | Mitigation |
|---|---|
| k3s starves the VPS of RAM and prod Compose suffers | Check free RAM in Module 6 *before* deploying anything; set requests/limits; k3s with Traefik/servicelb disabled is ~400–600MB |
| A prod deploy reverts your edge Caddyfile cutover | Commit every edge change (Module 7 gotcha) — this is the sharpest edge in the whole plan |
| NodePort/6443 exposed to the internet | Verify from off-box, not from the VPS; part of Module 6's done-when |
| Terraform destroys a live DNS record | Read every plan; S3 state with locking; least-privilege IAM |
| Let's Encrypt rate limit burned during Module 12 | Staging issuer until the flow works end to end |
| Learning stalls mid-migration, repo left half-migrated | Each module ends in a committed, working state with both stacks functional; stopping after any module is safe |

Global rollback, valid through Module 11: revert the `DEV_DOMAIN` block in
`docker/edge/Caddyfile`, `docker compose -p fretbook-dev up -d`, done. Prod is
never in the blast radius until Module 12.

## 9. Cost estimate

New recurring cost: **≈ $0.00–0.60 / month.** Nothing here requires a new paid
service.

| Item | Cost | Note |
|---|---|---|
| OVH VPS | unchanged | Same box. Compile work moves to GitHub, so load *drops* |
| GHCR (container registry) | $0 | Free and unlimited for public repos. Private: 500MB storage on the Free plan, these images are ~60–150MB each |
| GitHub Actions | $0 | Unlimited minutes for public repos |
| AWS Route 53 hosted zone | $0.50/mo | **Already paying this** — Terraform adds nothing |
| Route 53 queries | ~$0.00 | $0.40 per million |
| S3 bucket for Terraform state | < $0.05/mo | A few KB + a handful of requests; use S3 native locking so no DynamoDB table is needed |
| cert-manager / Let's Encrypt | $0 | |
| k3s, Helm, Terraform (CLI) | $0 | Terraform stays on the free CLI — no Terraform Cloud needed |

Non-monetary cost: ~25 hours of your time, and a permanently more complex
system to operate. Worth it for the learning; worth re-deciding at Module 12
whether prod should follow.

## 10. Manual Setup Required From Owner

Things I cannot do from here. Ordered by the module that needs them.

**Before Module 3 (GHCR)**
- Decide public vs private packages for `ghcr.io/<you>/fretbook-*`. Public is
  recommended (the repo is already public) and avoids `imagePullSecret`.
- After the first image push, set the package visibility to public in the
  GitHub package settings — the first push creates it private regardless of
  repo visibility.

**Before Module 6 (VPS)**
- Confirm the VPS's RAM/CPU/disk and take a **snapshot** in the OVH panel
  before installing k3s.
- Confirm SSH access and that passwordless sudo still works.
- Firewall: keep 80/443 open; ensure 6443 and 30080 are **not** reachable from
  the internet (OVH network firewall and/or `ufw` on the box).
- Add a Route 53 A record for the temporary `k3s-dev.<domain>` hostname.

**Before Module 8 (Terraform)**
- Create an AWS IAM user (or role) for Terraform with least-privilege access
  to the one Route 53 hosted zone and the one state bucket; generate access
  keys and store them locally (e.g. `~/.aws/credentials` profile), never in
  the repo.
- Create the S3 bucket for Terraform state (versioning on, public access
  blocked) — or tell me and we'll bootstrap it with a separate tiny TF
  configuration.
- Note the hosted zone ID.

**Before Module 10 (CI)**
- Decide the cluster-access method (I'll recommend SSH + Helm on the box).
- Add any new repository secrets that choice requires; confirm the existing
  `SSH_PASSWORD`, `VPS_IP`, `PROD_DOMAIN`, `DEV_DOMAIN`, `ACME_EMAIL` are
  still set.
- If you ever want Terraform to run in CI, add the AWS keys as repo secrets —
  but running `terraform apply` from your laptop is fine and safer at this
  scale.

**Before Module 12 (prod)**
- Decide whether prod migrates at all.
- Schedule a low-traffic window for the :80/:443 handover.
- Confirm the ACME contact email.

## 11. Glossary

Pod, Deployment, ReplicaSet, Service, Ingress, Namespace, ConfigMap, Secret,
label selector, probe (liveness/readiness/startup), control plane, kubelet,
kube-proxy, CNI, NodePort, ClusterIP, rolling update, CRD, controller,
reconciliation loop, chart, release, revision, values, template function,
state, plan, apply, drift, import, provider, backend, HCL.

Ask me for a definition of any of these in context — "in this project, what is
X" is a better question than the upstream glossary entry.

## 12. Progress tracker

- [ ] Module 0 — Orientation and toolchain
- [ ] Module 1 — Pods, Deployments, Services (local)
- [ ] Module 2 — Ingress, probes, configuration (local)
- [ ] Module 3 — GHCR, immutable tags, web image split
- [ ] Module 4 — Helm chart fundamentals
- [ ] Module 5 — Multi-env values and release lifecycle
- [ ] Module 6 — k3s on the VPS, alongside Compose
- [ ] Module 7 — Dev on Kubernetes; dev Compose retired
- [ ] Module 8 — Terraform fundamentals on Route 53 + S3 state
- [ ] Module 9 — Terraform cluster bootstrap
- [ ] Module 10 — CI/CD via build/push + Helm
- [ ] Module 11 — Ops drills and runbook
- [ ] Module 12 — cert-manager, prod migration, Compose retired
