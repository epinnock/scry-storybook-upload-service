# Portable Storybook Upload Service

This project provides a backend service for uploading and managing Storybook builds. It's designed to be highly portable and can be deployed as a standard Node.js application or as a serverless Cloudflare Worker.

The service exposes two primary endpoints:
- **Direct Upload**: Allows for uploading a zipped Storybook build directly to the service.
- **Presigned URL Generation**: Provides a secure, short-lived URL that a client can use to upload a Storybook build directly to a cloud storage provider.

This portability is achieved by abstracting the storage logic into a `StorageService` interface, with separate implementations for the Node.js and Cloudflare Worker environments.

## Project Structure

```
.
├── Dockerfile        # For containerizing the Node.js app
├── README.md         # This file
├── package.json      # Project dependencies and scripts
├── src/
│   ├── app.ts        # Shared Hono application logic and routes
│   ├── entry.node.ts # Entry point for the Node.js server
│   ├── entry.worker.ts# Entry point for the Cloudflare Worker
│   └── services/
│       └── storage/  # Storage service abstraction and implementations
├── tsconfig.json     # TypeScript configuration
└── wrangler.toml     # Configuration for the Cloudflare Worker
```

## Architecture: The Portable Storage Service

The core of this project's portability lies in its storage service abstraction.

- **`src/services/storage/storage.service.ts`**: This file defines the `StorageService` interface, which is a contract for all storage operations (e.g., `upload`, `getPresignedUploadUrl`).
- **`src/services/storage/storage.node.ts`**: This file contains `R2S3StorageService`, an implementation of `StorageService` that uses the AWS S3 SDK. It's designed to connect to any S3-compatible object storage, such as Cloudflare R2, AWS S3, or MinIO. This implementation is used in the Node.js environment.
- **`src/services/storage/storage.worker.ts`**: This file also contains a class named `R2S3StorageService`, but it's tailored for the Cloudflare Workers environment. It uses a hybrid approach:
    - For direct uploads to the `/upload` endpoint, it uses the native R2 bucket binding for maximum efficiency.
    - For generating presigned URLs, it uses the S3 SDK, just like the Node.js version.

The application's entry points (`entry.node.ts` and `entry.worker.ts`) are responsible for instantiating the correct storage service implementation and "injecting" it into the Hono application context. This means the shared API logic in `app.ts` can use the storage service without needing to know which environment it's running in.

## Development Guide

