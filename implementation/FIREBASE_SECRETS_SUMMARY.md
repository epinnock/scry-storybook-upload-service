# Firebase Secrets Summary

Extracted from `serviceAccount.json` for Cloudflare Workers deployment.

## Values to Set as Wrangler Secrets

### 1. FIREBASE_PROJECT_ID
```
scry-dev-dashboard
```

**Command:**
```bash
wrangler secret put FIREBASE_PROJECT_ID --env=""
# When prompted, enter: scry-dev-dashboard
```

---

### 2. FIREBASE_CLIENT_EMAIL
```
firebase-adminsdk-fbsvc@scry-dev-dashboard.iam.gserviceaccount.com
```

**Command:**
```bash
wrangler secret put FIREBASE_CLIENT_EMAIL --env=""
# When prompted, enter: firebase-adminsdk-fbsvc@scry-dev-dashboard.iam.gserviceaccount.com
```

---

### 3. FIREBASE_PRIVATE_KEY (Skipped - Set Manually)

⚠️ **Important**: The private key must be set manually due to its length and special characters.

**Command:**
```bash
wrangler secret put FIREBASE_PRIVATE_KEY --env=""
```

When prompted, paste the **ENTIRE** private_key value from `serviceAccount.json`, including:
- The opening quotes
- `-----BEGIN PRIVATE KEY-----\n`
- All the key content with `\n` characters
- `\n-----END PRIVATE KEY-----\n`
- The closing quotes

The value should look like:
```
"-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDhw8f/vbhJNR2r\n...\n-----END PRIVATE KEY-----\n"
```

---

### 4. FIRESTORE_SERVICE_ACCOUNT_ID
```
upload-service
```

**Command:**
```bash
wrangler secret put FIRESTORE_SERVICE_ACCOUNT_ID --env=""
# When prompted, enter: upload-service
```

---

## Quick Setup Script

A setup script has been created: `setup-firebase-secrets.sh`

This script will automatically set 3 out of 4 secrets (skips FIREBASE_PRIVATE_KEY).

**To run:**
```bash
./setup-firebase-secrets.sh
```

Then manually set the private key:
```bash
wrangler secret put FIREBASE_PRIVATE_KEY --env=""
# Paste the entire private_key value from serviceAccount.json
```

---

## Verify All Secrets

After setting all secrets, verify with:
```bash
wrangler secret list --env=""
```

You should see:
- FIREBASE_PROJECT_ID
- FIREBASE_CLIENT_EMAIL  
- FIREBASE_PRIVATE_KEY
- FIRESTORE_SERVICE_ACCOUNT_ID

---

## Next Steps

1. ✅ Run `./setup-firebase-secrets.sh` to set 3 secrets
2. ✅ Manually set FIREBASE_PRIVATE_KEY
3. ✅ Verify with `wrangler secret list --env=""`
4. ✅ Set R2 secrets (see PRODUCTION_SETUP.md)
5. ✅ Deploy with `wrangler deploy`
