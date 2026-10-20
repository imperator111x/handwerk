import { services } from "../config/services";
import { siteConfig } from "../config/site";

export const faqs = [
  {
    question: "Wo ist der Hausmeisterservice im Einsatz?",
    answer:
      "Zeus-Service ist in Hamburg und Norderstedt im Einsatz, für Privathaushalte, Wohnanlagen und Gewerbeobjekte.",
  },
  {
    question: "Welche Arbeiten werden übernommen?",
    answer:
      "Dazu gehören Reparaturen, Reinigung, Wartung und die Objektbetreuung, zum Beispiel Kleinreparaturen, Treppenhausreinigung, Rauchmelder-Checks und Kontrollgänge.",
  },
  {
    question: "Wann ist Zeus-Service erreichbar?",
    answer:
      "Telefonisch montags, mittwochs, donnerstags und freitags von 9 bis 20 Uhr, samstags von 15 bis 18 Uhr. Dienstag und Sonntag sind geschlossen, eine Anfrage ist trotzdem möglich.",
  },
  {
    question: "Wie bekommt man ein Angebot?",
    answer:
      "Über das Kontaktformular oder telefonisch. Eine Rückmeldung kommt in der Regel innerhalb von 24 Stunden, das Angebot ist unverbindlich.",
  },
] as const;

export function publicCanonical(pathname: string): string {
  const path = pathname !== "/" && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return new URL(path, siteConfig.url).toString();
}

export function businessJsonLd() {
  const { address } = siteConfig.contact;
  return {
    "@context": "https://schema.org",
    "@type": "HomeAndConstructionBusiness",
    "@id": `${siteConfig.url}/#betrieb`,
    name: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.url,
    image: `${siteConfig.url}/og-image.png`,
    logo: `${siteConfig.url}/icon-512.png`,
    telephone: "+4915565775217",
    address: {
      "@type": "PostalAddress",
      streetAddress: address.street,
      postalCode: address.zip,
      addressLocality: address.city,
      addressCountry: "DE",
    },
    areaServed: [
      { "@type": "City", name: "Hamburg" },
      { "@type": "City", name: "Norderstedt" },
    ],
    priceRange: "€€",
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Wednesday", "Thursday", "Friday"],
        opens: "09:00",
        closes: "20:00",
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: "Saturday",
        opens: "15:00",
        closes: "18:00",
      },
    ],
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Hausmeisterservice",
      itemListElement: services.map((service) => ({
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: service.title,
          description: service.description,
        },
      })),
    },
  };
}

export function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: entry.answer,
      },
    })),
  };
}

export function breadcrumbJsonLd(crumbs: Array<{ name: string; path: string }>) {
  const items = [{ name: "Startseite", path: "/" }, ...crumbs];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: publicCanonical(crumb.path),
    })),
  };
}
