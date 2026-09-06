import type { PixelBattleFighter } from '@/components/PixelBattleArena';

type Fighter3D = PixelBattleFighter & { types?: string[] | null };

export type BattleArena3DProps = {
  my: Fighter3D | null;
  rival: Fighter3D | null;
  resultKey?: string | number | null;
  winner?: 'me' | 'rival' | null;
  title?: string;
  subtitle?: string;
  quality?: 'low' | 'medium' | 'high';
};

// Metro resolves BattleArena3D.native.tsx on Android/iOS and BattleArena3D.web.tsx on Web.
// This file gives TypeScript a platform-neutral module contract.
export function BattleArena3D(_props: BattleArena3DProps) {
  return null;
}

export function disposeBattleArena3D() {}
