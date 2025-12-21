# API Key Authentication - Upload Service Implementation Plan

**Project**: Scry Storybook Upload Service
**Goal**: Secure upload endpoints with API key authentication using Unkey
**Estimated Effort**: 2 hours

---

## 1. Setup & Configuration

### 1.1 Install Dependencies
```bash
npm install @unkey/api
```

### 1.2 Environment Variables
Add to `.env` (and Cloudflare secrets):
```bash
UNKEY_ROOT_KEY=unkey_xxxxxxxxxxxxx
UNKEY_API_ID=api_xxxxxxxxxxxxx
```

---

## 2. Code Implementation

### 2.1 Create Auth Middleware
Create `src/middleware/auth.ts`:
- Initialize Unkey client
- Extract `x-api-key` header
- Verify key using `unkey.keys.verify()`
- Handle errors (missing key, invalid key)
- Inject `authenticatedProjectId` into context

### 2.2 Apply Middleware
Update `src/app.ts`:
- Import `apiKeyAuth` middleware
- Apply to `/upload/*` and `/presigned-url/*` routes
- Add logic to verify that the `project` param matches the `authenticatedProjectId` from the key

---

## 3. Testing

### 3.1 Unit Tests
- Mock Unkey SDK
- Test cases:
  - Missing header -> 401
  - Invalid key -> 401
  - Valid key, wrong project -> 403
  - Valid key, correct project -> 200/Next

### 3.2 Integration Tests
- Test with a real (test) API key against the live Unkey API

---

## 4. Deployment

- Update `wrangler.toml` or secrets with Unkey credentials
- Deploy using `wrangler deploy`