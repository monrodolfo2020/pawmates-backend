import { Controller, Get, Query } from '@nestjs/common';

/** Nominatim asks that clients identify themselves, and refuses traffic
 * that doesn't. This is why the lookup goes through our own server
 * rather than straight from the browser: a browser can't set a
 * User-Agent, and we'd also be exposing every user's IP to a third party
 * on every keystroke. */
const USER_AGENT =
  process.env.GEOCODER_USER_AGENT ??
  'PawMates/1.0 (directorio de servicios para mascotas; contacto: soporte@pawmates.app)';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

/** Nominatim's usage policy asks for no more than one request a second
 * and forbids autocomplete, which is why the app searches on a button
 * press. This timeout is just so a slow geocoder can't hold a request
 * open. */
const TIMEOUT_MS = 6000;

type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
};

export type GeoSuggestion = {
  label: string;
  latitude: number;
  longitude: number;
};

/**
 * Address search, so a business can place itself on the map instead of
 * typing coordinates.
 *
 * Public: a business needs it before its page is published, and there's
 * nothing sensitive in "turn this address into a point". Deliberately
 * forgiving — an unreachable or slow geocoder returns an empty list with
 * `available: false`, never an error, because failing to find an address
 * must not be able to break the page editor.
 */
@Controller('v1/geo')
export class GeoController {
  @Get('search')
  async search(@Query('q') query?: string, @Query('country') country?: string) {
    const term = query?.trim();
    if (!term || term.length < 4) {
      return { data: { available: true, results: [] as GeoSuggestion[] } };
    }

    const params = new URLSearchParams({
      q: term,
      format: 'jsonv2',
      limit: '6',
      addressdetails: '0',
      // Defaulting to Mexico keeps "Av. Reforma" from resolving to a
      // street in another country; callers can widen it.
      countrycodes: (country ?? 'mx').toLowerCase(),
    });

    try {
      const response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'es' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        return { data: { available: false, results: [] as GeoSuggestion[] } };
      }
      const payload = (await response.json()) as NominatimResult[];
      const results = (Array.isArray(payload) ? payload : [])
        .map((row) => ({
          label: row.display_name,
          latitude: Number(row.lat),
          longitude: Number(row.lon),
        }))
        .filter(
          (r) =>
            r.label &&
            Number.isFinite(r.latitude) &&
            Number.isFinite(r.longitude),
        );
      return { data: { available: true, results } };
    } catch {
      // Unreachable, timed out, rate-limited, or answered with something
      // that isn't JSON. The business can still type its address by hand.
      return { data: { available: false, results: [] as GeoSuggestion[] } };
    }
  }
}
