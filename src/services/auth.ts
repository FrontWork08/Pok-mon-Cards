import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../lib/supabase';

export const GOOGLE_OAUTH_REDIRECT = 'pokemoncards://auth/callback';
const PASSWORD_RECOVERY_PENDING_KEY = 'trainer_collection_password_recovery_pending_v1';
const PASSWORD_RECOVERY_PENDING_TTL_MS = 2 * 60 * 60 * 1000;

type PendingPasswordRecovery = {
  email: string;
  requestedAt: number;
};

async function writePendingPasswordRecovery(email: string) {
  if (Platform.OS === 'web') return;
  await SecureStore.setItemAsync(
    PASSWORD_RECOVERY_PENDING_KEY,
    JSON.stringify({ email: email.trim().toLowerCase(), requestedAt: Date.now() } satisfies PendingPasswordRecovery),
  );
}

export async function getPendingPasswordRecovery() {
  if (Platform.OS === 'web') return null;

  const raw = await SecureStore.getItemAsync(PASSWORD_RECOVERY_PENDING_KEY).catch(() => null);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PendingPasswordRecovery;
    if (
      !parsed?.email
      || !Number.isFinite(parsed.requestedAt)
      || Date.now() - parsed.requestedAt > PASSWORD_RECOVERY_PENDING_TTL_MS
    ) {
      await SecureStore.deleteItemAsync(PASSWORD_RECOVERY_PENDING_KEY).catch(() => null);
      return null;
    }
    return parsed;
  } catch {
    await SecureStore.deleteItemAsync(PASSWORD_RECOVERY_PENDING_KEY).catch(() => null);
    return null;
  }
}

export async function clearPendingPasswordRecovery() {
  if (Platform.OS === 'web') return;
  await SecureStore.deleteItemAsync(PASSWORD_RECOVERY_PENDING_KEY).catch(() => null);
}

export async function isPendingPasswordRecoveryFor(email?: string | null) {
  const pending = await getPendingPasswordRecovery();
  if (!pending || !email) return false;
  return pending.email === email.trim().toLowerCase();
}

function getAuthRedirectUrl() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/`;
  }
  return GOOGLE_OAUTH_REDIRECT;
}

function authErrorMessage(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes('unsupported provider') || normalized.includes('provider is not enabled')) {
    return 'O login com Google ainda não foi habilitado no Supabase.';
  }
  if (normalized.includes('email rate limit exceeded') || normalized.includes('over_email_send_rate_limit')) {
    return 'O limite de e-mails foi atingido. Aguarde um pouco antes de tentar novamente.';
  }
  if (normalized.includes('email address not authorized')) {
    return 'O servidor de e-mail ainda não está liberado para enviar mensagens para este endereço.';
  }
  if (normalized.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (normalized.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (normalized.includes('password should be at least')) return 'A nova senha precisa ter pelo menos 6 caracteres.';
  if (normalized.includes('rate limit')) return 'Muitas tentativas em pouco tempo. Aguarde um pouco antes de tentar novamente.';
  if (normalized.includes('user already registered')) return 'Já existe uma conta com este e-mail.';
  return message;
}

function parseOAuthParams(url: string) {
  const queryIndex = url.indexOf('?');
  const hashIndex = url.indexOf('#');
  const query = queryIndex >= 0 ? url.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined) : '';
  const hash = hashIndex >= 0 ? url.slice(hashIndex + 1) : '';
  const params = new URLSearchParams(hash || query);

  return {
    accessToken: params.get('access_token'),
    refreshToken: params.get('refresh_token'),
    code: params.get('code'),
    error: params.get('error_description') ?? params.get('error'),
  };
}

export function isOAuthCallbackUrl(url?: string | null) {
  if (!url) return false;
  return url.startsWith(GOOGLE_OAUTH_REDIRECT) || url.includes('access_token=') || url.includes('refresh_token=') || url.includes('code=');
}

export async function completeOAuthFromUrl(url: string) {
  if (!isOAuthCallbackUrl(url)) return null;

  const params = parseOAuthParams(url);
  if (params.error) throw new Error(params.error);

  if (params.accessToken && params.refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: params.accessToken,
      refresh_token: params.refreshToken,
    });
    if (error) throw new Error(authErrorMessage(error.message));
    return data.session;
  }

  if (params.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) throw new Error(authErrorMessage(error.message));
    return data.session;
  }

  return null;
}

export async function signUp(email: string, password: string, username: string) {
  const normalizedUsername = username.trim();

  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      emailRedirectTo: getAuthRedirectUrl(),
      data: {
        username: normalizedUsername,
      },
    },
  });

  if (error) throw new Error(authErrorMessage(error.message));
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) throw new Error(authErrorMessage(error.message));
  return data;
}

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: getAuthRedirectUrl(),
      skipBrowserRedirect: Platform.OS !== 'web',
      queryParams: {
        prompt: 'select_account',
      },
    },
  });

  if (error) throw new Error(authErrorMessage(error.message));

  if (Platform.OS !== 'web') {
    if (!data.url) throw new Error('Não foi possível iniciar o login com Google.');
    await Linking.openURL(data.url);
  }

  return data;
}

export function isPasswordRecoveryUrl(url?: string | null) {
  if (!url) return false;
  const queryIndex = url.indexOf('?');
  const hashIndex = url.indexOf('#');
  const query = queryIndex >= 0 ? url.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined) : '';
  const hash = hashIndex >= 0 ? url.slice(hashIndex + 1) : '';
  const params = new URLSearchParams(hash || query);
  return params.get('type') === 'recovery';
}

function getPasswordRecoveryRedirectUrl() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/`;
  }
  // Reuse the callback scheme already embedded in the installed APK and
  // already used by Auth. No new Android intent filter or APK is required.
  return GOOGLE_OAUTH_REDIRECT;
}

export async function requestPasswordReset(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw new Error('Digite o e-mail usado na sua conta.');
  }

  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: getPasswordRecoveryRedirectUrl(),
  });

  if (error) throw new Error(authErrorMessage(error.message));
  await writePendingPasswordRecovery(normalizedEmail);
}

export async function updateRecoveredPassword(password: string) {
  if (password.length < 6) throw new Error('A nova senha precisa ter pelo menos 6 caracteres.');

  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(authErrorMessage(error.message));
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(authErrorMessage(error.message));
}

export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(authErrorMessage(error.message));
  return data.session;
}
