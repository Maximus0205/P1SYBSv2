// Lager-abstraktion: bruger window.storage når appen kører i Claude-forhåndsvisningen,
// og falder tilbage til browserens localStorage når appen kører som selvstændigt build.
//
// VIGTIGT: localStorage er kun lokalt i den enkelte browser/enhed - det er fint til at
// teste layout og arbejdsgange, men til rigtig fælles butiksdrift (flere brugere/enheder
// der skal se de samme sager) skal dette lag på et tidspunkt udskiftes med kald til en
// rigtig backend/database. Resten af appen kender ikke forskel - den kalder blot
// storage.get/set/delete, så udskiftningen sker ét sted.

const hasClaudeStorage = () =>
  typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";

const nsKey = (key, shared) => `kaedeplan:${shared ? "shared" : "local"}:${key}`;

export const storage = {
  async get(key, shared = true) {
    if (hasClaudeStorage()) {
      try {
        return await window.storage.get(key, shared);
      } catch (e) {
        return null;
      }
    }
    try {
      const raw = window.localStorage.getItem(nsKey(key, shared));
      return raw ? { key, value: raw, shared } : null;
    } catch (e) {
      return null;
    }
  },

  async set(key, value, shared = true) {
    if (hasClaudeStorage()) {
      try {
        return await window.storage.set(key, value, shared);
      } catch (e) {
        return null;
      }
    }
    try {
      window.localStorage.setItem(nsKey(key, shared), value);
      return { key, value, shared };
    } catch (e) {
      return null;
    }
  },

  async delete(key, shared = true) {
    if (hasClaudeStorage()) {
      try {
        return await window.storage.delete(key, shared);
      } catch (e) {
        return null;
      }
    }
    try {
      window.localStorage.removeItem(nsKey(key, shared));
      return { key, deleted: true, shared };
    } catch (e) {
      return null;
    }
  },
};
