# Sentry Error Tracking Setup

This document describes how to configure Sentry error tracking for the Storybook Upload Service.

## Overview

The service uses `@sentry/cloudflare` for error tracking and performance monitoring in Cloudflare Workers. This provides:

- **Automatic error capturing** - Unhandled exceptions are automatically reported
- **Performance monitoring** - Request tracing and timing metrics
- **Source maps** - Readable stack traces in production
- **Release tracking** - Associate errors with specific deployments

## Quick Setup

### 1. Create a Sentry Project

1. Go to [sentry.io](https://sentry.io) and create an account (or log in)
2. Create a new project:
   - Platform: **JavaScript** → **Cloudflare Workers**
   - Project name: `storybook-upload-service`
3. Copy your **DSN** from the project settings

### 2. Configure Secrets

#### For Local Development

Add to your `.dev.vars` file:

```bash
SENTRY_DSN=https://your-public-key@o0.ingest.sentry.io/0
SENTRY_ENVIRONMENT=development
```

#### For Production (Cloudflare Workers)

```bash
wrangler secret put SENTRY_DSN
# Paste your DSN when prompted

# Optional: Set environment
wrangler secret put SENTRY_ENVIRONMENT
# Enter: production
```

### 3. Configure GitHub Actions (Source Maps)

Add these secrets to your GitHub repository (**Settings → Secrets and variables → Actions**):

| Secret | Description | Where to find |
|--------|-------------|---------------|
| `SENTRY_AUTH_TOKEN` | API token for uploading source maps | [Sentry Auth Tokens](https://sentry.io/settings/auth-tokens/) |
| `SENTRY_ORG` | Your Sentry organization slug | URL: `sentry.io/organizations/{org}/` |
| `SENTRY_PROJECT` | Your Sentry project slug | URL: `sentry.io/organizations/{org}/projects/{project}/` |

#### Creating a Sentry Auth Token

1. Go to [Sentry Auth Tokens](https://sentry.io/settings/auth-tokens/)
2. Click **Create New Token**
3. Select scopes:
   - `project:releases`
   - `org:read`
4. Copy the token and add it as `SENTRY_AUTH_TOKEN` in GitHub

## Configuration Options

The Sentry integration is configured in [`src/entry.worker.ts`](../src/entry.worker.ts):

```typescript
Sentry.withSentry(
  (env: Bindings) => ({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV || 'production',
    release: env.SENTRY_RELEASE,
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // ... more options
  }),
  handler
);
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SENTRY_DSN` | Yes | Data Source Name from Sentry project settings |
| `SENTRY_ENVIRONMENT` | No | Environment name (defaults to `NODE_ENV` or `production`) |
| `SENTRY_RELEASE` | No | Release version (set automatically by GitHub Actions) |

### Sample Rates

- **Development**: 100% of traces captured (`tracesSampleRate: 1.0`)
- **Production**: 10% of traces captured (`tracesSampleRate: 0.1`)

Adjust these values based on your traffic volume and Sentry plan limits.

## Features

### Automatic Error Capturing

All unhandled exceptions are automatically captured and sent to Sentry:

```typescript
// This error will be automatically captured
throw new Error('Something went wrong');
```

### Manual Error Capturing

You can also capture errors manually:

```typescript
import * as Sentry from '@sentry/cloudflare';

try {
  riskyOperation();
} catch (error) {
  Sentry.captureException(error);
  // Handle the error gracefully
}
```

### Adding Context

Add additional context to help debug issues:

```typescript
import * as Sentry from '@sentry/cloudflare';

// Set user context
Sentry.setUser({ id: 'user-123', email: 'user@example.com' });

// Add custom tags
Sentry.setTag('project', 'my-project');
Sentry.setTag('version', 'v1.0.0');

// Add extra data
Sentry.setExtra('uploadSize', file.size);

// Add breadcrumbs for debugging
Sentry.addBreadcrumb({
  category: 'upload',
  message: 'Started file upload',
  level: 'info',
});
```

### Performance Monitoring

The SDK automatically creates transactions for incoming requests. You can add custom spans:

```typescript
import * as Sentry from '@sentry/cloudflare';

const span = Sentry.startSpan({ name: 'processFile' }, () => {
  // Your code here
  return processFile(data);
});
```

## Source Maps

Source maps are automatically uploaded during deployment via GitHub Actions. This provides:

- **Readable stack traces** - See original TypeScript code instead of minified JavaScript
- **Release association** - Errors are linked to specific releases
- **Commit tracking** - See which commits are associated with each release

### Manual Source Map Upload

If needed, you can upload source maps manually:

```bash
# Install Sentry CLI
npm install -g @sentry/cli

# Upload source maps
sentry-cli releases new storybook-upload-service@1.0.0
sentry-cli releases files storybook-upload-service@1.0.0 upload-sourcemaps ./dist
sentry-cli releases finalize storybook-upload-service@1.0.0
```

## Troubleshooting

### Events Not Appearing in Sentry

1. **Check DSN**: Verify `SENTRY_DSN` is correctly set
2. **Check environment**: Events in `test` environment are dropped
3. **Check sample rate**: In production, only 10% of traces are captured
4. **Check network**: Ensure the worker can reach `sentry.io`

### Source Maps Not Working

1. **Check auth token**: Verify `SENTRY_AUTH_TOKEN` has correct permissions
2. **Check release version**: Ensure `SENTRY_RELEASE` matches between build and runtime
3. **Check source map files**: Verify `.map` files exist in `./dist`

### Debug Mode

Enable debug mode to see Sentry's internal logging:

```typescript
Sentry.withSentry(
  (env) => ({
    dsn: env.SENTRY_DSN,
    debug: true, // Enable debug logging
  }),
  handler
);
```

## Best Practices

1. **Don't log sensitive data**: Avoid capturing PII or secrets
2. **Use meaningful release versions**: Include git SHA or semantic version
3. **Set appropriate sample rates**: Balance visibility with cost
4. **Add context**: Include relevant tags and extra data for debugging
5. **Test in development**: Verify Sentry works before deploying to production

## Resources

- [Sentry Cloudflare SDK Documentation](https://docs.sentry.io/platforms/javascript/guides/cloudflare/)
- [Sentry Source Maps Guide](https://docs.sentry.io/platforms/javascript/sourcemaps/)
- [Sentry Performance Monitoring](https://docs.sentry.io/product/performance/)
