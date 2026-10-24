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

const spam = await import("../src/lib/contact-spam.ts");

assert.equal(spam.isContactSpam("Erika", "reparatur", "Rollladen klemmt seit gestern."), false);
assert.equal(spam.isContactSpam("Max", "sonstiges", "Sie haben 500 € gewonnen!"), true);
assert.equal(spam.isContactSpam("Max", "sonstiges", "Bitte um eine Spende für unser Projekt."), true);
assert.equal(spam.isContactSpam("Max", "sonstiges", "Viele Spenden helfen uns."), true);
assert.equal(spam.isContactSpam("Gewinnspiel Bot", "sonstiges", "Hallo"), true);
assert.equal(spam.contactSpamReason("", "", "Herzlichen Glückwunsch, Sie haben gewonnen"), "gewonnen");
assert.equal(spam.isContactSpam("Anna", "wartung", "Können Sie die Heizung prüfen?"), false);

console.log("contact-spam checks ok");
