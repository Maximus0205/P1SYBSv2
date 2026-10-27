// Sorteringsnøgle for sager: nyeste først når man sammenligner med nyesteFoerst. Sager uden dato eller starttidspunkt (uplanlagte) har null/undefined i felterne;
// null + null er TALLET 0 og kan ikke sammenlignes som tekst - det fik appen til at gå ned ved søgning i Planlægning (oktober 2026).
export const dagOgStart = (o) => `${o?.dato || ""}${o?.start || ""}`;
export const nyesteFoerst = (a, b) => dagOgStart(b).localeCompare(dagOgStart(a));
