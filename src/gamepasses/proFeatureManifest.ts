export const PRO_GAMEPASS_FEATURES = [
  { id: 'bag_pro', route: '/bag-pro', serverValidated: true, features: ['presets', 'folders', 'advanced_sort'] },
  { id: 'marketplace_pro', route: '/marketplace-pro', serverValidated: true, features: ['watches', 'price_history', 'listing_tools'] },
  { id: 'collector_pass', route: '/collector-pass', serverValidated: true, features: ['set_progress', 'type_progress', 'goals', 'recommendations'] },
  { id: 'guild_pro', route: '/guild-pro', serverValidated: true, features: ['org_roles', 'audit', 'identity'] },
  { id: 'battle_style_pass', route: '/battle-style-pass', serverValidated: true, features: ['arena', 'entrance_fx', 'switch_fx'] },
  { id: 'museum_pro', route: '/museum-pro', serverValidated: true, features: ['trajectory', 'collection_highlights', 'activity_history'] },
  { id: 'replay_pro', route: '/replay-pro', serverValidated: true, features: ['extended_history', 'favorites', 'notes', 'comparison'] },
] as const;

export type ProGamepassFeatureId = (typeof PRO_GAMEPASS_FEATURES)[number]['id'];
