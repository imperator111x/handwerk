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

// Legitim
assert.equal(
  spam.isContactSpam({
    name: "Erika",
    email: "erika@example.com",
    topic: "reparatur",
    message: "Rollladen klemmt seit gestern.",
  }),
  false,
);
assert.equal(
  spam.isContactSpam({
    name: "Anna",
    email: "anna@hof.de",
    topic: "wartung",
    message: "Können Sie die Heizung prüfen und ein Angebot schicken?",
  }),
  false,
);

// Alt bekannte Muster
assert.equal(spam.isContactSpam("Max", "sonstiges", "Sie haben 500 € gewonnen!"), true);
assert.equal(
  spam.isContactSpam("Max", "sonstiges", "Bitte um eine Spende für unser Projekt."),
  true,
);
assert.equal(spam.isContactSpam("Gewinnspiel Bot", "sonstiges", "Hallo"), true);
assert.equal(
  spam.contactSpamReason("", "", "Herzlichen Glückwunsch, Sie haben gewonnen"),
  "gewonnen",
);

// Live-Spam: Prime-Phishing
assert.equal(
  spam.isContactSpam({
    name: "PrimeVideo.com",
    email: "lance-osier.39@guselux.de",
    subject: "Ihre Prime-Vorteile",
    message:
      "Ihre Prime-Vorteile bleiben voll aktiv. Testphase beendet. Tarif 112,50 € alle 6 Monate. Zahlungsmethoden verwalten.",
  }),
  true,
);

// Live-Spam: Kredit
assert.equal(
  spam.isContactSpam({
    name: "Fajar Fadilah",
    email: "apple.dsi@digitalsiber.id",
    message:
      "Sind Sie auf der Suche nach einem seriösen Kredit? Wir bieten Kredite zu einem Zinssatz von 2 % an.",
  }),
  true,
);

// Live-Spam: Amazon SES Bulk
assert.equal(
  spam.isContactSpam({
    name: "David Blum",
    email: "010001a16eaeeecc-6adddfb9-d919-4b35-a2df-9db72cf7351f-000000@amazonses.com",
    message: "Sehr geehrte Damen und Herren, im Anhang unsere verfügbaren Positionen. Abmelden",
  }),
  true,
);

// Marken-Imitation
assert.equal(
  spam.isContactSpam({
    name: "PayPal Sicherheit",
    email: "security@evil-host.xyz",
    message: "Bitte Konto verifizieren.",
  }),
  true,
);

// Live-Spam: Volksbank-Phishing
assert.equal(
  spam.isContactSpam({
    name: "Volksbank und Raiffeisenbank",
    email: "harbor@dortmandin.com",
    message:
      "Bitte loggen Sie sich in Ihr Online-Banking ein, um die erforderlichen Updates vorzunehmen. Anti-Phishing-Programm. Jetzt reaktivieren.",
  }),
  true,
);
assert.equal(
  spam.contactSpamReason({
    name: "Volksbank und Raiffeisenbank",
    email: "harbor@dortmandin.com",
    message: "Hallo",
  }),
  "brand-volksbank",
);

// Live-Spam: SOS donation scam + short junk
assert.equal(
  spam.isContactSpam({
    name: "SOS-Children's Village",
    email: "administrator@labliss.me",
    message:
      "Greetings and congratulation. you have been awarded a donation sum of ( 3 Million Euro ) as a Humanitarian Community Donation. SOS Children's Village.",
  }),
  true,
);
assert.equal(
  spam.isContactSpam({
    name: "Ellena",
    email: "athu7431@gmail.com",
    message: "Schreiben Sie das bitte für mich auf",
  }),
  true,
);
assert.equal(
  spam.isContactSpam({
    name: "Kunde",
    email: "kunde@gmail.com",
    message: "Heizung defekt, bitte Termin.",
  }),
  false,
);

// Disposable-Blacklist (Community-Liste + Extra-Block)
assert.equal(
  await spam.isContactSpamAsync({
    name: "Temp",
    email: "x@0-mail.com",
    message: "Hallo, ich brauche einen Hausmeistertermin bitte.",
  }),
  true,
);
assert.equal(
  await spam.contactSpamReasonAsync({
    name: "Temp",
    email: "x@0-mail.com",
    message: "Hallo, ich brauche einen Hausmeistertermin bitte.",
  }),
  "disposable-domain",
);
assert.equal(
  await spam.isContactSpamAsync({
    name: "Scam",
    email: "a@labliss.me",
    message: "Hallo Termin bitte Hausmeister",
  }),
  true,
);

console.log("contact-spam checks ok");
