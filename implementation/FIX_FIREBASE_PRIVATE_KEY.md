# Fix Firebase Private Key Secret

The FIREBASE_PRIVATE_KEY secret is incorrectly formatted, causing base64 decoding errors.

## The Problem

The error `atob() called with invalid base64-encoded data` means the private key has actual newlines instead of literal `\n` characters.

## The Solution

You need to reset the FIREBASE_PRIVATE_KEY secret with the **exact value from serviceAccount.json**, preserving the literal `\n` characters.

### Step 1: Get the Correct Value

From your `serviceAccount.json`, the private_key value should be copied **exactly as shown**, including quotes:

```
"-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDhw8f/vbhJNR2r\n0/fp5AoroPPCAEeR7yp7aRlk1anqv9MhrzV0QuRRnOXzZQ13o/H1J6pBefk4GrtE\nXDohNaFWTiYN5FlwgYqX5zJOLDfI5s9eAklPJM26TIrSYJiSUaJRk0hPCZ24aIaz\nnEHQiDQHzVDVyFf7Ei62wdld//aQAleIGtcivTyxLJuod1qyGxIw7mxC8tA4vHkI\nKRs+VJmOwgtiQTHNTxDTx7OK6xwafCQKwolHOQ9gkYPrJKeLR71WfGhpmZgWI2U1\nhF5Ff8Z9oGJCctGDFAePCCEmWEFhvZ7bIzeFHrVzTPmTVrscYW6KwzU3fMxTuY4V\nGETBu+lfAgMBAAECggEAX38KlsVf8et7WQbo63Dv0mObKDkpDPQ/IoOi37G3VZp9\nitaLhFmVLWZyKEHa7/wTqVD1ZgvbnN1F0FU4q3p9e73DwAWSxZGuF7IOZ92xXRQw\nrAHIk6csNH0TDYkZkG7ie6ISqIgXRH1GWSwj9LrgU1qIMl2zxXp78wdNVEMkvuXL\nUUK09V5ORAgvLM3xY7a7pEZssC9ANPX7QT6MM208gwgu3wuY2pTs6kZ9Yd7JtUgw\nLkGGb1A8Vv9PabBxwlDHO5KSUwzrcsDZwH+kE15bORefTqSl+f2GHtRsxblGfAyY\nk3S8RVeqp9MfUS7A97i/X47bMEzvRF4+SHuOYQ1sPQKBgQDxYLJiPAkgscPwmcar\nkRpRId89tUh0MenVVQnDZ7dpuHvXniAVBtYMlFBMzwPbuJS3D8FlpoCbpGkmV4+g\nmud/qfxaHvcz1UIDdMz71jt+iPSXgf+oU3U50v5JL3yA+6SPbl/GWGfh/QrbPJ45\nFKVcVgTOiplrG720dOmEjWniFQKBgQDvcPUoxi+KDJnh9mNQXGK3nvHX8KX0nUqb\nBrZUxJ27dp1cPDHYvKYmuU4woQ5zvZnb7nF/AbrEwhgeLiKzrljwwAUDdUX62frZ\n43aCjrdV4dVsSZcepw2FrWySKZDVQvtvJGNd35dQBj93gsrwY8xQaICO/h2V5AMx\n5fFvAKieowKBgGJ0us5vBpobaHz/fJYGveFSG6kkBMXAhkzKPw1BhQLOiVVN3nA1\nNaIz7P0ng79f7uksuAoqfFMAIRPOq3srNDpSr+hisRqnZiHaxrIClInsezhBgnK6\neBp6AdcAU5yZCGqo7tAMx3LasE70zuUhksGzJIrK5gFWc27kMUwsEoBxAoGAUioH\n5qMDgzLJx3F+KQBa27nOMZShziv/gu0tui7yFXchjpoVXNN3jIhAHY3W4L6qQn8z\nMSsNxSD5l7mrLM9iM9MgpUwj5G3Sl9xnOWvx26WwUAV8twcKK9oUDJ/41EW09DGf\na4IjcVGDi+Y074K/hMQngWoQCvSAaCoIzFeEhVMCgYEArMEh3CvJV1VeUepFX7z0\nTIGalkTQmDbQpyVF/8jupUQuy8xbB7hBaxLSLWCYh1yIvm/VlPVhZ1diiTno+8b1\nV3rvn/OdWhZy5SnQOzP4c6cOYdhPSaRNKUV2BecHHKS6ZT2lLhQCqZorHv9Lu3co\n83SRjuJTcFXzo8ds61/qEZ0=\n-----END PRIVATE KEY-----\n"
```

### Step 2: Set the Secret Correctly

