#!/usr/bin/env bash
# Deploys Starwright to production on Vercel (project "starwright", team xaxis-projects) and proves
# the live URL serves this commit. Adapted from Phosphoros's tools/deploy.sh.
#
#   tools/deploy.sh               deploy HEAD, then check it
#   tools/deploy.sh --check       only check that the live URL serves HEAD
#   tools/deploy.sh --check SHA   only check that the live URL serves SHA
#
# What goes up is the committed tree at HEAD (git archive), never the working tree, so the build
# marker names exactly what went live and nothing untracked, like .env, is uploaded. Vercel builds
# it: pnpm installs the workspace from the root lockfile and builds web/, the project's root
# directory, reading data/ and core/ from the workspace. The project and its settings are set here,
# so they live in the repo. The custom domain (starwright.space, www redirecting to it) is added only
# once it is registered: until then STARWRIGHT_APEX is unset and the site's own address is the
# project's vercel.app domain, which the build is told (STARWRIGHT_SITE) for canonical links, the
# sitemap and share cards.
#
# A deploy counts only when a production domain proves it:
#   - / answers 200 with the security headers and this commit's build marker;
#   - its share card, icons, stylesheet, manifest, robots and sitemap answer with their types;
#   - every page in the sitemap answers 200, and a missing page is a 404.
# A custom domain whose DNS does not point at Vercel yet is skipped with the records it needs; the
# project's vercel.app domain is always checked.
#
# Needs VERCEL_TOKEN, from the environment or from .env (tools/lib/vercel.sh keeps it off every
# command line and log).
set -euo pipefail

team="xaxis-projects"
project="starwright"
# Set once starwright.space is registered (the owner buys it); then the script attaches it.
apex="${STARWRIGHT_APEX:-}"

check_only=0
want=""
case "${1:-}" in
"") ;;
--check)
  check_only=1
  want="${2:-}"
  ;;
*)
  echo "usage: tools/deploy.sh [--check [SHA]]" >&2
  exit 2
  ;;
esac

root="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
sha="$(git -C "$root" rev-parse --short=7 "${want:-HEAD}^{commit}")" || {
  echo "deploy: $want is not a commit here" >&2
  exit 2
}

fail() {
  echo "deploy FAILED: $*" >&2
  exit 1
}

# shellcheck source=tools/lib/vercel.sh
. "$root/tools/lib/vercel.sh"
work="$(mktemp -d "${TMPDIR:-/tmp}/starwright-site.XXXXXX")"
trap 'rm -rf "$work"' EXIT
ph_vercel_auth "$root" "$work" || fail "no token"
api() { ph_api "$@"; }
body() { ph_body "$@"; }
status() { ph_status "$@"; }

# --- the project and its domains ----------------------------------------------------------------
settings='{"framework":"nextjs","rootDirectory":"web","sourceFilesOutsideRootDirectory":true,"nodeVersion":"24.x","buildCommand":null,"installCommand":null,"outputDirectory":null}'
res="$(api GET "/v9/projects/$project?slug=$team")"
if [[ "$(status "$res")" == 404 && $check_only == 0 ]]; then
  res="$(api POST "/v11/projects?slug=$team" "{\"name\":\"$project\",\"framework\":\"nextjs\"}")"
  [[ "$(status "$res")" == 200 ]] || fail "could not create project $project: $(body "$res" | head -c 400)"
  echo "created project $project"
  res="$(api GET "/v9/projects/$project?slug=$team")"
fi
[[ "$(status "$res")" == 200 ]] || fail "project $project: $(status "$res") $(body "$res" | head -c 300)"
project_id="$(body "$res" | jq -er .id)"
org_id="$(body "$res" | jq -er .accountId)"

if [[ $check_only == 0 ]]; then
  res="$(api PATCH "/v9/projects/$project_id?slug=$team" "$settings")"
  [[ "$(status "$res")" == 200 ]] || fail "could not apply project settings: $(body "$res" | head -c 400)"
  have="$(body "$(api GET "/v9/projects/$project_id/domains?slug=$team")" | jq -r '.domains[].name')"
  add_domain() { # add_domain JSON NAME
    grep -qxF "$2" <<<"$have" && return 0
    local r
    r="$(api POST "/v10/projects/$project_id/domains?slug=$team" "$1")"
    [[ "$(status "$r")" == 200 ]] || fail "could not add $2: $(body "$r" | head -c 400)"
    echo "added domain $2"
  }
  if [[ -n "$apex" ]]; then
    add_domain "{\"name\":\"$apex\"}" "$apex"
    add_domain "{\"name\":\"www.$apex\",\"redirect\":\"$apex\",\"redirectStatusCode\":308}" "www.$apex"
  fi
