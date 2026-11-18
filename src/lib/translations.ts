import data from '../../data/translations.json' with { type: 'json' };
import type { Translation } from './types.ts';

export const TRANSLATIONS = data as Translation[];
/** Shown to new visitors: the Berean Standard Bible reads in modern English */
export const DEFAULT_TRANSLATION = 'bsb';
export const translationById = new Map(TRANSLATIONS.map((t) => [t.id, t]));
