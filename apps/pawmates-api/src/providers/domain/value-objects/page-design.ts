import { ValidationError } from '@pawmates/common';

/**
 * What a VIP business can change about its micro-page. The free plan
 * ignores all of this and always renders PawMates' own fixed layout —
 * see ProviderProfile.effectiveDesign.
 *
 * Kept as one JSON blob rather than a column per knob: it's a document
 * the business edits as a whole (and publishes as a whole — see
 * designDraft/designPublished), not a set of fields anything else
 * queries or filters by.
 *
 * The lists must match the same names in the frontend's api/client.ts —
 * checked by the app repo's scripts/check-shared-lists.mjs, which CI runs.
 */
export const PAGE_TEMPLATES = ['classic', 'gallery', 'minimal'] as const;
export type PageTemplate = (typeof PAGE_TEMPLATES)[number];

/** Both are already loaded by the app (see App.tsx) — offering a font
 * that isn't would just render as the system fallback. */
export const PAGE_FONTS = ['display', 'soft'] as const;
export type PageFont = (typeof PAGE_FONTS)[number];

export const PAGE_SECTIONS = [
  'about',
  'services',
  'gallery',
  'hours',
  'testimonials',
  'map',
  'contact',
] as const;
export type PageSection = (typeof PAGE_SECTIONS)[number];

export interface PageDesignSection {
  id: PageSection;
  enabled: boolean;
}

export interface PageTestimonial {
  text: string;
  author: string;
}

export interface PageDesign {
  template: PageTemplate;
  font: PageFont;
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  logo: string | null;
  cover: string | null;
  sections: PageDesignSection[];
  /** Content, strictly speaking — but testimonials only exist on a VIP
   * page and are edited right alongside its layout, so they ride along
   * in the design document instead of earning their own table. */
  testimonials: PageTestimonial[];
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const MAX_TESTIMONIALS = 6;
const MAX_TESTIMONIAL_TEXT = 280;
const MAX_TESTIMONIAL_AUTHOR = 60;

/** PawMates' own look — what a page starts from, and what the free plan
 * always renders. Matches theme/tokens.ts on the frontend. */
export const DEFAULT_PAGE_DESIGN: PageDesign = {
  template: 'classic',
  font: 'display',
  primaryColor: '#FF6B4A',
  backgroundColor: '#FFF7F0',
  textColor: '#1D1533',
  logo: null,
  cover: null,
  sections: PAGE_SECTIONS.map((id) => ({ id, enabled: true })),
  testimonials: [],
};

function assertOneOf<T extends string>(
  allowed: readonly T[],
  value: unknown,
  label: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new ValidationError(`${label} no es válido.`);
  }
  return value as T;
}

function assertColor(value: unknown, label: string): string {
  if (typeof value !== 'string' || !HEX_COLOR.test(value)) {
    throw new ValidationError(`${label} debe ser un color en formato #RRGGBB.`);
  }
  return value;
}

/**
 * Normalizes whatever the client sent into a complete, valid design —
 * every field present, sections deduplicated and covering the full known
 * set (so a design saved before a new section existed still renders it,
 * disabled by default rather than missing).
 */
export function parsePageDesign(input: unknown): PageDesign {
  const raw = (input ?? {}) as Partial<Record<keyof PageDesign, unknown>>;

  const sectionsInput = Array.isArray(raw.sections) ? raw.sections : [];
  const seen = new Map<PageSection, boolean>();
  for (const entry of sectionsInput) {
    const { id, enabled } = (entry ?? {}) as { id?: unknown; enabled?: unknown };
    if (typeof id !== 'string' || !PAGE_SECTIONS.includes(id as PageSection)) continue;
    if (seen.has(id as PageSection)) continue;
    seen.set(id as PageSection, enabled !== false);
  }
  // Anything the client didn't mention keeps its default position, at the
  // end and enabled — a section is never silently dropped.
  for (const id of PAGE_SECTIONS) if (!seen.has(id)) seen.set(id, true);

  const testimonialsInput = Array.isArray(raw.testimonials) ? raw.testimonials : [];
  if (testimonialsInput.length > MAX_TESTIMONIALS) {
    throw new ValidationError(`Puedes mostrar como máximo ${MAX_TESTIMONIALS} testimonios.`);
  }
  const testimonials = testimonialsInput.map((entry) => {
    const { text, author } = (entry ?? {}) as { text?: unknown; author?: unknown };
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw new ValidationError('Cada testimonio necesita un texto.');
    }
    if (text.length > MAX_TESTIMONIAL_TEXT) {
      throw new ValidationError(`Un testimonio no puede pasar de ${MAX_TESTIMONIAL_TEXT} caracteres.`);
    }
    const authorText = typeof author === 'string' ? author.trim() : '';
    if (authorText.length > MAX_TESTIMONIAL_AUTHOR) {
      throw new ValidationError(`El nombre de quien opina no puede pasar de ${MAX_TESTIMONIAL_AUTHOR} caracteres.`);
    }
    return { text: text.trim(), author: authorText };
  });

  return {
    template: raw.template === undefined
      ? DEFAULT_PAGE_DESIGN.template
      : assertOneOf(PAGE_TEMPLATES, raw.template, 'La plantilla'),
    font: raw.font === undefined
      ? DEFAULT_PAGE_DESIGN.font
      : assertOneOf(PAGE_FONTS, raw.font, 'La tipografía'),
    primaryColor: raw.primaryColor === undefined
      ? DEFAULT_PAGE_DESIGN.primaryColor
      : assertColor(raw.primaryColor, 'El color principal'),
    backgroundColor: raw.backgroundColor === undefined
      ? DEFAULT_PAGE_DESIGN.backgroundColor
      : assertColor(raw.backgroundColor, 'El color de fondo'),
    textColor: raw.textColor === undefined
      ? DEFAULT_PAGE_DESIGN.textColor
      : assertColor(raw.textColor, 'El color del texto'),
    logo: typeof raw.logo === 'string' && raw.logo !== '' ? raw.logo : null,
    cover: typeof raw.cover === 'string' && raw.cover !== '' ? raw.cover : null,
    sections: [...seen].map(([id, enabled]) => ({ id, enabled })),
    testimonials,
  };
}
