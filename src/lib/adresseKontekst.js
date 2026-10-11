// BUTIKKENS ADRESSEKONTEKST TIL ADRESSEFELTER (oktober 2026).
//
// AddressInput rangerer forslag efter nærhed til butikken (kommunekode + postnummer). Det virkede kun de steder, hvor de to værdier blev sendt
// med som props (ny booking, Adresser) - ikke i "Rediger booking" (BookingEditor), der ligger dybt inde i sagsvisningen. I stedet for at sende
// props gennem hele sagsvisningen (OrderRoute -> OrderView/TechnicianOrderDetail -> BookingEditor) sætter App.jsx dem ét sted her, og
// AddressInput bruger dem, når den ikke selv har fået dem. Eksplicitte props vinder altid.
let kontekst = { kommunekode: null, postnr: null };

export function saetAdresseKontekst({ kommunekode, postnr }) {
  kontekst = { kommunekode: kommunekode || null, postnr: postnr || null };
}

export function hentAdresseKontekst() {
  return kontekst;
}
