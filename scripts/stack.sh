#!/usr/bin/env bash
#
# Run the stack locally, the way the VPS runs it: caddy serving the built app,
# gunicorn/Flask behind /api, and the published notes read out of the private R2
# bucket over the S3 API.
#
#   npm run stack          build and start, then check it answers
#   npm run stack:logs     follow both containers
#   npm run stack:down     stop and remove them
#
# This is the app stack only. docker/edge/ — TLS and hostname routing for the
# two environments sharing the VPS — has no part to play on a laptop, where
# there is one stack and it is reached on a port.
#
# The notes need credentials, and a stack without them still comes up:
# /api/notes answers 503 and /notes shows an empty shelf. That is a confusing
# thing to debug from the outside, so `up` checks for them first and says what
# is missing, then reports how many notes actually came back.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
APP_DIR="$ROOT/docker/app"
ENV_FILE="$APP_DIR/.env"
PORT="${WEB_PORT:-8080}"

die() {
	printf '%s\n' "$@" >&2
	exit 1
}

# --- preflight ---------------------------------------------------------------

require_docker() {
	command -v docker >/dev/null 2>&1 ||
		die 'No docker on PATH. Install Docker Desktop, or Colima.'

	# The daemon, not just the CLI: `docker compose` fails much later and much
	# less clearly when only the socket is missing.
	docker info >/dev/null 2>&1 || die \
		'The Docker daemon is not running.' \
		'  macOS:  open -a Docker        (give it a few seconds)' \
		'  colima: colima start'
}

# Written rather than demanded, because the shape of the file is the thing worth
# saying and four names are easier to fill in than to guess. Placeholders rather
# than real values: this script is in git and the credentials are not.
write_env_template() {
	cat > "$ENV_FILE" <<'TEMPLATE'
# Local settings for `docker compose up`, git-ignored. The backend reads the
# published notes out of the private bucket over the S3 API; see
# ../../docs/notes-via-s3-client.md.
#
# The token wants **Object Read only** — this end never writes. Publishing is
# `npm run notes:publish`, with the read-write token in your `r2` AWS profile.
FRETBOOK_NOTES_BUCKET=fretbook-notes-dev
FRETBOOK_R2_ENDPOINT=https://<account id>.r2.cloudflarestorage.com
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
TEMPLATE
}

require_env() {
	if [ ! -f "$ENV_FILE" ]; then
		write_env_template
		die "Wrote $ENV_FILE. Fill in the R2 endpoint and a read-only token, then run this again."
	fi

	local missing=""
	for name in FRETBOOK_NOTES_BUCKET FRETBOOK_R2_ENDPOINT AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
		# Either source will do, and compose agrees: it interpolates from the
		# shell first and falls back to the file. So a shell that already
		# carries a credential — an `aws configure export-credentials` eval, a
		# secret manager's wrapper — does not have to copy it onto disk to use
		# this script.
		#
		# Grepping the file rather than sourcing it: it is somebody's
		# credentials, and it does not need to become this shell's environment
		# to be counted.
		[ -n "${!name:-}" ] && continue
		grep -Eq "^${name}=.+" "$ENV_FILE" || missing="${missing} ${name}"
	done

	[ -z "$missing" ] || die \
		"Nothing set for:${missing}" \
		"Put them in $ENV_FILE, or export them before running this." \
		'Without them the stack runs but /notes is empty.'

	# A pasted template is the likelier mistake than an empty one.
	if grep -q '<account id>' "$ENV_FILE"; then
		die "$ENV_FILE still has the <account id> placeholder in it."
	fi
}

# --- commands ----------------------------------------------------------------

compose() {
	# Run from the compose file's own directory so it picks up .env for
	# interpolation, and so the relative build contexts resolve.
	(cd "$APP_DIR" && docker compose "$@")
}

# Poll rather than trust `up -d`: compose returns once the containers are
# started, which is before gunicorn has imported the app or caddy has a route.
wait_for_health() {
	local deadline=$((SECONDS + 120))
	while [ "$SECONDS" -lt "$deadline" ]; do
		if curl -fsS -o /dev/null "http://localhost:${PORT}/api/health" 2>/dev/null; then
			return 0
		fi
		sleep 2
	done
	return 1
}

up() {
	require_docker
	require_env

	compose up --build -d

	printf '\nWaiting for the stack to answer on :%s…\n' "$PORT"
	if ! wait_for_health; then
		printf '\n' >&2
		compose ps >&2 || true
		die "/api/health never answered on :${PORT}. Logs: npm run stack:logs"
	fi

	# The notes are the part most likely to be misconfigured, and the part a
	# green healthcheck says nothing about: the bucket is a different thing from
	# the process being up.
	local status notes
	status=$(curl -s -o /tmp/fretbook-stack-notes.$$ -w '%{http_code}' \
		"http://localhost:${PORT}/api/notes" || echo 000)
	notes=$(grep -o '"slug"' /tmp/fretbook-stack-notes.$$ 2>/dev/null | wc -l | tr -d ' ')
	rm -f /tmp/fretbook-stack-notes.$$

	printf '\nStack up.\n'
	printf '  app          http://localhost:%s\n' "$PORT"
	case "$status" in
		200) printf '  published    http://localhost:%s/notes — %s note(s)\n' "$PORT" "$notes" ;;
		503) printf '  published    /api/notes says the bucket is not configured — check %s\n' "$ENV_FILE" ;;
		*)   printf '  published    /api/notes answered HTTP %s — npm run stack:logs\n' "$status" ;;
	esac
	printf '  api          http://localhost:%s/api/health\n' "$PORT"
	printf '\n  npm run dev        5173, proxying /api to :%s\n' "$PORT"
	printf '  npm run stack:logs follow both containers\n'
	printf '  npm run stack:down stop them\n'
}

case "${1:-up}" in
	up) up ;;
	down)
		require_docker
		compose down
		;;
	logs)
		require_docker
		compose logs -f
		;;
	ps)
		require_docker
		compose ps
		;;
	*) die "Usage: scripts/stack.sh <up|down|logs|ps>" ;;
esac
