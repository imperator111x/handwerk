import { siteConfig } from "../config/site";
import {
  OFFER_TAX_NOTE,
  OFFER_UNIT_LABELS,
  formatEuro,
  formatEuroAmount,
  formatOfferDate,
  formatQuantity,
  isOfferUnit,
  lineTotalCents,
  offerTotalCents,
  parseEuroToCents,
  parseQuantity,
  type OfferLine,
  type OfferUnit,
} from "./quote";

export const INVOICE_PAYMENT_TERMS = "Zahlbar innerhalb von 14 Tagen ohne Abzug.";
export const INVOICE_RETENTION_NOTE =
  "Der Rechnungsempfänger ist verpflichtet, die Rechnung zu steuerlichen Zwecken mindestens zwei Jahre aufzubewahren.";
export const INVOICE_DEFAULT_INTRO =
  "für die ausgeführte Leistung berechnen wir Ihnen folgende Positionen.";

export const SELLER = {
  tradeName: "Zeus-Service",
  personName: "Leon Lütcke",
  street: "Berliner Allee 44a",
  postalCode: "22850",
  city: "Norderstedt",
  country: "DE",
  email: siteConfig.contact.email,
  phone: siteConfig.contact.phone,
  iban: "DE38100140001598168418",
  bic: "SWNBDEBB",
  accountName: "ZEUS-SERVICE",
} as const;

const UNIT_CODES: Record<OfferUnit, string> = {
  stunde: "HUR",
  km: "KMT",
  pauschal: "C62",
  stueck: "C62",
  m2: "MTK",
  m: "MTR",
};

export interface ParsedInvoice {
  title: string;
  intro: string;
  lines: OfferLine[];
  invoiceDate: string;
  serviceDate: string;
  dueDate: string;
  priceCents: number;
}

export function invoiceNumber(id: number, invoiceDate: string): string {
  const year = /^(\d{4})-\d{2}-\d{2}$/.exec(invoiceDate)?.[1] ?? "0000";
  return `R-${year}-${String(id).padStart(4, "0")}`;
}

export function addIsoDays(isoDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return date.toISOString().slice(0, 10);
}

export function isoCompact(isoDate: string): string {
  return isoDate.replace(/-/g, "");
}

export function parseTaxNumber(raw: string): string | null {
  const text = raw.trim().replace(/\s+/g, " ");
  const digits = text.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 13) return null;
  if (!/^[\d/ ]+$/.test(text)) return null;
  return text;
}

export function parseInvoiceForm(form: FormData, today: string): ParsedInvoice | null {
  const title = String(form.get("title") ?? "").trim();
  const intro = String(form.get("intro") ?? "").trim();
  const invoiceDate = String(form.get("invoice_date") ?? "").trim();
  const serviceDate = String(form.get("service_date") ?? "").trim();
  if (title.length < 3 || title.length > 120) return null;
  if (intro.length > 2000) return null;
  if (!isIsoDate(invoiceDate) || !isIsoDate(serviceDate)) return null;
  if (invoiceDate > today || serviceDate > invoiceDate) return null;
  if (daySpan(invoiceDate, today) > 366 || daySpan(serviceDate, invoiceDate) > 366) return null;

  const labels = form.getAll("line_label").map((value) => String(value));
  const quantities = form.getAll("line_qty").map((value) => String(value));
  const units = form.getAll("line_unit").map((value) => String(value));
  const prices = form.getAll("line_price").map((value) => String(value));
  const count = Math.max(labels.length, quantities.length, units.length, prices.length);
  if (count < 1 || count > 12) return null;
  const lines: OfferLine[] = [];
  for (let index = 0; index < count; index += 1) {
    const label = (labels[index] ?? "").trim();
    const quantityRaw = (quantities[index] ?? "").trim();
    const unitRaw = (units[index] ?? "").trim();
    const priceRaw = (prices[index] ?? "").trim();
    if (!quantityRaw && !priceRaw) continue;
    const quantity = parseQuantity(quantityRaw);
    const unitCents = parseEuroToCents(priceRaw);
    if (label.length < 2 || label.length > 120) return null;
    if (quantity == null || unitCents == null || !isOfferUnit(unitRaw)) return null;
    lines.push({ label, quantity, unit: unitRaw, unitCents });
  }
  if (lines.length < 1) return null;
  const priceCents = offerTotalCents(lines);
  if (priceCents <= 0 || priceCents > 10_000_000) return null;
  return {
    title,
    intro,
    lines,
    invoiceDate,
    serviceDate,
    dueDate: addIsoDays(invoiceDate, 14),
    priceCents,
  };
}

