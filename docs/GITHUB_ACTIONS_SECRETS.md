# GitHub Actions & Wrangler Secrets Guide

This document outlines all the secrets required for GitHub Actions CI/CD workflows and Cloudflare Wrangler deployments.

## GitHub Repository Secrets

Navigate to your repository → Settings → Secrets and variables → Actions → New repository secret

### Required Secrets for Deployment

| Secret Name | Description | How to Obtain |
|-------------|-------------|---------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers permissions | [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens) → Create Token → "Edit Cloudflare Workers" template |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID | Cloudflare Dashboard → Workers & Pages → Account ID (right sidebar) |

### Required Secrets for E2E Testing

| Secret Name | Description | How to Obtain |
|-------------|-------------|---------------|
| `R2_ACCOUNT_ID` | Cloudflare account ID (same as above) | Same as `CLOUDFLARE_ACCOUNT_ID` |
| `R2_S3_ACCESS_KEY_ID` | R2 S3-compatible API access key ID | Cloudflare Dashboard → R2 → Manage R2 API Tokens → Create API Token |
| `R2_S3_SECRET_ACCESS_KEY` | R2 S3-compatible API secret key | Generated when creating R2 API token |
| `R2_BUCKET_NAME` | Production R2 bucket name | Default: `my-storybooks-production` |

### Optional Secrets for Sentry Integration

| Secret Name | Description | How to Obtain |
|-------------|-------------|---------------|
| `SENTRY_AUTH_TOKEN` | Sentry authentication token | [Sentry Settings](https://sentry.io/settings/account/api/auth-tokens/) → Create New Token |
| `SENTRY_ORG` | Sentry organization slug | Sentry Dashboard → Settings → Organization Settings |
| `SENTRY_PROJECT` | Sentry project slug | Sentry Dashboard → Settings → Projects → Project slug |

## Wrangler Secrets (Production Worker)

These secrets are set directly on the Cloudflare Worker using `wrangler secret put`:

```bash
# R2 Storage Configuration
wrangler secret put R2_ACCOUNT_ID
wrangler secret put R2_S3_ACCESS_KEY_ID
wrangler secret put R2_S3_SECRET_ACCESS_KEY

# Firebase/Firestore Configuration
wrangler secret put FIREBASE_PROJECT_ID
wrangler secret put FIREBASE_CLIENT_EMAIL
wrangler secret put FIREBASE_PRIVATE_KEY

# Sentry Error Tracking (optional)
wrangler secret put SENTRY_DSN
```

### Wrangler Secrets Details

| Secret Name | Description | Source |
|-------------|-------------|--------|
| `R2_ACCOUNT_ID` | Cloudflare account ID | Cloudflare Dashboard |
| `R2_S3_ACCESS_KEY_ID` | R2 S3 API access key | R2 API Token |
| `R2_S3_SECRET_ACCESS_KEY` | R2 S3 API secret | R2 API Token |
| `FIREBASE_PROJECT_ID` | Firebase project ID | Firebase Console → Project Settings |
| `FIREBASE_CLIENT_EMAIL` | Service account email | Firebase service account JSON |
| `FIREBASE_PRIVATE_KEY` | Service account private key | Firebase service account JSON (escape newlines!) |
| `SENTRY_DSN` | Sentry Data Source Name | Sentry Project → Settings → Client Keys |

## Setting Up Secrets

### 1. Create Cloudflare API Token

1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click "Create Token"
3. Use the "Edit Cloudflare Workers" template
4. Configure permissions:
   - Account → Workers Scripts → Edit
   - Account → Workers R2 Storage → Edit
   - Zone → Workers Routes → Edit (if using custom domains)
5. Copy the token and add as `CLOUDFLARE_API_TOKEN` in GitHub

### 2. Create R2 API Token

1. Go to Cloudflare Dashboard → R2
2. Click "Manage R2 API Tokens"
3. Click "Create API Token"
4. Select permissions:
   - Object Read & Write
   - Specify bucket: `my-storybooks-production` and `my-storybooks-staging`
5. Copy the Access Key ID and Secret Access Key

### 3. Firebase Service Account

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to Project Settings → Service Accounts
4. Click "Generate new private key"
5. Extract values from the JSON:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_PRIVATE_KEY`

**Important:** When setting `FIREBASE_PRIVATE_KEY` via wrangler:
```bash
# The private key contains newlines - paste it exactly as-is when prompted
wrangler secret put FIREBASE_PRIVATE_KEY
# Then paste the entire key including -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY-----
```

### 4. Sentry Setup (Optional)

1. Create a project at [Sentry.io](https://sentry.io/)
2. Get your DSN from Project Settings → Client Keys
3. Create an auth token from Account Settings → API → Auth Tokens
   - Required scopes: `project:releases`, `org:read`

## Environment-Specific Configuration

### Preview Environment (PRs)

Preview deployments use the `preview` environment in `wrangler.toml`:
- Uses staging R2 bucket: `my-storybooks-staging`
- Deployed as: `storybook-deployment-service-pr-{PR_NUMBER}`

### Production Environment

Production deployments use the default configuration:
- Uses production R2 bucket: `my-storybooks-production`
- Deployed as: `storybook-deployment-service`

## Verification Commands

After setting up secrets, verify your configuration:

```bash
# List all secrets (names only, not values)
wrangler secret list

# Test deployment locally
wrangler dev

# Deploy to production
wrangler deploy

# Deploy to preview environment
wrangler deploy --env preview
```

## Troubleshooting

### "Authentication error" in GitHub Actions
- Verify `CLOUDFLARE_API_TOKEN` has correct permissions
- Check token hasn't expired
- Ensure `CLOUDFLARE_ACCOUNT_ID` matches your account

### "R2 access denied" errors
- Verify R2 API token has read/write permissions
- Check bucket names match in wrangler.toml and secrets
- Ensure R2 token is scoped to correct buckets

### "Firebase authentication failed"
- Verify `FIREBASE_PRIVATE_KEY` includes full key with headers
- Check `FIREBASE_CLIENT_EMAIL` matches service account
- Ensure service account has Firestore permissions

## Quick Setup Checklist

- [ ] Create Cloudflare API Token with Workers permissions
- [ ] Add `CLOUDFLARE_API_TOKEN` to GitHub Secrets
- [ ] Add `CLOUDFLARE_ACCOUNT_ID` to GitHub Secrets
- [ ] Create R2 API Token
- [ ] Add `R2_S3_ACCESS_KEY_ID` to GitHub Secrets
- [ ] Add `R2_S3_SECRET_ACCESS_KEY` to GitHub Secrets
- [ ] Add `R2_ACCOUNT_ID` to GitHub Secrets
- [ ] Add `R2_BUCKET_NAME` to GitHub Secrets
- [ ] Run `wrangler secret put` for all Worker secrets
- [ ] (Optional) Set up Sentry secrets for error tracking
