import assert from "node:assert/strict";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.(?:ts|js|mjs|json)$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const reviews = await import("../src/lib/google-reviews.ts");

assert.equal(reviews.googleReviewsConfigured({}), false);
assert.equal(
  reviews.googleReviewsConfigured({ GOOGLE_PLACES_API_KEY: "k", GOOGLE_PLACE_ID: "ChIJ" }),
  true,
);
assert.match(reviews.writeReviewUrl("ChIJ123"), /placeid=ChIJ123/);

const parsed = reviews.parsePlaceReviews("ChIJabc", {
  displayName: { text: "Zeus-Service" },
  rating: 4.8,
  userRatingCount: 12,
  googleMapsUri: "https://maps.google.com/?cid=1",
  reviews: [
    {
      rating: 5,
      relativePublishTimeDescription: "vor 2 Wochen",
      text: { text: "Schnell und sauber." },
      authorAttribution: { displayName: "Erika M.", uri: "https://example.com/a" },
      googleMapsUri: "https://maps.google.com/review/1",
    },
    {
      rating: 4,
      text: { text: "Gute Arbeit." },
      authorAttribution: { displayName: "Tom" },
    },
  ],
});
assert.equal(parsed.name, "Zeus-Service");
assert.equal(parsed.rating, 4.8);
assert.equal(parsed.userRatingCount, 12);
assert.equal(parsed.reviews.length, 2);
assert.equal(parsed.reviews[0].rating, 5);
assert.equal(parsed.reviews[0].authorName, "Erika M.");
assert.match(parsed.writeReviewUri, /ChIJabc/);

let called = 0;
const fakeFetch = async () => {
  called += 1;
  return new Response(
    JSON.stringify({
      id: "ChIJlive",
      displayName: { text: "Zeus-Service" },
      rating: 5,
      userRatingCount: 1,
      reviews: [{ rating: 5, text: { text: "Top" }, authorAttribution: { displayName: "Alex" } }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
};
const live = await reviews.fetchGooglePlaceReviews("test-key", "ChIJlive", fakeFetch);
assert.equal(called, 1);
assert.equal(live.reviews[0].text, "Top");

const store = new Map();
const kv = {
  async get(key, type) {
    const raw = store.get(key);
    if (raw == null) return null;
    return type === "json" ? JSON.parse(raw) : raw;
  },
  async put(key, value) {
    store.set(key, value);
  },
};
const first = await reviews.loadGooglePlaceReviews(
  { GOOGLE_PLACES_API_KEY: "k", GOOGLE_PLACE_ID: "ChIJlive", SESSIONS: kv },
  { fetchImpl: fakeFetch },
);
const second = await reviews.loadGooglePlaceReviews(
  { GOOGLE_PLACES_API_KEY: "k", GOOGLE_PLACE_ID: "ChIJlive", SESSIONS: kv },
  { fetchImpl: fakeFetch },
);
assert.equal(first?.reviews[0].text, "Top");
assert.equal(second?.reviews[0].text, "Top");
assert.equal(called, 2);

console.log("google-reviews checks ok");
