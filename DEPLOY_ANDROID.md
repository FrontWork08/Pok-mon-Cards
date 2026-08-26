# Android / EAS deployment

This project is prepared for EAS Build with three environments:

- `development`: internal development APK
- `preview`: internal beta APK for friends/testers
- `production`: Android App Bundle for store distribution

## 1. Link the Expo/EAS project

On Windows, from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\eas-bootstrap.ps1
```

The script will:

1. open Expo browser login when needed;
2. create/link the EAS project;
3. configure `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for development, preview and production;
4. prepare Android signing credentials for the preview APK;
5. print the EAS `projectId`.

`eas project:init` updates `app.json` with `expo.extra.eas.projectId`. Keep and commit that change.

## 2. Android push notifications (FCM V1)

Remote Android push requires Firebase Cloud Messaging.

1. Create/select a Firebase project.
2. Add an Android app with package name `com.frontwork.pokemoncards`.
3. Download `google-services.json` and place it in the repository root.
4. In `app.json`, set `expo.android.googleServicesFile` to `./google-services.json`.
5. In Firebase Project settings > Service accounts, generate a private service account key for FCM V1.
6. Upload that private service account key directly to EAS credentials. Do **not** commit the private key to GitHub.

Run:

```powershell
npx --yes eas-cli@latest credentials --platform android
```

Choose the Android project and configure the Google Service Account key for Push Notifications (FCM V1).

The repository `.gitignore` blocks common service-account/private credential filenames. `google-services.json` itself may be committed because it contains client configuration, not the FCM service-account private key.

## 3. Build the beta APK

After EAS linking and FCM configuration:

```powershell
npx --yes eas-cli@latest build --platform android --profile preview
```

The `preview` profile produces an APK for internal distribution.

## 4. Production later

For Play Store distribution:

```powershell
npx --yes eas-cli@latest build --platform android --profile production
```

The production profile produces an Android App Bundle and auto-increments the build version.

## Security

- Never commit `.env`.
- Never put the Supabase service-role key in the app.
- Never commit Firebase service-account private keys.
- Client-side `EXPO_PUBLIC_*` values are embedded into the app bundle; only use public/publishable values there.
