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

/**
 * Blocks a business adds itself, as many as it likes (up to
 * MAX_CUSTOM_BLOCKS), each carrying its own content — the "add a block"
 * half of the editor. The PAGE_SECTIONS above are the other half: one of
 * each, always present, showing what the business already filled in on
 * its profile (bio, services, photos…), so they can only be moved or
 * hidden.
 */
export const PAGE_BLOCK_TYPES = [
  'hero',
  'text',
  'prices',
  'faq',
  'promo',
  'social',
  'video',
  'team',
] as const;
export type PageBlockType = (typeof PAGE_BLOCK_TYPES)[number];

export interface PageBlockData {
  title?: string;
  subtitle?: string;
  body?: string;
  /** promo: the last day it shows (YYYY-MM-DD); after that it hides itself. */
  until?: string | null;
  /** video: a link to YouTube, TikTok, Instagram or Facebook. */
  url?: string;
  /** social */
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  website?: string;
  /** prices: name/detail/price · faq: name=question, detail=answer · team: name/detail=role */
  items?: { name: string; detail: string; price?: string }[];
}

/**
 * One entry in the page's order. A built-in section's id is its own name
 * ('about', 'gallery'…) and it has no data; an added block has its own
 * id (made by the app), a type and its content.
 */
export interface PageDesignSection {
  id: string;
  type: PageSection | PageBlockType;
  enabled: boolean;
  data?: PageBlockData;
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
const BLOCK_ID = /^[a-z0-9_-]{1,40}$/i;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CUSTOM_BLOCKS = 20;
const MAX_BLOCK_ITEMS = 20;
const MAX_TESTIMONIALS = 6;
const MAX_TESTIMONIAL_TEXT = 280;
const MAX_TESTIMONIAL_AUTHOR = 60;

/** PawMates' own look — what a page starts from, and what the free plan
 * always renders. Matches theme/tokens.ts on the frontend. */
export const DEFAULT_PAGE_DESIGN: PageDesign = {
  template: 'classic',
  font: 'display',
  primaryColor: '#C8492A',
  backgroundColor: '#FBF6F1',
  textColor: '#261E2C',
  logo: null,
  cover: null,
  sections: PAGE_SECTIONS.map((id) => ({ id, type: id, enabled: true })),
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
  const sections: PageDesignSection[] = [];
  const seenIds = new Set<string>();
  let customCount = 0;
  for (const entry of sectionsInput) {
    const { id, type, enabled, data } = (entry ?? {}) as {
      id?: unknown;
      type?: unknown;
      enabled?: unknown;
      data?: unknown;
    };
    if (typeof id !== 'string' || seenIds.has(id)) continue;
    // Designs saved before blocks existed only have `id`, which was the
    // section's name.
    const kind = typeof type === 'string' ? type : id;
    if (PAGE_SECTIONS.includes(kind as PageSection)) {
      if (id !== kind) continue;
      seenIds.add(id);
      sections.push({
        id,
        type: kind as PageSection,
        enabled: enabled !== false,
      });
      continue;
    }
    if (!PAGE_BLOCK_TYPES.includes(kind as PageBlockType)) continue;
    if (!BLOCK_ID.test(id))
      throw new ValidationError('Un bloque tiene un identificador no válido.');
    customCount += 1;
    if (customCount > MAX_CUSTOM_BLOCKS) {
      throw new ValidationError(
        `Tu página puede tener como máximo ${MAX_CUSTOM_BLOCKS} bloques agregados.`,
      );
    }
    seenIds.add(id);
    sections.push({
      id,
      type: kind as PageBlockType,
      enabled: enabled !== false,
      data: parseBlockData(kind as PageBlockType, data),
    });
  }
  // A built-in section the client didn't mention keeps a place at the
  // end, enabled — never silently dropped.
  for (const id of PAGE_SECTIONS) {
    if (!seenIds.has(id)) sections.push({ id, type: id, enabled: true });
  }

  const testimonialsInput = Array.isArray(raw.testimonials)
    ? raw.testimonials
    : [];
  if (testimonialsInput.length > MAX_TESTIMONIALS) {
    throw new ValidationError(
      `Puedes mostrar como máximo ${MAX_TESTIMONIALS} testimonios.`,
    );
  }
  const testimonials = testimonialsInput.map((entry) => {
    const { text, author } = (entry ?? {}) as {
      text?: unknown;
      author?: unknown;
    };
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw new ValidationError('Cada testimonio necesita un texto.');
    }
    if (text.length > MAX_TESTIMONIAL_TEXT) {
      throw new ValidationError(
        `Un testimonio no puede pasar de ${MAX_TESTIMONIAL_TEXT} caracteres.`,
      );
    }
    const authorText = typeof author === 'string' ? author.trim() : '';
    if (authorText.length > MAX_TESTIMONIAL_AUTHOR) {
      throw new ValidationError(
        `El nombre de quien opina no puede pasar de ${MAX_TESTIMONIAL_AUTHOR} caracteres.`,
      );
    }
    return { text: text.trim(), author: authorText };
  });

