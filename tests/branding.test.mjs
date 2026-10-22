// Regressionstest til branding-reglerne (src/lib/brandingCore.js).
// Kør med:  node tests/branding.test.mjs
import { resolveBranding, DEFAULT_COLORS, FALLBACK_NAME, hexToRgbChannels, sanitizeResolved, normalizeHostname } from "../src/lib/brandingCore.js";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log("FAIL:", name, "\n  got: ", JSON.stringify(got), "\n  want:", JSON.stringify(want)); }
};

const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";
const punkt1 = { name: "Punkt1", branding: { logo_light: `org/${U1}/logo-light-1.png`, logo_dark: `org/${U1}/logo-dark-1.png`, colors: { brand: "#C8232E", ink: "#111111" } } };

// --- uden noget
eq("intet: standard", resolveBranding(null, null), { displayName: FALLBACK_NAME, logoLight: null, logoDark: null, colors: { ...DEFAULT_COLORS } });

// --- kun kæde
const k = resolveBranding(punkt1, null);
eq("kæde: logoer", [k.logoLight, k.logoDark], [punkt1.branding.logo_light, punkt1.branding.logo_dark]);
eq("kæde: navn fra kæden", k.displayName, "Punkt1");
eq("kæde: farver flettes med standard", k.colors, { ...DEFAULT_COLORS, brand: "#C8232E", ink: "#111111" });

// --- butik uden eget branding arver kæden
const b0 = resolveBranding(punkt1, { name: "Bjerg Iversen", branding: {} });
eq("butik uden branding: kædens logo", b0.logoLight, punkt1.branding.logo_light);
eq("butik uden branding: kædens navn", b0.displayName, "Punkt1");

// --- butik med eget logo (begge)
const bi = { name: "Bjerg Iversen", branding: { display_name: "Bjerg Iversen", logo_light: `store/${U2}/logo-light-2.png`, logo_dark: `store/${U2}/logo-dark-2.png` } };
const b1 = resolveBranding(punkt1, bi);
eq("butik: eget logo vinder", [b1.logoLight, b1.logoDark], [bi.branding.logo_light, bi.branding.logo_dark]);
eq("butik: eget visningsnavn", b1.displayName, "Bjerg Iversen");
eq("butik uden egne farver: kædens farver", b1.colors.ink, "#111111");

// --- logoer er et PAR: kun ét butikslogo blander ikke med kædens
const b2 = resolveBranding(punkt1, { name: "X", branding: { logo_light: `store/${U2}/logo-light-3.png` } });
eq("ét butikslogo: kædens mørke logo bruges IKKE", [b2.logoLight, b2.logoDark], [`store/${U2}/logo-light-3.png`, null]);

// --- farver: butik overskriver pr. farve, ugyldige ignoreres
const b3 = resolveBranding(punkt1, { name: "X", branding: { colors: { brand: "#00AA00", paper: "red", evil: "#FFFFFF" } } });
eq("butiksfarve vinder, ugyldige ignoreres", b3.colors, { ...DEFAULT_COLORS, brand: "#00AA00", ink: "#111111" });

// --- hexToRgbChannels
eq("hex -> kanaler", hexToRgbChannels("#C8232E"), "200 35 46");
eq("ugyldig hex", [hexToRgbChannels("#FFF"), hexToRgbChannels(null), hexToRgbChannels("C8232E")], [null, null, null]);

// --- sanitizeResolved (localStorage-cache)
eq("cache: skrald -> null", [sanitizeResolved(null), sanitizeResolved("x")], [null, null]);
eq("cache: ugyldig sti og farve fjernes", sanitizeResolved({ displayName: "A", logoLight: "../../etc", logoDark: `org/${U1}/a.png`, colors: { brand: "javascript:" } }),
  { displayName: "A", logoLight: null, logoDark: `org/${U1}/a.png`, colors: { ...DEFAULT_COLORS } });

// --- normalizeHostname
eq("domæne: url og store bogstaver", normalizeHostname(" https://BjergIversen.dk/login?x=1 "), "bjergiversen.dk");
eq("domæne: port og punktum", normalizeHostname("app.punkt1.dk:443."), "app.punkt1.dk");
eq("domæne: ugyldige", [normalizeHostname("ikke et domæne"), normalizeHostname(""), normalizeHostname("-a.dk"), normalizeHostname(null)], [null, null, null, null]);

console.log(`branding: ${pass} ok, ${fail} fejl`);
if (fail) process.exit(1);