This guide will walk you through setting up and running the service in both the Node.js and Cloudflare Worker environments.

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [Yarn](https://yarnpkg.com/) (or npm)
- [Docker](https://www.docker.com/) (optional, for running the Node.js app in a container)
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (for the Worker deployment)
- An S3-compatible object storage bucket (e.g., [Cloudflare R2](https://www.cloudflare.com/products/r2/) or [AWS S3](https://aws.amazon.com/s3/))

### 1. Initial Setup

First, clone the repository and install the dependencies:

```bash
git clone <repository-url>
cd <repository-directory>
yarn install
```

### 2. Environment Configuration

The service requires credentials to connect to your S3-compatible storage. This guide uses Cloudflare R2 as the example provider.

**Step 1: Create an R2 Bucket**

If you don't have one already, create an R2 bucket in the Cloudflare dashboard.
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)

**Step 2: Get Your R2 Credentials**

You will need the following information from your Cloudflare account:
- **Account ID**: You can find this in the main dashboard overview.
- **Bucket Name**: The name you gave your R2 bucket.
- **S3 API Credentials**:
    1. Go to the R2 section in the Cloudflare dashboard.
    2. Click on "Manage R2 API Tokens".
    3. Create a new token with "Admin Read & Write" permissions.
    4. Copy the **Access Key ID** and **Secret Access Key**.

#### For Node.js (Local Development)

The Node.js server uses a `.env` file for environment variables. Create a file named `.env` in the project root and add the values you just obtained:

```
# .env

# The port for the Node.js server
PORT=3000

# Your Cloudflare R2 account ID
R2_ACCOUNT_ID="your-account-id"

# Your R2 bucket name
R2_BUCKET_NAME="your-bucket-name"

# Your R2 S3 API credentials
R2_S3_ACCESS_KEY_ID="your-access-key-id"
R2_S3_SECRET_ACCESS_KEY="your-secret-access-key"
```

#### For Cloudflare Workers

The Cloudflare Worker uses `wrangler.toml` for configuration and secrets for credentials.

1.  **Open `wrangler.toml`**: This file is in the project root.
2.  **Update Bucket Names**: Change the `bucket_name` and `preview_bucket_name` to your actual R2 bucket names.
3.  **Set Secrets**: For security, you must set your credentials as secrets using the Wrangler CLI. **Do not store secrets directly in `wrangler.toml`**.

    Run the following commands in your terminal and enter the corresponding values when prompted:

    ```bash
    wrangler secret put R2_ACCOUNT_ID
    wrangler secret put R2_S3_ACCESS_KEY_ID
    wrangler secret put R2_S3_SECRET_ACCESS_KEY
    wrangler secret put R2_BUCKET_NAME
    ```

### 3. Building the Code

This is a TypeScript project, so you need to compile the code to JavaScript before running it:

```bash
yarn build
```

### 4. Running the Service

You can now run the service in either environment.

#### As a Node.js Server

To run the service as a local Node.js server:

```bash
yarn start:node
```

The server will be available at `http://localhost:3000`.

#### As a Cloudflare Worker (Local Development)

To run the service locally using the Wrangler development server:

```bash
wrangler dev
```

This will start a local server that simulates the Cloudflare environment, including the R2 binding and secrets you configured.

### 5. Deploying the Service

#### To a Docker Container

The `Dockerfile` is configured to build and run the Node.js application.

```bash
# Build the Docker image
docker build -t storybook-upload-service .

# Run the container
docker run -p 3000:3000 -e R2_ACCOUNT_ID=... -e ... storybook-upload-service
```

#### To Cloudflare Workers

To deploy the service to your Cloudflare account:

```bash
wrangler deploy
```

This will upload the worker and configure it according to your `wrangler.toml` file.

## CI/CD Workflows

This project includes comprehensive GitHub Actions workflows for automated testing, building, and deployment.

### Overview

The project uses a **two-workflow approach** to ensure code quality and safe deployments:

1. **🔍 CI Validation** (`.github/workflows/ci.yml`) - Validates pull requests and feature branches
2. **🚀 Production Deploy** (`.github/workflows/deploy.yml`) - Deploys to production after merge

### Workflow Details

#### CI Validation Workflow

**Triggers:**
- Pull requests to `main` branch
- Pushes to feature branches (any branch except `main`)
- Manual workflow dispatch

**Jobs:**
1. **Unit Tests & Build** - Runs `pnpm run test` and `pnpm run build`
2. **E2E Tests (Local)** - Tests against local `wrangler dev` environment
3. **Preview Deployment** - Deploys PR to staging environment
4. **E2E Tests (Preview)** - Tests against live preview deployment
5. **Code Quality** - TypeScript validation and code scanning

**Preview Environments:**
- Each PR gets a unique preview URL: `https://storybook-deployment-service-pr-{number}.scry-demo.workers.dev`
- Preview deployments use the staging R2 bucket (`my-storybooks-staging`)
- The workflow automatically comments on PRs with preview links

#### Production Deploy Workflow

**Triggers:**
- Push to `main` branch (after PR merge)
- Manual workflow dispatch

**Jobs:**
1. **Deploy Worker** - Builds, tests, deploys to production, and validates with E2E tests
2. **Build Docker** - Builds and pushes Docker image to GitHub Container Registry

### GitHub Secrets Setup

The workflows require the following secrets to be configured in your repository settings (**Settings** → **Secrets and variables** → **Actions**):

#### Required Secrets

| Secret Name | Description | Example Value |
|-------------|-------------|---------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Workers:Edit permission | `your-cloudflare-api-token` |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID | `` |
| `R2_S3_ACCESS_KEY_ID` | R2 S3-compatible access key | `` |
| `R2_S3_SECRET_ACCESS_KEY` | R2 S3-compatible secret key | `` |
| `R2_ACCOUNT_ID` | R2 account ID (same as Cloudflare account ID) | `` |
| `R2_BUCKET_NAME` | Production R2 bucket name | `my-storybooks-production` |

#### Setting Up Cloudflare API Token

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Click your profile → **My Profile** → **API Tokens**
3. Click **Create Token** → Use **Edit Cloudflare Workers** template
4. Configure permissions: `Cloudflare Workers:Edit`
5. Set account and zone resources as needed
6. Copy the token and add it as `CLOUDFLARE_API_TOKEN` secret

### Branch Protection Rules

To enforce code quality, set up branch protection rules for the `main` branch:

1. Go to **Settings** → **Branches** in your GitHub repository
2. Click **Add rule** for the `main` branch
3. Enable the following settings:
   - ✅ **Require status checks to pass before merging**
   - ✅ **Require branches to be up to date before merging**
   - ✅ **CI Complete** (select this required check)
   - ✅ **Require pull request reviews before merging**
   - ✅ **Dismiss stale PR approvals when new commits are pushed**

### Development Workflow

With the CI/CD system in place, the recommended development workflow is:

#### 1. Feature Development
```bash
# Create and switch to feature branch
git checkout -b feature/my-new-feature

# Make your changes
# ... edit files ...

# Commit and push
git add .
git commit -m "feat: add new feature"
git push origin feature/my-new-feature
```

#### 2. Pull Request Creation
1. Create a pull request from your feature branch to `main`
2. The CI workflow will automatically:
   - Run unit tests and build checks
   - Run E2E tests against local development environment
   - Deploy a preview environment
   - Run E2E tests against the preview deployment
   - Comment on the PR with the preview URL

#### 3. Code Review & Testing
- Reviewers can test the feature using the preview URL
- All CI checks must pass before the PR can be merged
- The preview environment automatically updates when you push new commits

#### 4. Merge to Production
- Once approved and CI passes, merge the PR to `main`
- The production deploy workflow automatically:
  - Runs final tests and builds the project
  - Deploys to Cloudflare Workers production environment
  - Validates the deployment with E2E tests
  - Builds and pushes a Docker image to GHCR

### Monitoring Workflows

#### Viewing Workflow Status
- Go to the **Actions** tab in your GitHub repository
- Monitor running workflows and view detailed logs
- Failed workflows will block PR merges (when branch protection is enabled)

#### Manual Workflow Triggers
Both workflows support manual triggering via `workflow_dispatch`:
- Go to **Actions** → Select workflow → **Run workflow**
- Useful for testing or re-running deployments

#### Troubleshooting Common Issues

**❌ CI Workflow Fails:**
- Check that all GitHub secrets are correctly configured
- Verify R2 bucket permissions and credentials
- Review the workflow logs for specific error messages

**❌ Preview Deployment Issues:**
- Ensure the staging R2 bucket (`my-storybooks-staging`) exists
- Check Cloudflare API token permissions
- Verify the `wrangler.toml` preview environment configuration

**❌ Production Deployment Fails:**
- Confirm production R2 bucket (`my-storybooks-production`) is accessible
- Check Cloudflare Worker limits and quotas
- Review E2E test failures in the workflow logs

### Environment Configuration

The project uses different environments for safe development:

| Environment | Purpose | R2 Bucket | Worker Name |
|-------------|---------|-----------|-------------|
| **Local Development** | Developer machines | `my-storybooks-staging` | N/A (local) |
| **PR Preview** | Pull request testing | `my-storybooks-staging` | `storybook-deployment-service-pr-{number}` |
| **Production** | Live service | `my-storybooks-production` | `storybook-deployment-service` |

This separation ensures that development and testing activities never interfere with production data.

## API Endpoints

### `POST /upload/:project/:version`

Uploads a zipped Storybook build directly to the service.

-   **URL Params**:
    -   `project` (string): The name of the project.
    -   `version` (string): The version of the Storybook build.
-   **Body**: The raw binary data of the `.zip` file.
-   **Headers**:
    -   `Content-Type`: `application/zip`
-   **Success Response** (`201 Created`):
    ```json
    {
      "message": "Upload successful",
      "data": {
        "url": "...",
        "path": "...",
        "versionId": "..."
      }
    }
    ```

### `POST /presigned-url/:project/:version/:filename`

Generates a presigned URL that can be used for a direct client-side upload.

-   **URL Params**:
    -   `project` (string): The name of the project.
    -   `version` (string): The version of the Storybook build.
    -   `filename` (string): The name of the file to be uploaded (e.g., `storybook.zip`).
-   **Headers**:
    -   `Content-Type` (string): The MIME type of the file to be uploaded (e.g., `application/zip`).
-   **Success Response** (`200 OK`):
    ```json
    {
      "url": "https://...",
      "key": "..."
    }
    ```

The client can then use the returned `url` to `PUT` the file directly to the storage provider.

## Enhanced Setup Guide

### Environment Separation

This project is configured to use different buckets for different environments to ensure safe development:

- **Local Development**: Uses `my-storybooks-staging` bucket for both Node.js and Worker environments
- **Production**: Uses `my-storybooks-production` bucket for deployed Worker

### Credential Configuration

#### Node.js Local Development (.env file)

The `.env` file has been created with staging bucket credentials:

```bash
# .env (automatically configured)
PORT=3000
R2_ACCOUNT_ID=
R2_S3_ACCESS_KEY_ID=
R2_S3_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
```

#### Worker Local Development (.dev.vars file)

The `.dev.vars` file has been configured with staging bucket credentials:

```bash
# .dev.vars (automatically configured)
R2_ACCOUNT_ID=""
R2_S3_ACCESS_KEY_ID=""
R2_S3_SECRET_ACCESS_KEY=""
R2_BUCKET_NAME=""
```

#### Production Deployment

For production, see `PRODUCTION_SETUP.md` for detailed instructions on setting Cloudflare Worker secrets.

## Testing Guide

### Prerequisites for Testing

1. **Build the project**:
   ```bash
   yarn build
   ```

2. **Create a test zip file**:
   ```bash
   echo "test content" > test.txt
   zip test.zip test.txt
   ```

### Testing Node.js Local Server

#### 1. Start the Node.js server:
```bash
yarn start:node
```

#### 2. Test health check:
```bash
curl http://localhost:3000/
```
**Expected Response**: `200 OK` with health information

#### 3. Test direct upload:
```bash
curl -X POST \
  -H "Content-Type: application/zip" \
  --data-binary @test.zip \
  http://localhost:3000/upload/test-project/v1.0.0
```
**Expected Response**: `201 Created`
```json
{
  "message": "Upload successful",
  "data": {
    "url": "https://pub-my-storybooks-staging.{userid}.r2.dev/test-project/v1.0.0/storybook.zip",
    "path": "test-project/v1.0.0/storybook.zip",
    "versionId": "..."
  }
}
```

#### 4. Test presigned URL generation:
```bash
curl -X POST \
  -H "Content-Type: application/zip" \
  http://localhost:3000/presigned-url/test-project/v1.0.0/storybook.zip
```
**Expected Response**: `200 OK`
```json
{
  "url": "https://{userid}.r2.cloudflarestorage.com/my-storybooks-staging/test-project/v1.0.0/storybook.zip?...",
  "key": "test-project/v1.0.0/storybook.zip"
}
```

#### 5. Test file upload using presigned URL:
```bash
# First, get the presigned URL (save the response)
PRESIGNED_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/zip" \
  http://localhost:3000/presigned-url/test-project/v1.0.0/storybook.zip)

# Extract the URL (requires jq)
PRESIGNED_URL=$(echo $PRESIGNED_RESPONSE | jq -r '.url')

# Upload the file using the presigned URL
curl -X PUT \
  -H "Content-Type: application/zip" \
  --data-binary @test.zip \
  "$PRESIGNED_URL"
```
**Expected Response**: `200 OK` (from R2 directly)

### Testing Cloudflare Worker Local Development

#### 1. Start the Worker development server:
```bash
wrangler dev
```

#### 2. Test health check:
```bash
curl http://localhost:8787/
```
**Expected Response**: `200 OK` with health information

#### 3. Test direct upload:
```bash
curl -X POST \
  -H "Content-Type: application/zip" \
  --data-binary @test.zip \
  http://localhost:8787/upload/test-project/v1.0.0
```
**Expected Response**: `201 Created` (same format as Node.js)

#### 4. Test presigned URL generation:
```bash
curl -X POST \
  -H "Content-Type: application/zip" \
  http://localhost:8787/presigned-url/test-project/v1.0.0/storybook.zip
```
**Expected Response**: `200 OK` (same format as Node.js)

#### 5. Test file upload using presigned URL:
```bash
# Get presigned URL and upload (same commands as Node.js, but port 8787)
PRESIGNED_RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/zip" \
  http://localhost:8787/presigned-url/test-project/v1.0.0/storybook.zip)

PRESIGNED_URL=$(echo $PRESIGNED_RESPONSE | jq -r '.url')

curl -X PUT \
  -H "Content-Type: application/zip" \
  --data-binary @test.zip \
  "$PRESIGNED_URL"
```

### Verifying File Access

After successful uploads, verify that files are accessible via R2 public URLs:

```bash
# For staging bucket (local development)
curl https://pub-my-storybooks-staging.{userid}.r2.dev/test-project/v1.0.0/storybook.zip

# For production bucket (after production deployment)
curl https://pub-my-storybooks-production.{userid}.r2.dev/test-project/v1.0.0/storybook.zip
```

### Error Handling

Common error responses:

- **400 Bad Request**: Missing required parameters or invalid Content-Type
- **500 Internal Server Error**: Configuration issues (check credentials)
- **403 Forbidden**: Invalid credentials or bucket permissions

### Performance Comparison

Both upload methods (direct and presigned URL) should work efficiently:

- **Direct Upload**: File goes through your service to R2
- **Presigned URL**: File goes directly from client to R2 (bypasses your service for the actual upload)

Use presigned URLs for large files or when you want to reduce server load.

