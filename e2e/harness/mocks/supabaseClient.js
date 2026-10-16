// Simuleret Supabase-klient til browsertests: ingen netværk, intet login. Alle kald giver tomme svar.
const kaede = () => new Proxy(function () {}, { get: (_, k) => (k === "then" ? undefined : kaede()), apply: () => kaede() });
export const supabase = {
  functions: { invoke: async () => ({ data: null, error: null }) },
  rpc: async () => ({ data: null, error: null }),
  from: () => kaede(),
  channel: () => kaede(),
  auth: { getSession: async () => ({ data: {} }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
};
export default supabase;
