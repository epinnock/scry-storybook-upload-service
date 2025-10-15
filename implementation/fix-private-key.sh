#!/bin/bash

# Quick fix for FIREBASE_PRIVATE_KEY secret
# This script sets the private key with the correct format

echo "Fixing FIREBASE_PRIVATE_KEY secret..."
echo ""

# Extract the private_key value directly from serviceAccount.json
PRIVATE_KEY=$(jq -r '.private_key' serviceAccount.json)

# Set the secret with the literal \n characters preserved
echo "$PRIVATE_KEY" | wrangler secret put FIREBASE_PRIVATE_KEY --env=""

echo ""
echo "✅ FIREBASE_PRIVATE_KEY has been updated!"
echo ""
echo "The secret is now set with proper literal \\n characters."
echo ""
echo "Test your upload again:"
echo "  curl -X POST -H 'Content-Type: application/zip' --data-binary @test.zip \\"
echo "    https://storybook-deployment-service.epinnock.workers.dev/upload/scry-dev-dashboard/v0.0.0"