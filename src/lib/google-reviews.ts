/**
 * Google Places API (New): Sterne + bis zu 5 Rezensionen für die Website.
 * Cache in KV, damit die Startseite nicht bei jedem Aufruf Google belastet.
 */

const CACHE_TTL_SECONDS = 6 * 60 * 60;
const CACHE_PREFIX = "google:place-reviews:";
const FIELD_MASK =
  "id,displayName,rating,userRatingCount,googleMapsUri,reviews";

export interface GoogleReview {
  authorName: string;
  authorUri: string | null;
  photoUri: string | null;
  rating: number;
  text: string;
  relativeTime: string;
  reviewUri: string | null;
}

export interface GooglePlaceReviews {
  placeId: string;
  name: string;
  rating: number | null;
  userRatingCount: number;
  mapsUri: string | null;
  writeReviewUri: string;
  reviews: GoogleReview[];
  fetchedAt: number;
}

type PlacesApiReview = {
  rating?: number;
  relativePublishTimeDescription?: string;
  text?: { text?: string };
  originalText?: { text?: string };
  authorAttribution?: {
    displayName?: string;
    uri?: string;
    photoUri?: string;
  };
  googleMapsUri?: string;
};

type PlacesApiPlace = {
  id?: string;
  displayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  reviews?: PlacesApiReview[];
};

export function googleReviewsConfigured(env: {
  GOOGLE_PLACES_API_KEY?: string;
  GOOGLE_PLACE_ID?: string;
}): boolean {
  return Boolean(env.GOOGLE_PLACES_API_KEY?.trim() && env.GOOGLE_PLACE_ID?.trim());
}

export function writeReviewUrl(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}

export function mapsPlaceUrl(placeId: string): string {
  return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`;
}

function cacheKey(placeId: string): string {
  return `${CACHE_PREFIX}${placeId.trim()}`;
}

function normalizeReview(row: PlacesApiReview): GoogleReview | null {
  const rating = typeof row.rating === "number" ? row.rating : Number.NaN;
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) return null;
  const text = (row.text?.text ?? row.originalText?.text ?? "").trim();
  const authorName = (row.authorAttribution?.displayName ?? "").trim() || "Google-Nutzer";
  return {
    authorName,
    authorUri: row.authorAttribution?.uri?.trim() || null,
    photoUri: row.authorAttribution?.photoUri?.trim() || null,
    rating,
    text,
    relativeTime: (row.relativePublishTimeDescription ?? "").trim(),
    reviewUri: row.googleMapsUri?.trim() || null,
  };
}

export function parsePlaceReviews(placeId: string, raw: PlacesApiPlace): GooglePlaceReviews {
  const reviews = (raw.reviews ?? [])
    .map(normalizeReview)
    .filter((row): row is GoogleReview => Boolean(row))
    .sort((a, b) => b.rating - a.rating || b.text.length - a.text.length);
  const rating = typeof raw.rating === "number" && Number.isFinite(raw.rating) ? raw.rating : null;
  const count = Number.isFinite(raw.userRatingCount) ? Number(raw.userRatingCount) : reviews.length;
  return {
    placeId,
    name: (raw.displayName?.text ?? "").trim() || "Zeus-Service",
    rating,
    userRatingCount: Math.max(0, count),
    mapsUri: raw.googleMapsUri?.trim() || mapsPlaceUrl(placeId),
    writeReviewUri: writeReviewUrl(placeId),
    reviews,
    fetchedAt: Math.floor(Date.now() / 1000),
  };
}

export async function fetchGooglePlaceReviews(
  apiKey: string,
  placeId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GooglePlaceReviews> {
  const id = placeId.trim();
  if (!apiKey.trim() || !id) {
    throw new Error("Google Places: API-Key oder Place-ID fehlt.");
  }
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`);
  url.searchParams.set("languageCode", "de");
  const response = await fetchImpl(url.toString(), {
    headers: {
      "X-Goog-Api-Key": apiKey.trim(),
      "X-Goog-FieldMask": FIELD_MASK,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Google Places ${response.status}: ${body.slice(0, 240)}`);
  }
  const json = (await response.json()) as PlacesApiPlace;
  return parsePlaceReviews(id, json);
}

export async function loadGooglePlaceReviews(
  env: {
    GOOGLE_PLACES_API_KEY?: string;
    GOOGLE_PLACE_ID?: string;
    SESSIONS?: KVNamespace;
  },
  options?: { force?: boolean; fetchImpl?: typeof fetch },
): Promise<GooglePlaceReviews | null> {
  const apiKey = env.GOOGLE_PLACES_API_KEY?.trim() ?? "";
  const placeId = env.GOOGLE_PLACE_ID?.trim() ?? "";
  if (!apiKey || !placeId) return null;

  const key = cacheKey(placeId);
  if (!options?.force && env.SESSIONS) {
    const cached = await env.SESSIONS.get(key, "json");
    if (cached && typeof cached === "object") {
      return cached as GooglePlaceReviews;
    }
  }

  const fresh = await fetchGooglePlaceReviews(apiKey, placeId, options?.fetchImpl ?? fetch);
  if (env.SESSIONS) {
    await env.SESSIONS.put(key, JSON.stringify(fresh), { expirationTtl: CACHE_TTL_SECONDS });
  }
  return fresh;
}
