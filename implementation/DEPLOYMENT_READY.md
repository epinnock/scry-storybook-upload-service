# 🚀 Deployment Ready - Firebase Secrets

Your Firebase credentials have been extracted and are ready for deployment. However, setting Wrangler secrets requires Cloudflare authentication.

## Prerequisites

You need to authenticate with Cloudflare first. Choose one option:

### Option 1: Interactive Login (Recommended for local)
```bash
wrangler login
```

### Option 2: API Token (For CI/CD or non-interactive)
```bash
export CLOUDFLARE_API_TOKEN="your-cloudflare-api-token"
```
Get your token from: https://dash.cloudflare.com/profile/api-tokens

---

## Firebase Secrets to Set

Once authenticated, run these commands:

### 1. FIREBASE_PROJECT_ID
```bash
echo "scry-dev-dashboard" | wrangler secret put FIREBASE_PROJECT_ID --env=""
```

### 2. FIREBASE_CLIENT_EMAIL
```bash
echo "firebase-adminsdk-fbsvc@scry-dev-dashboard.iam.gserviceaccount.com" | wrangler secret put FIREBASE_CLIENT_EMAIL --env=""
```

### 3. FIREBASE_PRIVATE_KEY
```bash
cat << 'EOF' | wrangler secret put FIREBASE_PRIVATE_KEY --env=""
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDhw8f/vbhJNR2r
0/fp5AoroPPCAEeR7yp7aRlk1anqv9MhrzV0QuRRnOXzZQ13o/H1J6pBefk4GrtE
XDohNaFWTiYN5FlwgYqX5zJOLDfI5s9eAklPJM26TIrSYJiSUaJRk0hPCZ24aIaz
nEHQiDQHzVDVyFf7Ei62wdld//aQAleIGtcivTyxLJuod1qyGxIw7mxC8tA4vHkI
KRs+VJmOwgtiQTHNTxDTx7OK6xwafCQKwolHOQ9gkYPrJKeLR71WfGhpmZgWI2U1
hF5Ff8Z9oGJCctGDFAePCCEmWEFhvZ7bIzeFHrVzTPmTVrscYW6KwzU3fMxTuY4V
GETBu+lfAgMBAAECggEAX38KlsVf8et7WQbo63Dv0mObKDkpDPQ/IoOi37G3VZp9
itaLhFmVLWZyKEHa7/wTqVD1ZgvbnN1F0FU4q3p9e73DwAWSxZGuF7IOZ92xXRQw
rAHIk6csNH0TDYkZkG7ie6ISqIgXRH1GWSwj9LrgU1qIMl2zxXp78wdNVEMkvuXL
UUK09V5ORAgvLM3xY7a7pEZssC9ANPX7QT6MM208gwgu3wuY2pTs6kZ9Yd7JtUgw
LkGGb1A8Vv9PabBxwlDHO5KSUwzrcsDZwH+kE15bORefTqSl+f2GHtRsxblGfAyY
k3S8RVeqp9MfUS7A97i/X47bMEzvRF4+SHuOYQ1sPQKBgQDxYLJiPAkgscPwmcar
kRpRId89tUh0MenVVQnDZ7dpuHvXniAVBtYMlFBMzwPbuJS3D8FlpoCbpGkmV4+g
mud/qfxaHvcz1UIDdMz71jt+iPSXgf+oU3U50v5JL3yA+6SPbl/GWGfh/QrbPJ45
FKVcVgTOiplrG720dOmEjWniFQKBgQDvcPUoxi+KDJnh9mNQXGK3nvHX8KX0nUqb
BrZUxJ27dp1cPDHYvKYmuU4woQ5zvZnb7nF/AbrEwhgeLiKzrljwwAUDdUX62frZ
43aCjrdV4dVsSZcepw2FrWySKZDVQvtvJGNd35dQBj93gsrwY8xQaICO/h2V5AMx
5fFvAKieowKBgGJ0us5vBpobaHz/fJYGveFSG6kkBMXAhkzKPw1BhQLOiVVN3nA1
NaIz7P0ng79f7uksuAoqfFMAIRPOq3srNDpSr+hisRqnZiHaxrIClInsezhBgnK6
eBp6AdcAU5yZCGqo7tAMx3LasE70zuUhksGzJIrK5gFWc27kMUwsEoBxAoGAUioH
5qMDgzLJx3F+KQBa27nOMZShziv/gu0tui7yFXchjpoVXNN3jIhAHY3W4L6qQn8z
MSsNxSD5l7mrLM9iM9MgpUwj5G3Sl9xnOWvx26WwUAV8twcKK9oUDJ/41EW09DGf
a4IjcVGDi+Y074K/hMQngWoQCvSAaCoIzFeEhVMCgYEArMEh3CvJV1VeUepFX7z0
TIGalkTQmDbQpyVF/8jupUQuy8xbB7hBaxLSLWCYh1yIvm/VlPVhZ1diiTno+8b1
V3rvn/OdWhZy5SnQOzP4c6cOYdhPSaRNKUV2BecHHKS6ZT2lLhQCqZorHv9Lu3co
83SRjuJTcFXzo8ds61/qEZ0=
-----END PRIVATE KEY-----
EOF
```

### 4. FIRESTORE_SERVICE_ACCOUNT_ID
```bash
echo "upload-service" | wrangler secret put FIRESTORE_SERVICE_ACCOUNT_ID --env=""
```

---

