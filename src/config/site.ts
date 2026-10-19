export const siteConfig = {
  name: "Zeus-Service",
  tagline: "Ihr Hausmeisterservice für Hamburg & Norderstedt",
  description:
    "Professioneller Hausmeisterservice in Hamburg und Norderstedt. Reparaturen, Reinigung, Wartung und Objektbetreuung für Privathaushalte, Wohnanlagen und Gewerbeobjekte. Zuverlässig, kompetent, schnell.",
  url: "https://zeus-service.de",
  locale: "de-DE",
  contact: {
    phone: "+49 1556 5775217",
    phoneHref: "tel:+4915565775217",
    email: "info@zeus-service.de",
    emailHref: "mailto:info@zeus-service.de",
    address: {
      street: "",
      zip: "22850",
      city: "Norderstedt",
      country: "Deutschland",
    },
    hours: [
      { day: "Mo, Mi, Do, Fr", time: "09:00 – 20:00 Uhr" },
      { day: "Samstag", time: "15:00 – 18:00 Uhr (oder auf Anfrage)" },
      { day: "Di, So", time: "Geschlossen (auf Anfrage)" },
    ],
  },
  social: {
    // Hier später z. B. LinkedIn, Google Business, Instagram ergänzen
  },
  nav: [
    { label: "Leistungen", href: "#leistungen" },
    { label: "Über uns", href: "#ueber-uns" },
    { label: "Ablauf", href: "#ablauf" },
    { label: "Referenzen", href: "#referenzen" },
    { label: "Kontakt", href: "#kontakt" },
  ],
} as const;

export type SiteConfig = typeof siteConfig;
