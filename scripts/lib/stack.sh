# Shared ground for the two scripts that drive the local app stack:
#
#   scripts/stack.sh          up / down / logs, for daily work
#   deploy-local.sh           the whole deploy, then tail and track it
#
# Sourced, never run. Everything here is about *this* repo's compose project,
# so it carries the paths rather than taking them as arguments.
#
# The app stack only. docker/edge/ — TLS and hostname routing for the two
# environments sharing the VPS — has no part to play on a laptop, where there
# is one stack and it is reached on a port.

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
APP_DIR="$ROOT/docker/app"
ENV_FILE="$APP_DIR/.env"
PORT="${WEB_PORT:-8080}"

# Colour only when something is watching. A redirected log should be plain.
if [ -t 1 ]; then
	BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'
	GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RESET=$'\033[0m'
else
	BOLD=''; DIM=''; RED=''; GREEN=''; YELLOW=''; RESET=''
fi

die() {
	printf '%s%s%s\n' "$RED" "$1" "$RESET" >&2
	shift
	[ $# -eq 0 ] || printf '%s\n' "$@" >&2
	exit 1
}

say()  { printf '%s\n' "$*"; }
ok()   { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$*"; }
step() { printf '\n%s%s%s\n' "$BOLD" "$*" "$RESET"; }

# --- preflight ---------------------------------------------------------------

require_docker() {
	command -v docker >/dev/null 2>&1 ||
		die 'No docker on PATH.' 'Install Docker Desktop, or Colima.'

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
# published notes out of the private bucket over the S3 API, and writes one
# back when a sheet is published from the editor; see
# ../../docs/notes-via-s3-client.md and ../../docs/notes-upload-from-app.md.
#
# The token wants **Object Read & Write** — the same one in your `r2` AWS
# profile will do. Pointing this at fretbook-notes-dev is the point: Publish
# in a local editor puts a note in whichever bucket is named here.
#
# The two AWS_* lines can be left empty if you would rather export the
# credentials than keep them on disk: compose takes the shell's values first,
# and so does the check that reads this file.
#
# The password is what the Update button on a published note asks for, and the
# only way to write over one. It is optional — left empty, that button answers
# 503 and nothing else changes — and it is not checked for below, since a
# stack nobody updates from is a perfectly good stack.
FRETBOOK_NOTES_BUCKET=fretbook-notes-dev
FRETBOOK_R2_ENDPOINT=https://<account id>.r2.cloudflarestorage.com
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
FRETBOOK_PUBLISH_PASSWORD=
TEMPLATE
}

require_env() {
	if [ ! -f "$ENV_FILE" ]; then
		write_env_template
		die "Wrote $ENV_FILE." \
			'Fill in the R2 endpoint and a read-write token, then run this again.'
	fi

	local missing="" name
	for name in FRETBOOK_NOTES_BUCKET FRETBOOK_R2_ENDPOINT AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; do
		# Either source will do, and compose agrees: it interpolates from the
		# shell first and falls back to the file. So a shell that already
		# carries a credential — an `aws configure export-credentials` eval, a
		# secret manager's wrapper — does not have to copy it onto disk.
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

	if grep -q '<account id>' "$ENV_FILE"; then
		die "$ENV_FILE still has the <account id> placeholder in it."
	fi
}

# --- the stack ---------------------------------------------------------------

compose() {
	# Run from the compose file's own directory so it picks up .env for
	# interpolation, and so the relative build contexts resolve.
	(cd "$APP_DIR" && docker compose "$@")
}

# Poll rather than trust `up -d`: compose returns once the containers are
# started, which is before gunicorn has imported the app or caddy has a route.
wait_for_health() {
	local deadline=$((SECONDS + ${1:-120}))
	while [ "$SECONDS" -lt "$deadline" ]; do
		if curl -fsS -o /dev/null "http://localhost:${PORT}/api/health" 2>/dev/null; then
			return 0
		fi
		sleep 2
	done
	return 1
}

# One line per container: name, status, health, restarts. The comparison the
# tracker makes is on this whole string, so anything that changes shows up.
container_state() {
	local ids
	# --all, so a container that has stopped reads as status=exited rather than
	# dropping out of the listing — vanishing is the one state change worth
	# seeing most, and it is the one a bare `ps -q` hides.
	ids=$(compose ps -q --all 2>/dev/null) || return 1
	[ -n "$ids" ] || return 1
	# shellcheck disable=SC2086
	docker inspect --format \
		'{{.Name}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}} restarts={{.RestartCount}}' \
		$ids 2>/dev/null
}

# The notes are the part most likely to be misconfigured, and the part a green
# healthcheck says nothing about: the bucket is a different thing from the
# process being up. Echoes "<http status> <note count>".
notes_probe() {
	local body status count
	body=$(mktemp)
	status=$(curl -s -o "$body" -w '%{http_code}' "http://localhost:${PORT}/api/notes" || echo 000)
	count=$(grep -o '"slug"' "$body" 2>/dev/null | wc -l | tr -d ' ')
	rm -f "$body"
	printf '%s %s\n' "$status" "$count"
}

# Says what a notes probe means, at whatever indent the caller is using.
report_notes() {
	local status=$1 count=$2
	case "$status" in
		200) ok "/api/notes — ${count} note(s)" ;;
		503) warn "/api/notes says the bucket is not configured — check $ENV_FILE" ;;
		000) warn "/api/notes did not answer" ;;
		*)   warn "/api/notes answered HTTP ${status}" ;;
	esac
}
