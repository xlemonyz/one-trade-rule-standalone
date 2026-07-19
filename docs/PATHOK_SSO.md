# Pathok account handoff

Pathok can reuse an authenticated One Trade Rule account without asking for the password again.

## Components

- Web consent route: `/pathok-connect`
- Edge Function: `pathok-auth`
- Database table: `pathok_auth_handoffs`
- Android callback: `pathok://auth/callback`

The Android app creates a PKCE verifier and opens the consent route with its challenge. The authenticated Web app creates an encrypted, 90-second, one-time handoff code. The Android app exchanges that code with the original verifier and stores the returned session tokens encrypted by Android Keystore.

## Deployment

Set a random secret with at least 32 characters, apply migrations, and deploy the function:

```text
supabase secrets set PATHOK_HANDOFF_SECRET=<random-secret>
supabase db push
supabase functions deploy pathok-auth --no-verify-jwt
```

Deploy the Web app so the production `/pathok-connect` route is available. The Android build uses `https://one-trade-rule-standalone.vercel.app` by default. Override it with the `ONE_TRADE_RULE_WEB_URL` environment variable when building against another deployment.
