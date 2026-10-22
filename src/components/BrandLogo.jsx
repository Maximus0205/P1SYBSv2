import React, { useEffect, useState } from "react";
import { logoUrl } from "../lib/branding";

// Viser kædens/butikkens logo. variant "light" = logo til LYS baggrund
// (login), "dark" = logo til MØRK baggrund (topbar). Mangler logoet, eller
// kan det ikke indlæses (fx iOS Safari med en indholdsblokerings-udvidelse),
// vises navnet som tekst, så siden aldrig ser "i stykker" ud.
export function BrandLogo({ branding, variant, className, textClassName }) {
  const path = variant === "dark" ? branding.logoDark : branding.logoLight;
  const src = logoUrl(path);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);

  if (!src || failed) {
    return <span className={textClassName}>{branding.displayName}</span>;
  }
  return (
    <img
      src={src}
      alt={branding.displayName}
      className={className}
      loading="eager"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
