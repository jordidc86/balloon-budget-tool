import { CompatibilityRules } from './types';
import compatibilityRules from '../../public/compatibility-rules.json';

const rules = compatibilityRules as CompatibilityRules;

/**
 * Get compatible baskets for a given envelope
 */
export function getCompatibleBaskets(vendorId: string, envelopeName: string): string[] {
    const vendorRules = rules[vendorId.toLowerCase()];
    if (!vendorRules) return [];

    const envelopeRules = vendorRules[envelopeName];
    if (!envelopeRules) return [];

    return envelopeRules.baskets || [];
}

/**
 * Get compatible burners for a given envelope
 */
export function getCompatibleBurners(vendorId: string, envelopeName: string): string[] {
    const vendorRules = rules[vendorId.toLowerCase()];
    if (!vendorRules) return [];

    const envelopeRules = vendorRules[envelopeName];
    if (!envelopeRules) return [];

    return envelopeRules.burners || [];
}
