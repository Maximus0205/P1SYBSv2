// ---------------------------------------------------------------------------
// CENTRALT TEMA. Al farve/typografi-branding for hele appen defineres HER og
// KUN her - resten af koden bruger semantiske Tailwind-klasser
// (fx `bg-brand`, `text-ink`, `bg-paper`) i stedet for hardkodede hex-koder
// som `bg-[#C8232E]`. Skal appen rebrandes til et andet kædenavn/andre
// farver engang, er dette den ENESTE fil, der skal røres - alle
// komponenter opdaterer sig selv, fordi de refererer til navnene, ikke til
// de faktiske farveværdier.
//
// Nuværende brand: Punkt1 (rød/sort/hvid/lysegrå).
//
// Semantik (brug disse i stedet for at gætte en ny hex-kode et nyt sted):
//   brand      - primær accentfarve (knapper, aktive faner, links, fokus)
//   ink        - næsten-sort (mørk baggrund/header, primær tekst på lys bund)
//   paper      - sidens/appens baggrund
//   panel      - let afvigende panel-baggrund oven på "paper" (fx udfyldte felter)
//   line       - standard kant-/rammefarve
//   divider    - svag skillelinje (svagere end "line")
//   muted      - sekundær/dæmpet tekst
//   faint      - meget svag tekst (fx sagsnumre, tidsstempler)
//   success / info / danger - funktionelle statusfarver (uafhængige af brand)
// ---------------------------------------------------------------------------
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#C8232E",
          dark: "#A61B24",
        },
        ink: "#1A1A1A",
        paper: "#F2F2F2",
        panel: "#F7F7F7",
        line: "#DDDDDD",
        divider: "#EEEEEE",
        muted: "#5C5C5C",
        faint: "#BBBBBB",
        success: "#3D7A5C",
        info: "#1C7C8C",
        danger: "#B3261E",
      },
      fontFamily: {
        display: ["'Barlow Condensed'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};
