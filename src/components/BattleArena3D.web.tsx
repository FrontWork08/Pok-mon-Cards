import type { PixelBattleFighter } from '@/components/PixelBattleArena';

type Fighter3D=PixelBattleFighter&{types?:string[]|null};
type Props={my:Fighter3D|null;rival:Fighter3D|null;resultKey?:string|number|null;winner?:'me'|'rival'|null;title?:string;subtitle?:string;quality?:'low'|'medium'|'high';modelFormKey?:string};

export function BattleArena3D(_props:Props){return null;}
export function disposeBattleArena3D(){}
