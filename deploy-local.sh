#!/usr/bin/env bash
#
# A local deploy: the same phases .github/workflows/deploy.yml runs against the
# VPS, against your own Docker, and then it stays to watch.
#
#   1. verify   lint and build — what CI gates a merge on
#   2. deploy   build both images, start the stack, wait for it to answer
#   3. smoke    /api/health, /api/notes, /notes, and one note end to end
#   4. tail     follow both containers, flag errors, notice state changes
#
# Phases 1–3 are the rehearsal: a commit that would fail CI, or a stack that
# comes up without its bucket, is cheaper to find here. Phase 4 is why this is
# a script and not a checklist — a deploy is not finished when the containers
# start, it is finished when they have been running for a while without
# complaining, and that is the part nobody stays to watch.
#
#   npm run deploy:local
#   npm run deploy:local -- --no-verify      skip phase 1 when only Docker changed
#   npm run deploy:local -- --all            keep the healthcheck probes in the tail
#   npm run deploy:local -- --down-on-exit   tear the stack down when you stop watching
#
# Ctrl-C leaves the stack running by default — it is a deploy, not a session.
set -euo pipefail

# shellcheck source=scripts/lib/stack.sh
. "$(dirname "${BASH_SOURCE[0]}")/scripts/lib/stack.sh"

LOG="$ROOT/.local/deploy.log"
VERIFY=1
SHOW_ALL=0
DOWN_ON_EXIT=0

# What counts as worth colouring red and adding to the tally. Caddy logs JSON,
# so "level":"error" is caught by the bare word; gunicorn's access lines are
# caught by the status code.
ERROR_RE='error|traceback|exception|critical|fatal|" 5[0-9][0-9] '

# The container healthcheck hits /api/health every 30 seconds, which is two
# lines a minute of nothing happening. Hidden unless asked for, because a tail
# nobody can read is a tail nobody reads.
is_noise() {
	case "$1" in
		*'GET /api/health'*Python-urllib*) return 0 ;;
	esac
	return 1
}

for arg in "$@"; do
	case "$arg" in
		--no-verify) VERIFY=0 ;;
		--all) SHOW_ALL=1 ;;
		--down-on-exit) DOWN_ON_EXIT=1 ;;
		# The header block is the help text. Read to the first non-comment line
		# rather than to a line number, which goes stale the moment anything
		# above it is edited.
		-h|--help)
			awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "${BASH_SOURCE[0]}"
			exit 0
			;;
		*) die "Unknown option: $arg" 'Try --help.' ;;
	esac
done

# --- 1. verify ---------------------------------------------------------------

verify() {
	step '1/4  Verify — the checks CI gates a merge on'

	# Each one named before it runs, so a slow build is not a silent pause.
	printf '  lint… '; npm run --silent lint; printf '%s✓%s\n' "$GREEN" "$RESET"
	printf '  build… '; npm run --silent build >/dev/null; printf '%s✓%s\n' "$GREEN" "$RESET"

	[ -f "$ROOT/dist/index.html" ] || die 'The build produced no dist/index.html.'
	ok 'dist/index.html'

	# The backend's own import check is CI's fourth step. It needs the Python
	# dependencies on this machine, which is exactly what the image is for — so
	# it is left to phase 2, where a backend that cannot import never goes
	# healthy and the deploy stops there instead.
}

# --- 2. deploy ---------------------------------------------------------------

deploy() {
	step '2/4  Deploy — build the images and start the stack'
	compose up --build -d

	printf '\n  waiting for :%s to answer… ' "$PORT"
	if ! wait_for_health; then
		printf '%sno%s\n\n' "$RED" "$RESET"
		compose ps >&2 || true
		printf '\n%slast 40 lines%s\n' "$BOLD" "$RESET" >&2
		compose logs --no-color --tail=40 >&2 || true
		die "/api/health never answered on :${PORT}."
	fi
	printf '%s✓%s\n' "$GREEN" "$RESET"

	container_state | sed 's/^/  /'
}

# --- 3. smoke ----------------------------------------------------------------

http_is() {
	local want=$1 url=$2 label=$3 got
	got=$(curl -s -o /dev/null -w '%{http_code}' "$url" || echo 000)
	if [ "$got" = "$want" ]; then
		ok "$label"
		return 0
	fi
	warn "$label — HTTP $got, wanted $want"
	return 1
}

smoke() {
	step '3/4  Smoke — is it actually serving?'
	local failed=0

	http_is 200 "http://localhost:${PORT}/api/health" 'backend  /api/health' || failed=1

	# shellcheck disable=SC2046
	report_notes $(notes_probe)

	http_is 200 "http://localhost:${PORT}/notes" 'app      /notes' || failed=1

	# One note end to end, named by the manifest rather than hardcoded, so this
	# follows whatever is actually published.
	local slug
	slug=$(curl -s "http://localhost:${PORT}/api/notes" |
		grep -o '"slug"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 |
		sed 's/.*"\(.*\)"$/\1/') || true

	if [ -n "${slug:-}" ]; then
		http_is 200 "http://localhost:${PORT}/api/notes/${slug}" "bucket   /api/notes/${slug}" || failed=1
	else
		warn 'no note to fetch — nothing published, or the manifest is unreadable'
	fi

	# A smoke failure is reported and not fatal: the tail is the best place to
	# find out why, and killing the script here would take it away.
	[ "$failed" -eq 0 ] || warn 'something above did not answer as expected — watch the tail'
}

