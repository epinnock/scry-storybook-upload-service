# E2E Testing Framework - Practical Usage Guide

## Overview

This guide shows how you would use the e2e testing framework in practice across different development and deployment scenarios.

## Basic Usage Patterns

### 1. Local Development Testing

**Test while developing locally:**
```bash
# Test against local Node.js server
npm run test:e2e:local-node

# Test against local Cloudflare Worker
npm run test:e2e:local-worker

# Run specific test suite only
npm run test:e2e:upload-workflows --target=local-node
```

**What happens:**
- Framework automatically starts your service (Node.js or Worker)
- Runs test suites against the running service
- Cleans up test artifacts automatically
- Provides detailed feedback on failures

### 2. Docker Validation

**Test your containerized build:**
```bash
# Build and test Docker image
npm run test:e2e:docker

# Or manually
docker build -t storybook-service .
npm run test:e2e --target=docker --image=storybook-service
```

**What happens:**
- Builds Docker container if needed
- Starts container with test configuration
- Runs full test suite against containerized service
- Stops and cleans up container

### 3. Post-Deployment Validation

**Validate after deploying to production:**
```bash
# Test against your deployed Cloudflare Worker
npm run test:e2e:production

# Or with custom endpoint
npm run test:e2e --target=production --url=https://your-worker.your-subdomain.workers.dev
```

**What happens:**
- Runs read-only tests that won't affect production
- Uses dedicated test project/version paths
- Validates core functionality without disrupting real data
- Reports any issues with deployment

## Typical Development Workflows

### Daily Development Cycle

```bash
# Morning: Validate your environment
npm run test:e2e:quick-check

# After making changes: Test locally
npm run test:e2e:local-node

# Before committing: Full local validation
npm run test:e2e:local-full
```

### CI/CD Integration

**In your GitHub Actions or CI pipeline:**
```yaml
# .github/workflows/test.yml
- name: Build and test Docker
  run: |
    npm run build
    npm run test:e2e:docker

- name: Deploy to staging
  run: wrangler deploy --env staging

- name: Validate staging deployment
  run: npm run test:e2e:staging
```

### Release Validation

```bash
# Before releasing to production
npm run test:e2e:pre-release

# After production deployment
npm run test:e2e:production --reporter=detailed
```

## Configuration Examples

### Environment-Specific Testing

**test-config.json:**
```json
{
  "environments": {
    "local-node": {
      "baseUrl": "http://localhost:3000",
      "timeout": 5000,
      "cleanup": true
    },
    "staging": {
      "baseUrl": "https://staging.your-domain.workers.dev",
      "timeout": 10000,
      "testPrefix": "e2e-test",
      "cleanup": true
    },
    "production": {
      "baseUrl": "https://your-worker.workers.dev",
      "timeout": 15000,
      "testPrefix": "e2e-validation",
      "readOnly": true,
      "cleanup": true
    }
  }
}
```

## Test Scenarios You Can Run

### Upload Workflow Tests
- Direct file upload via `/upload/:project/:version`
- Presigned URL generation and usage
- File accessibility after upload
- Large file handling
- Concurrent uploads

### Error Scenario Tests
- Invalid file types
- Missing authentication
- Network timeouts
- Malformed requests
- Storage quota exceeded

### Environment-Specific Tests
- R2 bucket connectivity
- Environment variable validation
- Service health checks
- Performance benchmarks

## Debugging and Troubleshooting

### Verbose Testing
```bash
# Run with detailed logging
npm run test:e2e --verbose --target=local-node

# Run single test with debugging
npm run test:e2e:debug --test="upload workflow" --target=local-worker
```

### Cleanup and Reset
```bash
# Clean up test artifacts manually
npm run test:e2e:cleanup --target=staging

# Reset test environment
npm run test:e2e:reset
```

## Integration with Existing Tools

### With your current package.json scripts:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:e2e": "e2e-test-runner",
    "test:e2e:local": "e2e-test-runner --target=local-node",
    "test:e2e:ci": "e2e-test-runner --target=docker --reporter=ci",
    "dev:test": "concurrently \"npm run dev:worker\" \"npm run test:e2e:watch\""
  }
}
```

### With Docker Compose (optional):
```yaml
# docker-compose.test.yml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=test
  
  tests:
    build:
      context: .
      dockerfile: Dockerfile.test
    depends_on:
      - app
    command: npm run test:e2e:docker-compose
```

## Practical Benefits

### For Local Development
- **Fast feedback**: Know immediately if your changes break anything
- **Environment parity**: Same tests run against all deployment targets
- **Debugging**: Rich error reporting and test artifacts

### For CI/CD
- **Automated validation**: No manual testing needed after deployment
- **Rollback triggers**: Automatically detect failed deployments
- **Confidence**: Deploy knowing your service works end-to-end

### For Team Collaboration
- **Consistent testing**: Everyone uses the same test suite
- **Documentation**: Tests serve as executable documentation
- **Onboarding**: New team members can validate their setup quickly

## Example Output

```
✅ E2E Tests - Local Node.js Environment
   ✅ Upload Workflows (3/3 passed)
      ✅ Direct upload creates accessible file
      ✅ Presigned URL upload works correctly  
      ✅ Large file upload succeeds
   ✅ Error Scenarios (2/2 passed)
      ✅ Invalid file type returns 400
      ✅ Missing project param returns 400
   📊 Performance: Avg upload time 125ms
   🧹 Cleanup: 5 test files removed

🎯 All tests passed! Service is ready for deployment.
```

This framework gives you confidence that your service works correctly across all environments while being easy to use in your daily development workflow.