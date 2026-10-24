import assert from "node:assert/strict";
import { berlinLocalToUnix, formatSlot, suggestionsFromPhoton } from "../src/lib/appointments.ts";

const summer = berlinLocalToUnix("2026-07-15", "09:00");
const winter = berlinLocalToUnix("2026-01-15", "09:00");
assert.equal(summer, Date.UTC(2026, 6, 15, 7, 0) / 1000);
assert.equal(winter, Date.UTC(2026, 0, 15, 8, 0) / 1000);
assert.equal(berlinLocalToUnix("2026-07-15", "25:00"), null);
assert.match(formatSlot(summer, summer + 3600), /09:00–10:00 Uhr/);

const suggestions = suggestionsFromPhoton({
  features: [
    {
      properties: {
        street: "Hauptstraße",
        housenumber: "12",
        postcode: "22850",
        city: "Norderstedt",
      },
    },
    {
      properties: {
        street: "Hauptstraße",
        housenumber: "12",
        postcode: "22850",
        city: "Norderstedt",
      },
    },
  ],
});
assert.equal(suggestions.length, 1);
assert.equal(suggestions[0].street, "Hauptstraße 12");
assert.equal(suggestions[0].postalCode, "22850");
assert.equal(suggestions[0].city, "Norderstedt");

console.log("appointment checks ok");