fi

# The site's own address: the custom domain once its DNS points here, else the vercel.app one.
listing="$(ph_production_domains "$project_id" "$team")" || fail "no domain listing"
site_domain=""
if [[ -n "$apex" && "$(body "$(api GET "/v6/domains/$apex/config?slug=$team")" | jq -r .misconfigured)" == "false" ]]; then
  site_domain="$apex"
else
  site_domain="$(grep -m1 -E '^[a-z0-9-]+\.vercel\.app$' <<<"$listing" || true)"
fi
[[ -n "$site_domain" ]] || site_domain="$project.vercel.app"
site="https://$site_domain"

# --- deploy -----------------------------------------------------------------------------------
if [[ $check_only == 0 ]]; then
  if [[ -n "$(git -C "$root" status --porcelain -- web core data package.json pnpm-lock.yaml pnpm-workspace.yaml)" ]]; then
    echo "note: uncommitted changes are not deployed; HEAD ($sha) is"
  fi
  mkdir "$work/src"
  git -C "$root" archive --format=tar HEAD | tar -x -C "$work/src"
  mkdir "$work/src/.vercel"
  printf '{"projectId":"%s","orgId":"%s"}\n' "$project_id" "$org_id" >"$work/src/.vercel/project.json"

  ph_vercel_cli
  echo "deploying $sha to $project (production) ..."
  if ! "${ph_vercel[@]}" deploy --prod --yes --global-config "$work/vercel" --cwd "$work/src" \
    --build-env "STARWRIGHT_BUILD=$sha" --build-env "STARWRIGHT_SITE=$site" --meta "commit=$sha" >"$work/deploy.log" 2>&1; then
    tail -n 40 "$work/deploy.log" >&2
    fail "vercel deploy"
  fi
  deployment="$(grep -oE 'https://[a-zA-Z0-9.-]+\.vercel\.app' "$work/deploy.log" | sed -n 1p || true)"
  echo "deployed: ${deployment:-unknown}"
fi

# --- prove it ---------------------------------------------------------------------------------
listing="$(ph_production_domains "$project_id" "$team")" || fail "no domain listing"
mapfile -t domains <<<"$listing"
[[ -n "$apex" ]] || mapfile -t domains < <(grep -E '\.vercel\.app$' <<<"$listing")
[[ -n "${domains[0]:-}" ]] || fail "the project has no production domain"

dns_todo=()
live=()
for domain in "${domains[@]}"; do
  if [[ "$domain" == *.vercel.app ]]; then
    live+=("$domain")
    continue
  fi
  cfg="$(body "$(api GET "/v6/domains/$domain/config?slug=$team")")"
  if [[ "$(jq -r '.misconfigured' <<<"$cfg")" == "false" ]]; then
    live+=("$domain")
  else
    dns_todo+=("$domain")
  fi
done
[[ -n "${live[0]:-}" ]] || fail "no production domain is reachable yet"
checks=0

expect_asset() { # expect_asset URL CONTENT-TYPE-PREFIX
  local h
  h="$(curl -sS --max-time 20 -D - -o /dev/null "$1")"
  grep -qE '^HTTP/[0-9.]+ 200' <<<"$h" || fail "$1: $(head -n 1 <<<"$h")"
  grep -qi "^content-type: $2" <<<"$h" || fail "$1: content-type is not $2"
  grep -qi '^x-content-type-options: nosniff' <<<"$h" || fail "$1: no X-Content-Type-Options"
  echo "  ok  $1 (200, $2)"
  checks=$((checks + 1))
}

