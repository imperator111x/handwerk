function clip(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

function personName(raw: string): string {
  const withoutAddress = raw.replace(/<[^>]*>/g, " ").replace(/["']/g, " ");
  const name = clip(withoutAddress, 60);
  if (!name) return "Jemand";
  if (!name.includes("@")) return name;
  const local = name.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  return local || "Jemand";
}

function subjectLine(raw: string): string {
  const subject = clip(raw, 80);
  if (!subject || /^ohne betreff$/i.test(subject)) return "";
  return subject;
}

export function requestNotice(name: string, topic: string): { title: string; body: string } {
  const person = personName(name);
  const about = clip(topic, 40) || "ein Anliegen";
  return {
    title: "Neue Anfrage",
    body: `${person} hat angefragt: ${about}.`,
  };
}

export function replyNotice(name: string, subject: string): { title: string; body: string } {
  const person = personName(name);
  const about = subjectLine(subject);
  return {
    title: "Neue Antwort",
    body: about ? `${person} hat geantwortet: ${about}` : `${person} hat auf eine Anfrage geantwortet.`,
  };
}

export function mailNotice(name: string, subject: string): { title: string; body: string } {
  const person = personName(name);
  const about = subjectLine(subject);
  return {
    title: "Neue E-Mail",
    body: about ? `${person} schreibt: ${about}` : `${person} hat eine E-Mail geschickt.`,
  };
}