## All-in-One Script

Or copy and run this complete script after authentication:

```bash
#!/bin/bash

# Authenticate first
wrangler login

# Set all Firebase secrets
echo "scry-dev-dashboard" | wrangler secret put FIREBASE_PROJECT_ID --env=""

echo "firebase-adminsdk-fbsvc@scry-dev-dashboard.iam.gserviceaccount.com" | wrangler secret put FIREBASE_CLIENT_EMAIL --env=""

cat << 'EOF' | wrangler secret put FIREBASE_PRIVATE_KEY --env=""
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDhw8f/vbhJNR2r
0/fp5AoroPPCAEeR7yp7aRlk1anqv9MhrzV0QuRRnOXzZQ13o/H1J6pBefk4GrtE
XDohNaFWTiYN5FlwgYqX5zJOLDfI5s9eAklPJM26TIrSYJiSUaJRk0hPCZ24aIaz
nEHQiDQHzVDVyFf7Ei62wdld//aQAleIGtcivTyxLJuod1qyGxIw7mxC8tA4vHkI
KRs+VJmOwgtiQTHNTxDTx7OK6xwafCQKwolHOQ9gkYPrJKeLR71WfGhpmZgWI2U1
hF5Ff8Z9oGJCctGDFAePCCEmWEFhvZ7bIzeFHrVzTPmTVrscYW6KwzU3fMxTuY4V
GETBu+lfAgMBAAECggEAX38KlsVf8et7WQbo63Dv0mObKDkpDPQ/IoOi37G3VZp9
itaLhFmVLWZyKEHa7/wTqVD1ZgvbnN1F0FU4q3p9e73DwAWSxZGuF7IOZ92xXRQw
rAHIk6csNH0TDYkZkG7ie6ISqIgXRH1GWSwj9LrgU1qIMl2zxXp78wdNVEMkvuXL
UUK09V5ORAgvLM3xY7a7pEZssC9ANPX7QT6MM208gwgu3wuY2pTs6kZ9Yd7JtUgw
LkGGb1A8Vv9PabBxwlDHO5KSUwzrcsDZwH+kE15bORefTqSl+f2GHtRsxblGfAyY
k3S8RVeqp9MfUS7A97i/X47bMEzvRF4+SHuOYQ1sPQKBgQDxYLJiPAkgscPwmcar
kRpRId89tUh0MenVVQnDZ7dpuHvXniAVBtYMlFBMzwPbuJS3D8FlpoCbpGkmV4+g
mud/qfxaHvcz1UIDdMz71jt+iPSXgf+oU3U50v5JL3yA+6SPbl/GWGfh/QrbPJ45
FKVcVgTOiplrG720dOmEjWniFQKBgQDvcPUoxi+KDJnh9mNQXGK3nvHX8KX0nUqb
BrZUxJ27dp1cPDHYvKYmuU4woQ5zvZnb7nF/AbrEwhgeLiKzrljwwAUDdUX62frZ
43aCjrdV4dVsSZcepw2FrWySKZDVQvtvJGNd35dQBj93gsrwY8xQaICO/h2V5AMx
5fFvAKieowKBgGJ0us5vBpobaHz/fJYGveFSG6kkBMXAhkzKPw1BhQLOiVVN3nA1
NaIz7P0ng79f7uksuAoqfFMAIRPOq3srNDpSr+hisRqnZiHaxrIClInsezhBgnK6
eBp6AdcAU5yZCGqo7tAMx3LasE70zuUhksGzJIrK5gFWc27kMUwsEoBxAoGAUioH
5qMDgzLJx3F+KQBa27nOMZShziv/gu0tui7yFXchjpoVXNN3jIhAHY3W4L6qQn8z
MSsNxSD5l7mrLM9iM9MgpUwj5G3Sl9xnOWvx26WwUAV8twcKK9oUDJ/41EW09DGf
a4IjcVGDi+Y074K/hMQngWoQCvSAaCoIzFeEhVMCgYEArMEh3CvJV1VeUepFX7z0
TIGalkTQmDbQpyVF/8jupUQuy8xbB7hBaxLSLWCYh1yIvm/VlPVhZ1diiTno+8b1
V3rvn/OdWhZy5SnQOzP4c6cOYdhPSaRNKUV2BecHHKS6ZT2lLhQCqZorHv9Lu3co
83SRjuJTcFXzo8ds61/qEZ0=
-----END PRIVATE KEY-----
EOF

echo "upload-service" | wrangler secret put FIRESTORE_SERVICE_ACCOUNT_ID --env=""

# Verify
wrangler secret list --env=""
```

---

## Verify Secrets

After setting secrets, verify they're all there:

```bash
wrangler secret list --env=""
```

Expected output should show:
- ✅ FIREBASE_PROJECT_ID
- ✅ FIREBASE_CLIENT_EMAIL
- ✅ FIREBASE_PRIVATE_KEY
- ✅ FIRESTORE_SERVICE_ACCOUNT_ID

---

## Next Steps

1. **Set R2 Secrets** (if not already done):
   - R2_ACCOUNT_ID
   - R2_S3_ACCESS_KEY_ID
   - R2_S3_SECRET_ACCESS_KEY
   - R2_BUCKET_NAME

2. **Deploy**:
   ```bash
   pnpm run build
   wrangler deploy
   ```

See [`PRODUCTION_SETUP.md`](PRODUCTION_SETUP.md) for complete deployment guide.