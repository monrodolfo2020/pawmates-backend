import { ValidationError } from '@pawmates/common';

/**
 * One entry in a business's list of services: what it's called, a line
 * on what it includes, its price and how long it takes. Price and
 * duration are optional — a vet's "Consulta general" may be "por
 * acordar", and a hotel night has no duration worth picking.
 *
 * For walkers the list is also what an owner picks from when booking:
 * the booking is priced and timed from the entry, never from what the
 * app sends.
 */
export interface BusinessService {
  /** Stable across edits, so a booking can point at the entry. */
  id: string;
  name: string;
  detail: string;
  /** Cents, MXN. */
  price: number | null;
  durationMinutes: number | null;
}

export const MAX_SERVICES = 20;
const MAX_NAME = 60;
const MAX_DETAIL = 120;
const MAX_PRICE_CENTS = 100_000_00; // $100,000 — well past any real service
const MIN_DURATION = 5;
const MAX_DURATION = 24 * 60;
const ID_PATTERN = /^[a-z0-9]{4,24}$/;

/** Validates a list as the app sends it and returns a clean copy.
 * Rows with neither a name nor a detail are dropped (half-added rows);
 * anything else that's wrong is refused with a message that names it. */
export function parseServices(input: unknown): BusinessService[] {
  if (!Array.isArray(input)) {
    throw new ValidationError('La lista de servicios no es válida.');
  }
  const rows = input.filter(
    (row) => !(isRecord(row) && isBlank(row.name) && isBlank(row.detail)),
  );
  if (rows.length > MAX_SERVICES) {
    throw new ValidationError(
      `Puedes tener como máximo ${MAX_SERVICES} servicios.`,
    );
  }
  const seen = new Set<string>();
  return rows.map((row, i) => {
    const n = i + 1;
    if (!isRecord(row))
      throw new ValidationError(`El servicio ${n} no es válido.`);
    const id = row.id;
    if (typeof id !== 'string' || !ID_PATTERN.test(id) || seen.has(id)) {
      throw new ValidationError(`El servicio ${n} no es válido.`);
    }
    seen.add(id);
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!name)
      throw new ValidationError(`Escribe el nombre del servicio ${n}.`);
    if (name.length > MAX_NAME) {
      throw new ValidationError(
        `El nombre del servicio ${n} es muy largo (máximo ${MAX_NAME}).`,
      );
    }
    const detail = typeof row.detail === 'string' ? row.detail.trim() : '';
    if (detail.length > MAX_DETAIL) {
      throw new ValidationError(
        `La descripción del servicio ${n} es muy larga (máximo ${MAX_DETAIL}).`,
      );
    }
    const price = row.price ?? null;
    if (
      price !== null &&
      (!Number.isInteger(price) ||
        (price as number) < 1 ||
        (price as number) > MAX_PRICE_CENTS)
    ) {
      throw new ValidationError(`El precio del servicio ${n} no es válido.`);
    }
    const durationMinutes = row.durationMinutes ?? null;
    if (
      durationMinutes !== null &&
      (!Number.isInteger(durationMinutes) ||
        (durationMinutes as number) < MIN_DURATION ||
        (durationMinutes as number) > MAX_DURATION)
    ) {
      throw new ValidationError(
        `La duración del servicio ${n} debe estar entre ${MIN_DURATION} minutos y 24 horas.`,
      );
    }
    return {
      id,
      name,
      detail,
      price: price as number | null,
      durationMinutes: durationMinutes as number | null,
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBlank(value: unknown): boolean {
  return typeof value !== 'string' || value.trim() === '';
}
