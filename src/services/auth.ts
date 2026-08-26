import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';

export const GOOGLE_OAUTH_REDIRECT = 'pokemoncards://auth/callback';

function authErrorMessage(message: string) {
  if (message.includes('Unsupported provider') || message.includes('provider is not enabled')) {
    return 'O login com Google ainda não foi habilitado no Supabase.';
  }
  if (message.includes('Email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (message.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (message.includes('User already registered')) return 'Já existe uma conta com este e-mail.';
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
  const webRedirect = Platform.OS === 'web' && typeof window !== 'undefined' ? `${window.location.origin}/` : undefined;
  const redirectTo = webRedirect ?? GOOGLE_OAUTH_REDIRECT;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
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
