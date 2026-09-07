# Sketchfab 3D integration

Owner-only integration used by the internal 3D Lab.

## OAuth

Sketchfab app registration must use the Authorization Code flow with this exact redirect URI:

`https://mhddpovueqvvncrforao.supabase.co/functions/v1/sketchfab-oauth`

The Client Secret and OAuth access/refresh tokens are stored in Supabase Vault. They are never committed to GitHub or bundled in the APK.

The Expo app already has the `pokemoncards` URL scheme. After the HTTPS OAuth callback is validated, the backend returns the owner to `pokemoncards://admin-3d-lab?sketchfab=connected`.

The deployed Edge Function source is versioned at `supabase/functions/sketchfab-oauth/index.ts` so the backend contract remains auditable with the app source.

## Security

- Only the Trainer Collection owner can configure or connect Sketchfab.
- OAuth `state` is random, stored only as a SHA-256 hash, expires after 10 minutes and is single-use.
- Access/refresh tokens are encrypted with Supabase Vault.
- The import worker is called through an internal random key stored in Vault.
- Sketchfab server tables are service-role only; RLS is enabled and no client policies are provided intentionally.
- `server_sketchfab_import_job_trigger()` has direct RPC execution revoked from `public`, `anon` and `authenticated`.

## Model import policy

The worker accepts only the three current Lab slots (#6, #25 and #130). It reads Sketchfab metadata first and only proceeds for downloadable models with a reusable license allowed by the Lab policy (CC0, CC BY or CC BY-SA; NC/ND/unknown licenses are rejected).

Downloads use the official Sketchfab Download API. A direct GLB is preferred. A standard glTF ZIP can be converted server-side to GLB. The final file is limited to 25 MB and the current APK rejects Draco, KTX2/BasisU and Meshopt-compressed assets because those decoders are not shipped in runtime 1.2.1.

Successful imports are written only to `pokemon_3d_models.form_key = 'lab'`; production/default battle models are never changed by this workflow.

## Current limitation

A full OAuth/download test requires a real Sketchfab Client ID/Secret issued for the project and a one-time owner authorization. Until that happens, the code path is prepared but a real Sketchfab model import is not considered validated.
