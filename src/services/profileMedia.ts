import { supabase } from '@/lib/supabase';

const BUCKET = 'profile-media';
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

function extensionFor(mimeType?: string | null, fileName?: string | null) {
  const mime = (mimeType ?? '').toLowerCase();
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/jpeg') return 'jpg';

  const fromName = fileName?.split('.').pop()?.toLowerCase();
  if (fromName === 'png' || fromName === 'webp' || fromName === 'jpg' || fromName === 'jpeg') {
    return fromName === 'jpeg' ? 'jpg' : fromName;
  }
  return null;
}

export function getProfileMediaPublicUrl(path?: string | null) {
  if (!path) return null;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadMyProfilePhoto(input: {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
}) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const userId = authData.user?.id;
  if (!userId) throw new Error('Usuário não autenticado.');

  const mimeType = input.mimeType?.toLowerCase() ?? 'image/jpeg';
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new Error('Use uma imagem JPG, PNG ou WebP.');
  }

  const extension = extensionFor(mimeType, input.fileName);
  if (!extension) throw new Error('Formato de imagem não suportado.');

  const response = await fetch(input.uri);
  if (!response.ok) throw new Error('Não foi possível ler a imagem escolhida.');
  const buffer = await response.arrayBuffer();

  if (buffer.byteLength > 5 * 1024 * 1024) {
    throw new Error('A foto deve ter no máximo 5 MB.');
  }

  const { data: current, error: currentError } = await supabase
    .from('players')
    .select('avatar_path')
    .eq('id', userId)
    .single();
  if (currentError) throw currentError;

  const nextPath = `${userId}/avatar-${Date.now()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(nextPath, buffer, {
      contentType: mimeType,
      cacheControl: '31536000',
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { error: updateError } = await supabase.rpc('set_my_profile_avatar', {
    p_avatar_path: nextPath,
  });

  if (updateError) {
    await supabase.storage.from(BUCKET).remove([nextPath]).catch(() => null);
    throw updateError;
  }

  const previousPath = typeof current?.avatar_path === 'string' ? current.avatar_path : null;
  if (previousPath && previousPath !== nextPath) {
    await supabase.storage.from(BUCKET).remove([previousPath]).catch(() => null);
  }

  return {
    path: nextPath,
    publicUrl: getProfileMediaPublicUrl(nextPath),
  };
}

export async function removeMyProfilePhoto() {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const userId = authData.user?.id;
  if (!userId) throw new Error('Usuário não autenticado.');

  const { data: current, error: currentError } = await supabase
    .from('players')
    .select('avatar_path')
    .eq('id', userId)
    .single();
  if (currentError) throw currentError;

  const previousPath = typeof current?.avatar_path === 'string' ? current.avatar_path : null;
  const { error: updateError } = await supabase.rpc('set_my_profile_avatar', {
    p_avatar_path: null,
  });
  if (updateError) throw updateError;

  if (previousPath) {
    await supabase.storage.from(BUCKET).remove([previousPath]).catch(() => null);
  }
}
