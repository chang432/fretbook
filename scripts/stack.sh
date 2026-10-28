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
# For the whole deploy — verify, start, smoke-test, then tail and track the
# logs — use scripts/deploy-local.sh (npm run deploy:local). This one is the
# quick version for daily work.
set -euo pipefail

# shellcheck source=lib/stack.sh
. "$(dirname "${BASH_SOURCE[0]}")/lib/stack.sh"

up() {
	require_docker
	require_env

	compose up --build -d

	printf '\nWaiting for the stack to answer on :%s…\n' "$PORT"
	if ! wait_for_health; then
		compose ps >&2 || true
		die "/api/health never answered on :${PORT}." 'Logs: npm run stack:logs'
	fi

	step 'Stack up.'
	ok "app          http://localhost:${PORT}"
	# shellcheck disable=SC2046
	report_notes $(notes_probe)
	ok "api          http://localhost:${PORT}/api/health"
	printf '\n  npm run dev          5173, proxying /api to :%s\n' "$PORT"
	printf '  npm run stack:logs   follow both containers\n'
	printf '  npm run stack:down   stop them\n'
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