#### Method 1: Using echo (Recommended)
```bash
wrangler secret put FIREBASE_PRIVATE_KEY --env=""
```

When prompted, paste this EXACT value (copy from serviceAccount.json):
```
"-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDhw8f/vbhJNR2r\n0/fp5AoroPPCAEeR7yp7aRlk1anqv9MhrzV0QuRRnOXzZQ13o/H1J6pBefk4GrtE\nXDohNaFWTiYN5FlwgYqX5zJOLDfI5s9eAklPJM26TIrSYJiSUaJRk0hPCZ24aIaz\nEHQiDQHzVDVyFf7Ei62wdld//aQAleIGtcivTyxLJuod1qyGxIw7mxC8tA4vHkI\nKRs+VJmOwgtiQTHNTxDTx7OK6xwafCQKwolHOQ9gkYPrJKeLR71WfGhpmZgWI2U1\nhF5Ff8Z9oGJCctGDFAePCCEmWEFhvZ7bIzeFHrVzTPmTVrscYW6KwzU3fMxTuY4V\nGETBu+lfAgMBAAECggEAX38KlsVf8et7WQbo63Dv0mObKDkpDPQ/IoOi37G3VZp9\nitaLhFmVLWZyKEHa7/wTqVD1ZgvbnN1F0FU4q3p9e73DwAWSxZGuF7IOZ92xXRQw\nrAHIk6csNH0TDYkZkG7ie6ISqIgXRH1GWSwj9LrgU1qIMl2zxXp78wdNVEMkvuXL\nUUK09V5ORAgvLM3xY7a7pEZssC9ANPX7QT6MM208gwgu3wuY2pTs6kZ9Yd7JtUgw\nLkGGb1A8Vv9PabBxwlDHO5KSUwzrcsDZwH+kE15bORefTqSl+f2GHtRsxblGfAyY\nk3S8RVeqp9MfUS7A97i/X47bMEzvRF4+SHuOYQ1sPQKBgQDxYLJiPAkgscPwmcar\nkRpRId89tUh0MenVVQnDZ7dpuHvXniAVBtYMlFBMzwPbuJS3D8FlpoCbpGkmV4+g\nmud/qfxaHvcz1UIDdMz71jt+iPSXgf+oU3U50v5JL3yA+6SPbl/GWGfh/QrbPJ45\nFKVcVgTOiplrG720dOmEjWniFQKBgQDvcPUoxi+KDJnh9mNQXGK3nvHX8KX0nUqb\nBrZUxJ27dp1cPDHYvKYmuU4woQ5zvZnb7nF/AbrEwhgeLiKzrljwwAUDdUX62frZ\n43aCjrdV4dVsSZcepw2FrWySKZDVQvtvJGNd35dQBj93gsrwY8xQaICO/h2V5AMx\n5fFvAKieowKBgGJ0us5vBpobaHz/fJYGveFSG6kkBMXAhkzKPw1BhQLOiVVN3nA1\nNaIz7P0ng79f7uksuAoqfFMAIRPOq3srNDpSr+hisRqnZiHaxrIClInsezhBgnK6\neBp6AdcAU5yZCGqo7tAMx3LasE70zuUhksGzJIrK5gFWc27kMUwsEoBxAoGAUioH\n5qMDgzLJx3F+KQBa27nOMZShziv/gu0tui7yFXchjpoVXNN3jIhAHY3W4L6qQn8z\nMSsNxSD5l7mrLM9iM9MgpUwj5G3Sl9xnOWvx26WwUAV8twcKK9oUDJ/41EW09DGf\na4IjcVGDi+Y074K/hMQngWoQCvSAaCoIzFeEhVMCgYEArMEh3CvJV1VeUepFX7z0\nTIGalkTQmDbQpyVF/8jupUQuy8xbB7hBaxLSLWCYh1yIvm/VlPVhZ1diiTno+8b1\nV3rvn/OdWhZy5SnQOzP4c6cOYdhPSaRNKUV2BecHHKS6ZT2lLhQCqZorHv9Lu3co\n83SRjuJTcFXzo8ds61/qEZ0=\n-----END PRIVATE KEY-----\n"
```

