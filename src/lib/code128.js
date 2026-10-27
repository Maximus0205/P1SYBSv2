// CODE 128 (kode-sæt B) til RMA-labels (oktober 2026). Ren funktion uden afhængigheder, så stregkoden kan tegnes som SVG og afprøves i Node.
// Tegnene ASCII 32-126 dækker "RMA-26-223-1". Tabellen er den standardiserede Code 128-tabel: 11 moduler pr. tegn ('1' = streg, '0' = mellemrum),
// stopkoden har 13 moduler. Kontroltegnet er (startværdi + sum af position * værdi) mod 103. Afprøvet mod en uafhængig implementation i tests/code128.test.mjs.
const MOENSTRE = ["11011001100", "11001101100", "11001100110", "10010011000", "10010001100", "10001001100", "10011001000", "10011000100", "10001100100", "11001001000", "11001000100", "11000100100", "10110011100", "10011011100", "10011001110", "10111001100", "10011101100", "10011100110", "11001110010", "11001011100", "11001001110", "11011100100", "11001110100", "11101101110", "11101001100", "11100101100", "11100100110", "11101100100", "11100110100", "11100110010", "11011011000", "11011000110", "11000110110", "10100011000", "10001011000", "10001000110", "10110001000", "10001101000", "10001100010", "11010001000", "11000101000", "11000100010", "10110111000", "10110001110", "10001101110", "10111011000", "10111000110", "10001110110", "11101110110", "11010001110", "11000101110", "11011101000", "11011100010", "11011101110", "11101011000", "11101000110", "11100010110", "11101101000", "11101100010", "11100011010", "11101111010", "11001000010", "11110001010", "10100110000", "10100001100", "10010110000", "10010000110", "10000101100", "10000100110", "10110010000", "10110000100", "10011010000", "10011000010", "10000110100", "10000110010", "11000010010", "11001010000", "11110111010", "11000010100", "10001111010", "10100111100", "10010111100", "10010011110", "10111100100", "10011110100", "10011110010", "11110100100", "11110010100", "11110010010", "11011011110", "11011110110", "11110110110", "10101111000", "10100011110", "10001011110", "10111101000", "10111100010", "11110101000", "11110100010", "10111011110", "10111101110", "11101011110", "11110101110", "11010000100", "11010010000", "11010011100", "1100011101011"];
const START_B = 104, STOP = 106;

export function kanKodes(tekst) {
  return typeof tekst === "string" && tekst.length > 0 && tekst.length <= 40 && [...tekst].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126);
}

// Værdierne (inkl. start, kontroltegn og stop) for en tekst.
export function code128Vaerdier(tekst) {
  if (!kanKodes(tekst)) throw new Error("Teksten kan ikke kodes som stregkode (kun almindelige tegn, højst 40).");
  const tegn = [...tekst].map((c) => c.charCodeAt(0) - 32);
  const sum = tegn.reduce((s, v, i) => s + v * (i + 1), START_B);
  return [START_B, ...tegn, sum % 103, STOP];
}

// Modulerne som tekst af 1 og 0, inkl. stille zone i hver ende.
export function code128Moduler(tekst, stille = 10) {
  const bits = code128Vaerdier(tekst).map((v) => MOENSTRE[v]).join("");
  return "0".repeat(stille) + bits + "0".repeat(stille);
}

// Søjler (x, bredde) i modul-enheder, med sammenhængende streger slået sammen - til SVG.
export function code128Soejler(tekst, stille = 10) {
  const m = code128Moduler(tekst, stille);
  const ud = [];
  for (let i = 0; i < m.length; ) {
    if (m[i] === "1") { let j = i; while (j < m.length && m[j] === "1") j++; ud.push({ x: i, b: j - i }); i = j; } else i++;
  }
  return { soejler: ud, bredde: m.length };
}