export function invoicePlainText(input: {
  number: string;
  title: string;
  intro: string;
  lines: OfferLine[];
  invoiceDate: string;
  serviceDate: string;
  dueDate: string;
  taxNumber: string;
  storno?: boolean;
}): string {
  const rows = input.lines.map((line, index) => {
    const total = lineTotalCents(line);
    return `${index + 1}. ${line.label} — ${formatQuantity(line.quantity)} ${OFFER_UNIT_LABELS[line.unit]} × ${formatEuro(line.unitCents)} = ${formatEuro(total)}`;
  });
  const paymentTerms = input.storno ? "Es ist kein Betrag zu zahlen." : INVOICE_PAYMENT_TERMS;
  return [
    `${input.storno ? "Stornorechnung" : "Rechnung"} ${input.number}`,
    input.title,
    "",
    input.intro.trim() || INVOICE_DEFAULT_INTRO,
    "",
    ...rows,
    "",
    `Rechnungsbetrag: ${formatEuro(offerTotalCents(input.lines))}`,
    `Nettobetrag: ${formatEuro(offerTotalCents(input.lines))}`,
    "Umsatzsteuer: 0,00 €",
    "",
    OFFER_TAX_NOTE,
    "",
    paymentTerms,
    "",
    INVOICE_RETENTION_NOTE,
    "",
    `Rechnungsdatum: ${formatOfferDate(input.invoiceDate)}`,
    `Leistungsdatum: ${formatOfferDate(input.serviceDate)}`,
    `Fällig am: ${formatOfferDate(input.dueDate)}`,
    `Steuernummer: ${input.taxNumber}`,
    "",
    `IBAN: ${SELLER.iban}`,
    `BIC: ${SELLER.bic}`,
    `Kontoinhaber: ${SELLER.accountName}`,
    "",
    input.storno ? "Die Stornorechnung hängt als ZUGFeRD-PDF an." : "Die Rechnung hängt als ZUGFeRD-PDF an.",
  ].join("\n");
}

