import type { CharacterDefinition } from '../core/types.js';

export const CHARACTER_REGISTRY: Record<string, CharacterDefinition> = {
  'male-athletic': {
    id: 'male-athletic',
    name: 'Athletic Male (Default)',
    asset: '/assets/body-os/characters/male-athletic.vrm',
    gender: 'male',
    physique: 'athletic',
    defaultOutfit: 'training-shorts-charcoal',
  },
  'male-muscular': {
    id: 'male-muscular',
    name: 'Muscular Male',
    asset: '/assets/body-os/characters/male-muscular.vrm',
    gender: 'male',
    physique: 'muscular',
    defaultOutfit: 'training-shorts-charcoal',
  },
  'female-athletic': {
    id: 'female-athletic',
    name: 'Athletic Female',
    asset: '/assets/body-os/characters/female-athletic.vrm',
    gender: 'female',
    physique: 'athletic',
    defaultOutfit: 'sports-bra-shorts-navy',
  },
  'female-muscular': {
    id: 'female-muscular',
    name: 'Muscular Female',
    asset: '/assets/body-os/characters/female-muscular.vrm',
    gender: 'female',
    physique: 'muscular',
    defaultOutfit: 'sports-bra-shorts-navy',
  },
};

export function getCharacterDefinition(id: string): CharacterDefinition {
  return CHARACTER_REGISTRY[id] || CHARACTER_REGISTRY['male-athletic'];
}