for domain in "${live[@]}"; do
  url="https://$domain"
  echo "checking $url"
  marker="<meta name=\"starwright-build\" content=\"$sha\"/>"
  for _ in $(seq 1 24); do
    curl -sS --max-time 20 -D "$work/page.headers" -o "$work/page.html" "$url/" || true
    grep -qF "$marker" "$work/page.html" 2>/dev/null && break
    sleep 5
  done
  grep -qE '^HTTP/[0-9.]+ 200' "$work/page.headers" || fail "$url/: $(head -n 1 "$work/page.headers")"
  grep -qF "$marker" "$work/page.html" ||
    fail "$url/ does not serve $sha (it has: $(grep -oE 'starwright-build" content="[^"]*"' "$work/page.html" || echo 'no marker'))"
  grep -qi '^x-content-type-options: nosniff' "$work/page.headers" || fail "$url/: no X-Content-Type-Options"
  grep -qi '^referrer-policy: strict-origin-when-cross-origin' "$work/page.headers" || fail "$url/: wrong Referrer-Policy"
  grep -qi '^x-frame-options: DENY' "$work/page.headers" || fail "$url/: no X-Frame-Options DENY"
  grep -qi '^content-security-policy: ' "$work/page.headers" || fail "$url/: no Content-Security-Policy"
  echo "  ok  $url/ (200, build $sha, nosniff, referrer-policy, frame DENY, CSP)"
  checks=$((checks + 1))

  og="$(grep -oE '<meta property="og:image" content="[^"]+"' "$work/page.html" | sed -nE '1s/.*content="([^"]+)"/\1/p' | sed 's/&amp;/\&/g' || true)"
  [[ "$og" == "$site/"* ]] || fail "og:image is not on $site: ${og:-missing}"
  expect_asset "$url${og#"$site"}" "image/png"
  css="$(grep -oE 'href="/_next/static/[^"]+\.css"' "$work/page.html" | sed -nE '1s/href="([^"]+)"/\1/p' || true)"
  [[ -n "$css" ]] || fail "no stylesheet linked from $url/"
  expect_asset "$url$css" "text/css"
  expect_asset "$url/icon.svg" "image/svg+xml"
  expect_asset "$url/favicon.ico" "image/"
  touch_icon="$(grep -oE '<link rel="apple-touch-icon" href="[^"]+"' "$work/page.html" | sed -nE '1s/.*href="([^"]+)"/\1/p' | sed 's/&amp;/\&/g' || true)"
  [[ -n "$touch_icon" ]] || fail "$url/ names no apple-touch-icon"
  expect_asset "$url$touch_icon" "image/png"
  expect_asset "$url/manifest.webmanifest" "application/manifest+json"
  expect_asset "$url/robots.txt" "text/plain"
  expect_asset "$url/sitemap.xml" "application/xml"

  # Every page the sitemap lists answers 200 on this domain.
  curl -sS --max-time 20 "$url/sitemap.xml" | grep -oE "<loc>[^<]+</loc>" | sed -E "s#<loc>$site([^<]*)</loc>#\1#" >"$work/paths"
  grep -q '^/' "$work/paths" || fail "the sitemap does not list pages on $site"
  pages=0
  while read -r path; do
    code="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' "$url${path:-/}")"
    [[ "$code" == 200 ]] || fail "$url${path:-/} returned $code"
    pages=$((pages + 1))
  done <"$work/paths"
  echo "  ok  all $pages pages in the sitemap answer 200"
  checks=$((checks + 1))

  code="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' "$url/no-such-page")"
  [[ "$code" == 404 ]] || fail "$url/no-such-page returned $code, not 404"
  echo "  ok  $url/no-such-page (404)"
  checks=$((checks + 1))
done

dns_ok() { [[ "$(body "$(api GET "/v6/domains/$1/config?slug=$team")" | jq -r .misconfigured)" == "false" ]]; }
if [[ -z "$apex" ]]; then
  :
elif dns_ok "www.$apex"; then
  code="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code} %{redirect_url}' "https://www.$apex/" || true)"
  [[ "$code" == "308 https://$apex/" ]] || fail "https://www.$apex/ answers '$code', not a 308 to https://$apex/"
  echo "  ok  https://www.$apex/ (308 to https://$apex/)"
  checks=$((checks + 1))
else
  dns_todo+=("www.$apex")
fi

echo "site ok: $sha is live at ${live[*]/#/https://} ($checks checks passed)"
for domain in "${dns_todo[@]}"; do
  cfg="$(body "$(api GET "/v6/domains/$domain/config?slug=$team")")"
  if [[ "$domain" == "$apex" ]]; then
    echo "waiting for DNS: $domain needs an A record for the bare domain (host @):"
    jq -r '.recommendedIPv4 // [] | map(select(.rank == 1)) | .[].value[] | "    A      @    \(.)"' <<<"$cfg"
  else
    echo "waiting for DNS: $domain needs a CNAME record (host www):"
    jq -r '.recommendedCNAME // [] | map(select(.rank == 1)) | .[].value | "    CNAME  www  \(.)"' <<<"$cfg"
  fi
done
