import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { getStoreFeatures } from "../lib/storeFeatures";
import { featureStandard } from "../data/storeFeatures";

// Hvilke funktioner er slået fra for den viste butik. Alt er TIL, indtil andet er hentet
// (og hvis opslaget fejler): en hentefejl må ikke fjerne funktioner for en butik. Det
// reelle forsvar er databasens trigger, ikke det her.
const FeaturesContext = createContext({ features: {}, reload: () => {} });

export function StoreFeaturesProvider({ storeId, children }) {
  const [features, setFeatures] = useState({});
  const reqRef = useRef(0);
  const reload = useCallback(async () => {
    const id = ++reqRef.current;
    const res = await getStoreFeatures(storeId);
    if (id === reqRef.current && res.ok) setFeatures(res.features);
  }, [storeId]);
  useEffect(() => { setFeatures({}); reload(); }, [reload]);
  const value = useMemo(() => ({ features, reload }), [features, reload]);
  return <FeaturesContext.Provider value={value}>{children}</FeaturesContext.Provider>;
}

export const useFeature = (noegle) => {
  const v = useContext(FeaturesContext).features[noegle];
  return typeof v === "boolean" ? v : featureStandard(noegle);
};
export const useReloadFeatures = () => useContext(FeaturesContext).reload;
