# Production Deployment Setup Instructions

## Setting Cloudflare Worker Secrets for Production

For production deployment, sensitive credentials must be stored as Cloudflare Worker secrets (not in files). Use the following `wrangler secret put` commands with your credentials from `.r2.secrets`:

### 1. Set R2 Account ID
```bash
wrangler secret put R2_ACCOUNT_ID
# When prompted, enter: f54b9c10de9d140756dbf449aa124f1e
```

### 2. Set R2 S3 Access Key ID
```bash
wrangler secret put R2_S3_ACCESS_KEY_ID
# When prompted, enter: 4125fc825535fb8076b275415726f632
```

### 3. Set R2 S3 Secret Access Key
```bash
wrangler secret put R2_S3_SECRET_ACCESS_KEY
# When prompted, enter: d769feaef9a7406867c5da576b1f7a0483a6cc1af8300b401f74677dde317479
```

### 4. Set R2 Bucket Name (Production)
```bash
wrangler secret put R2_BUCKET_NAME
# When prompted, enter: my-storybooks-production
```

## Verify Secrets are Set
```bash
wrangler secret list
```

## Deploy to Production
```bash
wrangler deploy
```

## Important Notes

- **Security**: Never commit these values to Git. They are stored securely in Cloudflare's infrastructure.
- **Environment Separation**: Local development uses staging bucket (`my-storybooks-staging`), production uses production bucket (`my-storybooks-production`).
- **Bucket Configuration**: The `wrangler.toml` file defines both production and preview bucket bindings automatically.

## Testing Production Deployment

After deployment, your Worker will be available at:
- Production URL: `https://storybook-deployment-service.<your-subdomain>.workers.dev`

Test endpoints:
```bash
# Health check
curl https://storybook-deployment-service.<your-subdomain>.workers.dev/

# Upload test
curl -X POST \
  -H "Content-Type: application/zip" \
  --data-binary @test.zip \
  https://storybook-deployment-service.<your-subdomain>.workers.dev/upload/test-project/v1.0.0

# Presigned URL generation
curl -X POST \
  -H "Content-Type: application/zip" \
  https://storybook-deployment-service.<your-subdomain>.workers.dev/presigned-url/test-project/v1.0.0/storybook.zip