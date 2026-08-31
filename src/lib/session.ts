import { supabase } from '@/lib/supabase';

/**
 * Returns the current signed-in player id from Supabase's local session.
 *
 * auth.getUser() performs a network verification request. That is useful at
 * trust boundaries, but it is unnecessarily expensive for client-side filters
 * whose requests are already protected by RLS. Using the locally restored
 * session removes dozens of /auth/v1/user round trips while navigating.
 */
export async function getSessionUserId(required = false): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const id = data.session?.user?.id ?? null;
  if (!id && required) throw new Error('Usuário não autenticado.');
  return id;
}
