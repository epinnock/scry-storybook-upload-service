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

