import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';

export const GOOGLE_OAUTH_REDIRECT = 'pokemoncards://auth/callback';

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
    return 'O limite de confirmações por e-mail foi atingido. Use o Google ou tente novamente mais tarde.';
  }
  if (normalized.includes('email address not authorized')) {
    return 'O envio de confirmação ainda não está liberado para este e-mail. Use o Google por enquanto.';
  }
  if (normalized.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (normalized.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
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

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(authErrorMessage(error.message));
}

export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(authErrorMessage(error.message));
  return data.session;
}
