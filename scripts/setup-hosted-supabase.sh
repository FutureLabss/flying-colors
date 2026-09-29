#!/usr/bin/env bash
# Sets up a hosted Supabase project for Flying Colours in one go.
#
#   SUPABASE_ACCESS_TOKEN=sbp_...   # supabase.com → Account → Access tokens
#   PROJECT_REF=abcdefghijklmnop    # from the project URL: https://<ref>.supabase.co
#   SITE_URL=https://your-site.netlify.app
#   DB_PASSWORD=...                 # the database password chosen when creating the project
#   SEED_DEMO=1                     # optional: load the demo data (demo passwords! staging only)
#   ./scripts/setup-hosted-supabase.sh
set -euo pipefail
cd "$(dirname "$0")/.."

: "${SUPABASE_ACCESS_TOKEN:?Set SUPABASE_ACCESS_TOKEN}"
: "${PROJECT_REF:?Set PROJECT_REF}"
: "${SITE_URL:?Set SITE_URL (your Netlify URL)}"
: "${DB_PASSWORD:?Set DB_PASSWORD}"
SB="npx --yes supabase"

echo "→ Linking project $PROJECT_REF"
$SB link --project-ref "$PROJECT_REF" --password "$DB_PASSWORD"

echo "→ Applying migrations${SEED_DEMO:+ and demo seed}"
if [ -n "${SEED_DEMO:-}" ]; then
  $SB db push --include-seed --password "$DB_PASSWORD"
else
  $SB db push --password "$DB_PASSWORD"
fi

echo "→ Pushing auth settings (phone sign-in, WhatsApp OTP hook, site URL)"
# config.toml's site URL is for local dev; point it at the deployed site for this push only.
cp supabase/config.toml supabase/config.toml.bak
trap 'mv supabase/config.toml.bak supabase/config.toml' EXIT
sed -i.tmp "s#^site_url = .*#site_url = \"$SITE_URL\"#; s#^additional_redirect_urls = .*#additional_redirect_urls = [\"$SITE_URL\"]#" supabase/config.toml
rm -f supabase/config.toml.tmp
$SB config push --project-ref "$PROJECT_REF" --yes

echo "→ Deploying edge functions"
$SB functions deploy --project-ref "$PROJECT_REF"

echo "→ Setting function secrets"
$SB secrets set --project-ref "$PROJECT_REF" LEARNER_DEVICE_SECRET="$(openssl rand -hex 32)"

cat <<EOF

Done. In Netlify → Site configuration → Environment variables, set:
  VITE_SUPABASE_URL=https://$PROJECT_REF.supabase.co
  VITE_SUPABASE_ANON_KEY=<Project Settings → API → publishable/anon key>
then trigger a new deploy.
EOF
