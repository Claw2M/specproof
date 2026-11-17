# SpecProof Team Cloud Self-Hosting & Monetization Playbook

## 1. Required Production Environment Variables

Configure these environment variables before starting `@specproof/cloud`:

```bash
NODE_ENV=production
PORT=4310
SPECPROOF_DB_PATH=/var/lib/specproof/cloud.sqlite
SPECPROOF_CLOUD_TOKEN=<strong-32byte-hex-token>
SPECPROOF_GITHUB_WEBHOOK_SECRET=<github-webhook-hmac-secret>

# Optional: Plan limits & Merchant-of-Record billing webhook (Lemon Squeezy)
SPECPROOF_ENFORCE_PLANS=1
SPECPROOF_LEMONSQUEEZY_WEBHOOK_SECRET=<lemonsqueezy-signing-secret>

# Optional: External Spec Sync
LINEAR_API_KEY=<linear-personal-or-org-key>
JIRA_BASE_URL=https://your-org.atlassian.net
JIRA_EMAIL=ci-bot@your-org.com
JIRA_API_TOKEN=<jira-api-token>
GITHUB_TOKEN=<github-token-with-issues-read>
```

## 2. Reverse Proxy with Automatic TLS (Caddy)

```caddyfile
cloud.your-domain.com {
    reverse_proxy 127.0.0.1:4310
}
```

Do not expose port `4310` publicly without TLS and `SPECPROOF_CLOUD_TOKEN`.

## 3. Merchant-of-Record Billing Integration (Lemon Squeezy)

Point your Lemon Squeezy webhook URL to:

```text
https://cloud.your-domain.com/api/webhooks/lemonsqueezy
```

Supported events:
- `order_created`
- `subscription_created`
- `subscription_updated`
- `subscription_resumed`
- `subscription_cancelled`
- `subscription_expired`

Pass the target plan slug in variant name (`team`, `scale`, `enterprise`) or webhook custom data (`meta.custom_data.plan`). Plan limits apply immediately to subsequent CLI `--cloud` uploads.

## 4. SQLite Backup Strategy

SpecProof Cloud uses SQLite WAL mode. Take consistent online backups via:

```bash
sqlite3 /var/lib/specproof/cloud.sqlite ".backup '/var/backups/specproof-$(date +%F).sqlite'"
```
