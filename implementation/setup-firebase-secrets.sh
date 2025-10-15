#!/bin/bash

# Firebase/Firestore Secrets Setup Script (without private key)
# Run this after authenticating with: wrangler login

echo "Setting up Firebase/Firestore secrets for production deployment..."
echo "(Skipping FIREBASE_PRIVATE_KEY - set manually if needed)"
echo ""

# Firebase Project ID
echo "Setting FIREBASE_PROJECT_ID..."
echo "scry-dev-dashboard" | wrangler secret put FIREBASE_PROJECT_ID --env=""

# Firebase Client Email
echo "Setting FIREBASE_CLIENT_EMAIL..."
echo "firebase-adminsdk-fbsvc@scry-dev-dashboard.iam.gserviceaccount.com" | wrangler secret put FIREBASE_CLIENT_EMAIL --env=""

# Firestore Service Account ID
echo "Setting FIRESTORE_SERVICE_ACCOUNT_ID..."
echo "upload-service" | wrangler secret put FIRESTORE_SERVICE_ACCOUNT_ID --env=""

echo ""
echo "✅ Firebase secrets have been set (except FIREBASE_PRIVATE_KEY)!"
echo ""
echo "⚠️  Note: FIREBASE_PRIVATE_KEY was skipped."
echo "To set it manually, run:"
echo "  wrangler secret put FIREBASE_PRIVATE_KEY --env=\"\""
echo "  Then paste the entire private_key value from serviceAccount.json"
echo ""
echo "Verify with: wrangler secret list --env=\"\""