export function buildInvoiceXml(input: {
  number: string;
  title: string;
  lines: OfferLine[];
  invoiceDate: string;
  serviceDate: string;
  dueDate: string;
  taxNumber: string;
  buyerName: string;
  buyerEmail: string;
  buyerStreet: string;
  buyerPostalCode: string;
  buyerCity: string;
  typeCode?: "380" | "381";
  referenceNumber?: string;
  referenceDate?: string;
  paymentTerms?: string;
}): string {
  const typeCode = input.typeCode === "381" ? "381" : "380";
  const paymentTerms = input.paymentTerms?.trim() || INVOICE_PAYMENT_TERMS;
  const reference =
    input.referenceNumber && input.referenceDate
      ? `
      <ram:InvoiceReferencedDocument>
        <ram:IssuerAssignedID>${xml(input.referenceNumber)}</ram:IssuerAssignedID>
        <ram:FormattedIssueDateTime>
          <qdt:DateTimeString format="102">${isoCompact(input.referenceDate)}</qdt:DateTimeString>
        </ram:FormattedIssueDateTime>
      </ram:InvoiceReferencedDocument>`
      : "";
  const net = offerTotalCents(input.lines);
  const lines = input.lines
    .map((line, index) => {
      const total = lineTotalCents(line);
      return `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>${index + 1}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>${xml(line.label)}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>${money(line.unitCents)}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="${UNIT_CODES[line.unit]}">${quantity(line.quantity)}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>E</ram:CategoryCode>
          <ram:RateApplicablePercent>0</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${money(total)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:en16931</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${xml(input.number)}</ram:ID>
    <ram:TypeCode>${typeCode}</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${isoCompact(input.invoiceDate)}</udt:DateTimeString>
    </ram:IssueDateTime>
    <ram:IncludedNote>
      <ram:Content>${xml(OFFER_TAX_NOTE)}</ram:Content>
    </ram:IncludedNote>
    <ram:IncludedNote>
      <ram:Content>${xml(paymentTerms)}</ram:Content>
    </ram:IncludedNote>
    <ram:IncludedNote>
      <ram:Content>${xml(INVOICE_RETENTION_NOTE)}</ram:Content>
    </ram:IncludedNote>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${lines}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:BuyerReference>${xml(input.buyerName)}</ram:BuyerReference>
      <ram:SellerTradeParty>
        <ram:Name>${xml(SELLER.tradeName)}</ram:Name>
        <ram:DefinedTradeContact>
          <ram:PersonName>${xml(SELLER.personName)}</ram:PersonName>
          <ram:TelephoneUniversalCommunication>
            <ram:CompleteNumber>${xml(SELLER.phone)}</ram:CompleteNumber>
          </ram:TelephoneUniversalCommunication>
          <ram:EmailURIUniversalCommunication>
            <ram:URIID>${xml(SELLER.email)}</ram:URIID>
          </ram:EmailURIUniversalCommunication>
        </ram:DefinedTradeContact>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${xml(SELLER.postalCode)}</ram:PostcodeCode>
          <ram:LineOne>${xml(SELLER.street)}</ram:LineOne>
          <ram:CityName>${xml(SELLER.city)}</ram:CityName>
          <ram:CountryID>${SELLER.country}</ram:CountryID>
        </ram:PostalTradeAddress>
        <ram:URIUniversalCommunication>
          <ram:URIID schemeID="EM">${xml(SELLER.email)}</ram:URIID>
        </ram:URIUniversalCommunication>
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="FC">${xml(input.taxNumber)}</ram:ID>
        </ram:SpecifiedTaxRegistration>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${xml(input.buyerName)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${xml(input.buyerPostalCode)}</ram:PostcodeCode>
          <ram:LineOne>${xml(input.buyerStreet)}</ram:LineOne>
          <ram:CityName>${xml(input.buyerCity)}</ram:CityName>
          <ram:CountryID>DE</ram:CountryID>
        </ram:PostalTradeAddress>
        <ram:URIUniversalCommunication>
          <ram:URIID schemeID="EM">${xml(input.buyerEmail)}</ram:URIID>
        </ram:URIUniversalCommunication>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>
      <ram:ActualDeliverySupplyChainEvent>
        <ram:OccurrenceDateTime>
          <udt:DateTimeString format="102">${isoCompact(input.serviceDate)}</udt:DateTimeString>
        </ram:OccurrenceDateTime>
      </ram:ActualDeliverySupplyChainEvent>
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:PaymentReference>${xml(input.number)}</ram:PaymentReference>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>58</ram:TypeCode>
        <ram:Information>${xml(paymentTerms)}</ram:Information>
        <ram:PayeePartyCreditorFinancialAccount>
          <ram:IBANID>${SELLER.iban}</ram:IBANID>
          <ram:AccountName>${xml(SELLER.accountName)}</ram:AccountName>
        </ram:PayeePartyCreditorFinancialAccount>
        <ram:PayeeSpecifiedCreditorFinancialInstitution>
          <ram:BICID>${SELLER.bic}</ram:BICID>
        </ram:PayeeSpecifiedCreditorFinancialInstitution>
      </ram:SpecifiedTradeSettlementPaymentMeans>
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>0.00</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:ExemptionReason>${xml(OFFER_TAX_NOTE)}</ram:ExemptionReason>
        <ram:BasisAmount>${money(net)}</ram:BasisAmount>
        <ram:CategoryCode>E</ram:CategoryCode>
        <ram:RateApplicablePercent>0</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradePaymentTerms>
        <ram:Description>${xml(paymentTerms)}</ram:Description>
        <ram:DueDateDateTime>
          <udt:DateTimeString format="102">${isoCompact(input.dueDate)}</udt:DateTimeString>
        </ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${money(net)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${money(net)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">0.00</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${money(net)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${money(net)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>${reference}
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function daySpan(earlier: string, later: string): number {
  return Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000);
}

function money(cents: number): string {
  return (cents / 100).toFixed(2);
}

function quantity(value: number): string {
  return value.toFixed(2);
}

function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatInvoiceMoney(cents: number): string {
  return formatEuroAmount(cents);
}
