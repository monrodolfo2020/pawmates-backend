import { Not, Repository } from 'typeorm';
import { ProviderProfile } from '../domain/entities/provider-profile.entity';
import { slugify } from '../domain/value-objects/service-category';

/**
 * Keeps a business's /s/<slug> address stable once it exists: renaming
 * the business doesn't move the page, because links already shared
 * would break. Only assigns one when there isn't one yet, appending
 * -2, -3… when another business already took the obvious slug.
 */
export async function resolveSlug(
  profiles: Repository<ProviderProfile>,
  profile: ProviderProfile,
): Promise<string | null> {
  if (profile.slug) return profile.slug;
  if (!profile.businessName) return null;
  const base = slugify(profile.businessName) || profile.accountId.slice(0, 8);
  for (let attempt = 0; ; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const clash = await profiles.findOne({
      where: { slug: candidate, accountId: Not(profile.accountId) },
    });
    if (!clash) return candidate;
  }
}
