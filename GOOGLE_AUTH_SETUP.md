# Google Login — Pokémon Cards

The app-side Google OAuth flow is implemented with Supabase Auth and the existing Expo deep-link scheme.

## App values

- Android package: `com.frontwork.pokemoncards`
- Expo scheme: `pokemoncards`
- Native redirect URL: `pokemoncards://auth/callback`
- Supabase project ref: `mhddpovueqvvncrforao`
- Google OAuth callback for Supabase: `https://mhddpovueqvvncrforao.supabase.co/auth/v1/callback`

## Google Cloud / Google Auth Platform

Use the existing Google/Firebase project for Pokémon Cards when possible.

1. Configure Branding and Audience.
2. Keep scopes limited to `openid`, email and profile.
3. Create an OAuth 2.0 Client ID of type **Web application**.
4. Add this Authorized redirect URI exactly:
   `https://mhddpovueqvvncrforao.supabase.co/auth/v1/callback`
5. Save the Web Client ID and Client Secret.
6. Optional/future native Credential Manager flow: also create an Android OAuth client for package `com.frontwork.pokemoncards` using the SHA-1 of the EAS signing keystore.

Do not commit the Google Client Secret to this repository or place it in an `EXPO_PUBLIC_*` variable.

## Supabase Dashboard

Authentication > Providers > Google:

1. Enable Google.
2. Paste the Web Client ID.
3. Paste the Web Client Secret.

Authentication > URL Configuration > Additional Redirect URLs:

- `pokemoncards://auth/callback`
- `http://localhost:8081/**` for local Expo Web testing only.

For a deployed website, add the production HTTPS site URL as an allowed redirect too.

## Account linking behavior

Supabase automatically links a verified Google identity to an existing Supabase user with the same verified email. That preserves the same `auth.users.id`, so the player's collection, coins, friends and battle history stay attached to the same account.

New Google-only users are created by `private.handle_new_user()` with a unique generated trainer username based on Google profile metadata. They can change profile features later without affecting authentication.

## Mobile flow

1. App calls `signInWithOAuth({ provider: 'google' })`.
2. Browser opens Google consent.
3. Google returns to Supabase Auth.
4. Supabase redirects to `pokemoncards://auth/callback`.
5. Android opens the Pokémon Cards app.
6. The app stores the Supabase access/refresh session securely and enters the game.

No Google Client Secret is stored in the APK.