  return {
    template:
      raw.template === undefined
        ? DEFAULT_PAGE_DESIGN.template
        : assertOneOf(PAGE_TEMPLATES, raw.template, 'La plantilla'),
    font:
      raw.font === undefined
        ? DEFAULT_PAGE_DESIGN.font
        : assertOneOf(PAGE_FONTS, raw.font, 'La tipografía'),
    primaryColor:
      raw.primaryColor === undefined
        ? DEFAULT_PAGE_DESIGN.primaryColor
        : assertColor(raw.primaryColor, 'El color principal'),
    backgroundColor:
      raw.backgroundColor === undefined
        ? DEFAULT_PAGE_DESIGN.backgroundColor
        : assertColor(raw.backgroundColor, 'El color de fondo'),
    textColor:
      raw.textColor === undefined
        ? DEFAULT_PAGE_DESIGN.textColor
        : assertColor(raw.textColor, 'El color del texto'),
    logo: typeof raw.logo === 'string' && raw.logo !== '' ? raw.logo : null,
    cover: typeof raw.cover === 'string' && raw.cover !== '' ? raw.cover : null,
    sections,
    testimonials,
  };
}

const BLOCK_LABEL: Record<PageBlockType, string> = {
  hero: 'La portada',
  text: 'Un bloque de texto',
  prices: 'La lista de precios',
  faq: 'Las preguntas frecuentes',
  promo: 'La promoción',
  social: 'Las redes sociales',
  video: 'El video',
  team: 'El equipo',
};

function text(
  value: unknown,
  max: number,
  what: string,
  label: string,
): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string')
    throw new ValidationError(`${label}: ${what} no es válido.`);
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw new ValidationError(
      `${label}: ${what} no puede pasar de ${max} caracteres.`,
    );
  }
  return trimmed;
}

function link(value: unknown, what: string, label: string): string {
  const url = text(value, 300, what, label);
  if (url && !/^https:\/\/[^\s]+$/i.test(url)) {
    throw new ValidationError(
      `${label}: ${what} debe ser un enlace que empiece con https://.`,
    );
  }
  return url;
}

/** A handle (@paseospedro) or a full https link; stored as typed. */
function handle(value: unknown, what: string, label: string): string {
  const v = text(value, 200, what, label);
  if (v && !/^(@?[\w.]{1,60}|https:\/\/[^\s]+)$/.test(v)) {
    throw new ValidationError(
      `${label}: ${what} debe ser un usuario (@nombre) o un enlace https://.`,
    );
  }
  return v;
}

function items(
  value: unknown,
  label: string,
  withPrice: boolean,
  limits: [number, number],
) {
  if (value === undefined) return [];
  if (!Array.isArray(value))
    throw new ValidationError(`${label} no es válida.`);
  if (value.length > MAX_BLOCK_ITEMS) {
    throw new ValidationError(
      `${label} puede tener como máximo ${MAX_BLOCK_ITEMS} renglones.`,
    );
  }
  return value
    .map((entry) => {
      const e = (entry ?? {}) as Record<string, unknown>;
      const item: { name: string; detail: string; price?: string } = {
        name: text(e.name, limits[0], 'un renglón', label),
        detail: text(e.detail, limits[1], 'un renglón', label),
      };
      if (withPrice) item.price = text(e.price, 30, 'el precio', label);
      return item;
    })
    .filter((item) => item.name || item.detail);
}

function parseBlockData(type: PageBlockType, input: unknown): PageBlockData {
  const d = (input ?? {}) as Record<string, unknown>;
  const label = BLOCK_LABEL[type];
  switch (type) {
    case 'hero':
      return {
        title: text(d.title, 80, 'el título', label),
        subtitle: text(d.subtitle, 160, 'el texto', label),
      };
    case 'text':
      return {
        title: text(d.title, 80, 'el título', label),
        body: text(d.body, 1500, 'el texto', label),
      };
    case 'prices':
      return {
        title: text(d.title, 80, 'el título', label),
        items: items(d.items, label, true, [60, 120]),
      };
    case 'faq':
      return {
        title: text(d.title, 80, 'el título', label),
        items: items(d.items, label, false, [150, 600]),
      };
    case 'team':
      return {
        title: text(d.title, 80, 'el título', label),
        items: items(d.items, label, false, [60, 80]),
      };
    case 'promo': {
      const until =
        d.until === undefined || d.until === null || d.until === ''
          ? null
          : d.until;
      if (
        until !== null &&
        (typeof until !== 'string' || !ISO_DAY.test(until))
      ) {
        throw new ValidationError(`${label}: la fecha de fin no es válida.`);
      }
      return {
        title: text(d.title, 80, 'el título', label),
        body: text(d.body, 300, 'el texto', label),
        until: until,
      };
    }
    case 'social':
      return {
        instagram: handle(d.instagram, 'Instagram', label),
        facebook: handle(d.facebook, 'Facebook', label),
        tiktok: handle(d.tiktok, 'TikTok', label),
        website: link(d.website, 'el sitio web', label),
      };
    case 'video':
      return {
        title: text(d.title, 80, 'el título', label),
        url: link(d.url, 'el enlace', label),
      };
  }
}
