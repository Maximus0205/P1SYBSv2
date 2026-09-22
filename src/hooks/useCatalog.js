import { useState, useEffect, useCallback } from "react";
import {
  getProductTypes, saveProductType, deleteProductType, seedDefaultProductTypes,
  getProductCategories, saveProductCategory, deleteProductCategory, seedDefaultProductCategories,
  getPrimaryServices, savePrimaryService, deletePrimaryService, seedDefaultPrimaryServices,
  getAddOnServices, saveAddOnService, deleteAddOnService, seedDefaultAddOnServices,
  getDefaultTimeEstimates, saveDefaultTimeEstimate, deleteDefaultTimeEstimate,
} from "../lib/dataStore";
import {
  uid,
  DEFAULT_PRODUCT_TYPES, DEFAULT_PRODUCT_CATEGORIES,
  DEFAULT_PRIMARY_SERVICES, DEFAULT_ADD_ON_SERVICES,
} from "../data/domain";

// ---------------------------------------------------------------------------
// FASE 1 af arkitektur-oprydningen (august 2026): al state og CRUD for
// VAREKATALOGET (varekategorier, varetyper, primære ydelser, tillægs-
// ydelser) er samlet her, udtrukket fra App.jsx - som var i ferd med at
// blive for stor til bekvemt at navigere i, med al domænelogik for hele
// appen samlet ét sted (se rapport 22. august 2026). App.jsx skal fremover
// kun KALDE denne hook og bruge dens returnerede data/funktioner - ikke
// selv holde denne state eller logik.
//
// Næste faser i samme oprydning (biler/fravær/brugere, dernæst ordrer,
// dernæst session/butik) følger samme mønster: én hook pr. domæne, med
// samme "load ved storeId-ændring + gem/slet ÉT element ad gangen"-form
// som allerede er etableret i dataStore.js.
//
// VIGTIGT om relationer: hvilke tillægsydelser der gælder for hvilke
// varetyper/primære ydelser ligger UDELUKKENDE på addOnServices selv (se
// domain.js) - derfor rydder delete-funktionerne her op i addOnServices,
// når en varetype eller primær ydelse slettes, så der ikke bliver
// hængende referencer til noget der ikke findes mere.
//
// STANDARDTIDER (september 2026): defaultTimeEstimates er en FLAD liste
// ({varetypeId, primaerYdelseId, minutter}) - en matrix, ikke en liste af
// navngivne ting som resten af kataloget, og har derfor sin egen, lidt
// simplere save/delete-form (ingen "opret nyt element med uid()", kun
// "sæt eller fjern værdien for denne kombination"). Se domain.js:
// getDefaultEstimateMinutes/createLineItem for hvordan den bruges.
export function useCatalog(storeId) {
  const [productTypes, setProductTypes] = useState([]);
  const [productCategories, setProductCategories] = useState([]);
  const [primaryServices, setPrimaryServices] = useState([]);
  const [addOnServices, setAddOnServices] = useState([]);
  const [defaultTimeEstimates, setDefaultTimeEstimates] = useState([]);

  const load = useCallback(async (id) => {
    if (!id) {
      setProductTypes([]); setProductCategories([]); setPrimaryServices([]); setAddOnServices([]); setDefaultTimeEstimates([]);
      return;
    }
    const [pt, pc, ps, aos, dte] = await Promise.all([
      getProductTypes(id), getProductCategories(id), getPrimaryServices(id), getAddOnServices(id), getDefaultTimeEstimates(id),
    ]);
    // Første gang butikken bruges, er listerne tomme - sæt fornuftige standarder.
    const finalCategories = pc.length > 0 ? pc : DEFAULT_PRODUCT_CATEGORIES;
    const finalProductTypes = pt.length > 0 ? pt : DEFAULT_PRODUCT_TYPES;
    const finalPrimaryServices = ps.length > 0 ? ps : DEFAULT_PRIMARY_SERVICES;
    const finalAddOnServices = aos.length > 0 ? aos : DEFAULT_ADD_ON_SERVICES;
    if (pc.length === 0) seedDefaultProductCategories(id, finalCategories);
    if (pt.length === 0) seedDefaultProductTypes(id, finalProductTypes);
    if (ps.length === 0) seedDefaultPrimaryServices(id, finalPrimaryServices);
    if (aos.length === 0) seedDefaultAddOnServices(id, finalAddOnServices);
    setProductCategories(finalCategories); setProductTypes(finalProductTypes);
    setPrimaryServices(finalPrimaryServices); setAddOnServices(finalAddOnServices);
    setDefaultTimeEstimates(dte); // ingen standardværdier at seede - "ikke sat" er en gyldig, forventet starttilstand
  }, []);

  useEffect(() => { load(storeId); }, [storeId, load]);

  const saveOneProductCategory = (k) => { setProductCategories((prev) => (prev.some((x) => x.id === k.id) ? prev.map((x) => (x.id === k.id ? k : x)) : [...prev, k])); if (storeId) saveProductCategory(storeId, k); };
  const removeOneProductCategory = (id) => { setProductCategories((prev) => prev.filter((x) => x.id !== id)); if (storeId) deleteProductCategory(storeId, id); };

  const saveOneProductType = (v) => { setProductTypes((prev) => (prev.some((x) => x.id === v.id) ? prev.map((x) => (x.id === v.id ? v : x)) : [...prev, v])); if (storeId) saveProductType(storeId, v); };
  const removeOneProductType = (id) => { setProductTypes((prev) => prev.filter((x) => x.id !== id)); if (storeId) deleteProductType(storeId, id); };

  const saveOnePrimaryService = (p) => { setPrimaryServices((prev) => (prev.some((x) => x.id === p.id) ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, p])); if (storeId) savePrimaryService(storeId, p); };
  const removeOnePrimaryService = (id) => { setPrimaryServices((prev) => prev.filter((x) => x.id !== id)); if (storeId) deletePrimaryService(storeId, id); };

  const saveOneAddOnService = (t) => { setAddOnServices((prev) => (prev.some((x) => x.id === t.id) ? prev.map((x) => (x.id === t.id ? t : x)) : [...prev, t])); if (storeId) saveAddOnService(storeId, t); };
  const removeOneAddOnService = (id) => { setAddOnServices((prev) => prev.filter((x) => x.id !== id)); if (storeId) deleteAddOnService(storeId, id); };

  const addProductCategory = (navn) => saveOneProductCategory({ id: uid(), navn });
  const updateProductCategory = (id, navn) => { const k = productCategories.find((x) => x.id === id); if (k) saveOneProductCategory({ ...k, navn }); };
  const deleteProductCategoryFn = (id) => {
    const inUse = productTypes.filter((v) => v.kategoriId === id).length;
    if (inUse > 0 && !window.confirm(`${inUse} varetype(r) hører til denne kategori. Slet alligevel? (Varetyperne beholdes, men mister kategori-tilknytningen.)`)) return;
    removeOneProductCategory(id);
  };

  const addProductType = (navn, kategoriId) => saveOneProductType({ id: uid(), navn, kategoriId: kategoriId || null });
  const updateProductType = (id, fields) => { const v = productTypes.find((x) => x.id === id); if (v) saveOneProductType({ ...v, ...fields }); };
  const deleteProductTypeFn = (id) => {
    if (!window.confirm("Slet denne varetype? Allerede bookede sager beholder deres oplysninger uændret.")) return;
    removeOneProductType(id);
    addOnServices.filter((t) => (t.varetyper || []).includes(id)).forEach((t) => saveOneAddOnService({ ...t, varetyper: t.varetyper.filter((vid) => vid !== id) }));
    // Standardtider for denne varetype giver ikke længere mening - ryd dem
    // med, så matrixen ikke bliver stående med rækker for noget, der ikke
    // findes mere.
    defaultTimeEstimates.filter((e) => e.varetypeId === id).forEach((e) => removeOneDefaultTimeEstimate(e.varetypeId, e.primaerYdelseId));
  };

  const addPrimaryService = (navn) => saveOnePrimaryService({ id: uid(), navn });
  const updatePrimaryService = (id, fields) => { const p = primaryServices.find((x) => x.id === id); if (p) saveOnePrimaryService({ ...p, ...fields }); };
  const deletePrimaryServiceFn = (id) => {
    if (!window.confirm("Slet denne primære ydelse? Allerede bookede sager beholder deres oplysninger uændret.")) return;
    removeOnePrimaryService(id);
    addOnServices.filter((t) => (t.primaerYdelser || []).includes(id)).forEach((t) => saveOneAddOnService({ ...t, primaerYdelser: t.primaerYdelser.filter((pid) => pid !== id) }));
    defaultTimeEstimates.filter((e) => e.primaerYdelseId === id).forEach((e) => removeOneDefaultTimeEstimate(e.varetypeId, e.primaerYdelseId));
  };

  const addAddOnService = (navn) => saveOneAddOnService({ id: uid(), navn, primaerYdelser: [], varetyper: [] });
  const updateAddOnService = (id, fields) => { const t = addOnServices.find((x) => x.id === id); if (t) saveOneAddOnService({ ...t, ...fields }); };
  const deleteAddOnServiceFn = (id) => {
    if (!window.confirm("Slet denne tillægsydelse? Allerede bookede sager beholder deres oplysninger uændret.")) return;
    removeOneAddOnService(id);
  };

  // Standardtider (varetype × primær ydelse). minutter === null/undefined
  // FJERNER estimatet igen (tomt felt i UI'et) fremfor at gemme det som 0 -
  // "ikke sat" og "sat til 0 minutter" er to forskellige, gyldige
  // tilstande (se domain.js: getDefaultEstimateMinutes).
  const removeOneDefaultTimeEstimate = (varetypeId, primaerYdelseId) => {
    setDefaultTimeEstimates((prev) => prev.filter((e) => !(e.varetypeId === varetypeId && e.primaerYdelseId === primaerYdelseId)));
    if (storeId) deleteDefaultTimeEstimate(storeId, varetypeId, primaerYdelseId);
  };
  const setDefaultTimeEstimateFn = (varetypeId, primaerYdelseId, minutter) => {
    if (minutter === null || minutter === undefined || minutter === "") {
      removeOneDefaultTimeEstimate(varetypeId, primaerYdelseId);
      return;
    }
    const val = Math.max(0, Number(minutter) || 0);
    setDefaultTimeEstimates((prev) => {
      const exists = prev.some((e) => e.varetypeId === varetypeId && e.primaerYdelseId === primaerYdelseId);
      return exists
        ? prev.map((e) => (e.varetypeId === varetypeId && e.primaerYdelseId === primaerYdelseId ? { ...e, minutter: val } : e))
        : [...prev, { varetypeId, primaerYdelseId, minutter: val }];
    });
    if (storeId) saveDefaultTimeEstimate(storeId, varetypeId, primaerYdelseId, val);
  };

  return {
    productTypes, productCategories, primaryServices, addOnServices, defaultTimeEstimates,
    addProductCategory, updateProductCategory, deleteProductCategory: deleteProductCategoryFn,
    addProductType, updateProductType, deleteProductType: deleteProductTypeFn,
    addPrimaryService, updatePrimaryService, deletePrimaryService: deletePrimaryServiceFn,
    addAddOnService, updateAddOnService, deleteAddOnService: deleteAddOnServiceFn,
    setDefaultTimeEstimate: setDefaultTimeEstimateFn,
    reload: () => load(storeId),
  };
}