# --- 4. tail and track -------------------------------------------------------

SEEN=0
ERRORS=0
STARTED=0
STATE=''

drain() {
	local total slice n line
	total=$(wc -l <"$LOG" | tr -d ' ')
	[ "$total" -gt "$SEEN" ] || return 0

	# Strip ANSI escapes on the way in: caddy colours its own log and compose
	# emits erase sequences, both of which arrive as literal junk in a line we
	# are about to colour ourselves.
	slice=$(sed -n "$((SEEN + 1)),${total}p" "$LOG" | sed $'s/\033\\[[0-9;]*[A-Za-z]//g')
	SEEN=$total

	n=$(printf '%s\n' "$slice" | grep -Eci "$ERROR_RE" || true)
	ERRORS=$((ERRORS + ${n:-0}))

	while IFS= read -r line; do
		[ -n "$line" ] || continue
		if [ "$SHOW_ALL" -eq 0 ] && is_noise "$line"; then
			continue
		fi
		if printf '%s' "$line" | grep -Eqi "$ERROR_RE"; then
			printf '%s%s%s\n' "$RED" "$line" "$RESET"
		else
			printf '%s\n' "$line"
		fi
	done <<<"$slice"
}

# A container that dies and is restarted by `restart: unless-stopped` leaves
# nothing obvious in a log tail — the lines simply start again. Comparing the
# whole state string catches it, along with a healthcheck going red.
check_state() {
	local now
	now=$(container_state || true)
	[ -n "$now" ] || return 0
	if [ "$now" != "$STATE" ]; then
		printf '\n%s── container state changed ──%s\n' "$YELLOW" "$RESET"
		printf '%s\n' "$now" | sed 's/^/  /'
		printf '\n'
		STATE=$now
	fi
}

summarise() {
	trap - INT TERM
	if [ -n "${LOGS_PID:-}" ]; then
		kill "$LOGS_PID" 2>/dev/null || true
		wait "$LOGS_PID" 2>/dev/null || true
	fi
	drain || true

	step 'Stopped watching.'
	printf '  watched      %ss\n' "$((SECONDS - STARTED))"
	printf '  log lines    %s\n' "$SEEN"
	if [ "$ERRORS" -gt 0 ]; then
		printf '  error lines  %s%s%s\n' "$RED" "$ERRORS" "$RESET"
	else
		printf '  error lines  0\n'
	fi
	printf '  full log     %s\n' "$LOG"

	if [ "$DOWN_ON_EXIT" -eq 1 ]; then
		printf '\n'
		compose down
	else
		printf '\n  The stack is still running on http://localhost:%s\n' "$PORT"
		printf '  npm run stack:down   stop it\n'
	fi
	exit 0
}

tail_and_track() {
	step '4/4  Tail — following both containers'
	printf '%s  errors highlighted and counted; healthcheck probes hidden (--all keeps them)%s\n' "$DIM" "$RESET"
	printf '%s  Ctrl-C stops watching; the stack keeps running%s\n' "$DIM" "$RESET"
	printf '%s  log: %s%s\n\n' "$DIM" "$LOG" "$RESET"

	mkdir -p "$(dirname "$LOG")"
	: >"$LOG"

	# exec, so $! is docker compose itself rather than the subshell wrapping it
	# — otherwise the kill in summarise() leaves the real process behind.
	# --tail, so re-running against a stack that has been up for days opens with
	# enough to see the last restart rather than replaying its whole history.
	# A stack this command just created has fewer lines than that anyway.
	(cd "$APP_DIR" && exec docker compose logs -f --no-color --timestamps --tail=50) >>"$LOG" 2>&1 &
	LOGS_PID=$!

	STARTED=$SECONDS
	STATE=$(container_state || true)
	trap summarise INT TERM

	local ticks=0
	while kill -0 "$LOGS_PID" 2>/dev/null; do
		drain
		ticks=$((ticks + 1))
		# Every fifth pass: often enough to notice a restart, rare enough that
		# it is not an inspect per second for as long as this is left open.
		if [ $((ticks % 5)) -eq 0 ]; then
			check_state
		fi
		sleep 1
	done

	# The follower exiting on its own means the containers went away.
	printf '\n%s── docker compose logs exited ──%s\n' "$YELLOW" "$RESET"
	summarise
}

# --- run ---------------------------------------------------------------------

require_docker
require_env

printf '%sLocal deploy%s  —  project %s, port %s\n' "$BOLD" "$RESET" "$(basename "$APP_DIR")" "$PORT"

# Not `[ … ] && verify || true`, which would swallow a failing lint and deploy
# anyway. A failed check has to stop the deploy, which is the whole point of
# running it first.
if [ "$VERIFY" -eq 1 ]; then
	verify
else
	printf '\n%s1/4  Verify — skipped (--no-verify)%s\n' "$DIM" "$RESET"
fi

deploy
smoke
tail_and_track