#### Method 2: From File
Save the value to a temporary file:
```bash
cat > /tmp/firebase_key.txt << 'EOF'
"-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDhw8f/vbhJNR2r\n0/fp5AoroPPCAEeR7yp7aRlk1anqv9MhrzV0QuRRnOXzZQ13o/H1J6pBefk4GrtE\nXDohNaFWTiYN5FlwgYqX5zJOLDfI5s9eAklPJM26TIrSYJiSUaJRk0hPCZ24aIaz\nnEHQiDQHzVDVyFf7Ei62wdld//aQAleIGtcivTyxLJuod1qyGxIw7mxC8tA4vHkI\nKRs+VJmOwgtiQTHNTxDTx7OK6xwafCQKwolHOQ9gkYPrJKeLR71WfGhpmZgWI2U1\nhF5Ff8Z9oGJCctGDFAePCCEmWEFhvZ7bIzeFHrVzTPmTVrscYW6KwzU3fMxTuY4V\nGETBu+lfAgMBAAECggEAX38KlsVf8et7WQbo63Dv0mObKDkpDPQ/IoOi37G3VZp9\nitaLhFmVLWZyKEHa7/wTqVD1ZgvbnN1F0FU4q3p9e73DwAWSxZGuF7IOZ92xXRQw\nrAHIk6csNH0TDYkZkG7ie6ISqIgXRH1GWSwj9LrgU1qIMl2zxXp78wdNVEMkvuXL\nUUK09V5ORAgvLM3xY7a7pEZssC9ANPX7QT6MM208gwgu3wuY2pTs6kZ9Yd7JtUgw\nLkGGb1A8Vv9PabBxwlDHO5KSUwzrcsDZwH+kE15bORefTqSl+f2GHtRsxblGfAyY\nk3S8RVeqp9MfUS7A97i/X47bMEzvRF4+SHuOYQ1sPQKBgQDxYLJiPAkgscPwmcar\nkRpRId89tUh0MenVVQnDZ7dpuHvXniAVBtYMlFBMzwPbuJS3D8FlpoCbpGkmV4+g\nmud/qfxaHvcz1UIDdMz71jt+iPSXgf+oU3U50v5JL3yA+6SPbl/GWGfh/QrbPJ45\nFKVcVgTOiplrG720dOmEjWniFQKBgQDvcPUoxi+KDJnh9mNQXGK3nvHX8KX0nUqb\nBrZUxJ27dp1cPDHYvKYmuU4woQ5zvZnb7nF/AbrEwhgeLiKzrljwwAUDdUX62frZ\n43aCjrdV4dVsSZcepw2FrWySKZDVQvtvJGNd35dQBj93gsrwY8xQaICO/h2V5AMx\n5fFvAKieowKBgGJ0us5vBpobaHz/fJYGveFSG6kkBMXAhkzKPw1BhQLOiVVN3nA1\nNaIz7P0ng79f7uksuAoqfFMAIRPOq3srNDpSr+hisRqnZiHaxrIClInsezhBgnK6\neBp6AdcAU5yZCGqo7tAMx3LasE70zuUhksGzJIrK5gFWc27kMUwsEoBxAoGAUioH\n5qMDgzLJx3F+KQBa27nOMZShziv/gu0tui7yFXchjpoVXNN3jIhAHY3W4L6qQn8z\nMSsNxSD5l7mrLM9iM9MgpUwj5G3Sl9xnOWvx26WwUAV8twcKK9oUDJ/41EW09DGf\na4IjcVGDi+Y074K/hMQngWoQCvSAaCoIzFeEhVMCgYEArMEh3CvJV1VeUepFX7z0\nTIGalkTQmDbQpyVF/8jupUQuy8xbB7hBaxLSLWCYh1yIvm/VlPVhZ1diiTno+8b1\nV3rvn/OdWhZy5SnQOzP4c6cOYdhPSaRNKUV2BecHHKS6ZT2lLhQCqZorHv9Lu3co\n83SRjuJTcFXzo8ds61/qEZ0=\n-----END PRIVATE KEY-----\n"
EOF

cat /tmp/firebase_key.txt | wrangler secret put FIREBASE_PRIVATE_KEY --env=""
rm /tmp/firebase_key.txt
```

### Step 3: Verify and Test

```bash
# Verify secret is set
wrangler secret list --env=""

# Redeploy (not needed, secrets apply immediately)
# But you can redeploy to be safe:
wrangler deploy

# Test upload
curl -X POST \
  -H "Content-Type: application/zip" \
  --data-binary @test.zip \
  https://storybook-deployment-service.epinnock.workers.dev/upload/test-project/v1.0.0
```

### Important Notes:

1. **Keep the quotes**: The value must include the opening and closing quotes from serviceAccount.json
2. **Preserve `\n` literally**: These must be the two-character sequence backslash-n, NOT actual newlines
3. **Copy exactly**: Don't modify or reformat the key - copy it character-for-character from serviceAccount.json

The upload succeeded (200 OK), but Firestore tracking failed. Once you fix the secret, build records will be created properly in Firebase.