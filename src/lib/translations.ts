import data from '../../data/translations.json' with { type: 'json' };
import type { Translation } from './types.ts';

export const TRANSLATIONS = data as Translation[];
export const DEFAULT_TRANSLATION = 'kjv';
export const translationById = new Map(TRANSLATIONS.map((t) => [t.id, t]));
