import type { Json } from '@/lib/types/database'

/**
 * Resolves the effective branding by merging event-level and org-level settings.
 * Event fields take precedence over org fields, on a per-field basis.
 * Returns null values for any field that isn't set at either level.
 */
export function resolveEffectiveBranding(
  eventBranding: Json | null,
  orgBranding: Json | null
): { primaryColor: string | null; logoUrl: string | null; headerText: string | null } {
  const evt = (eventBranding ?? {}) as Record<string, string | null>
  const org = (orgBranding ?? {}) as Record<string, string | null>
  return {
    primaryColor: evt.primaryColor ?? org.primaryColor ?? null,
    logoUrl: evt.logoUrl ?? org.logoUrl ?? null,
    headerText: evt.headerText ?? org.headerText ?? null,
  }
}
