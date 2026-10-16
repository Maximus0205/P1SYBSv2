// Lader Node køre testene på kildefilerne, selvom disse importerer uden filendelse ("../data/domain"). Det er
// det, Vite (og dermed selve appen) tillader, men Node ikke gør. Registreres af tests/koer-alle.mjs.
import { register } from "node:module";

register("data:text/javascript," + encodeURIComponent(`
  export async function resolve(specifier, context, nextResolve) {
    try { return await nextResolve(specifier, context); }
    catch (e) {
      if (e.code === "ERR_MODULE_NOT_FOUND" && /^\\.{1,2}\\//.test(specifier) && !/\\.[a-z]+$/i.test(specifier)) {
        for (const endelse of [".js", ".jsx"]) { try { return await nextResolve(specifier + endelse, context); } catch {} }
      }
      throw e;
    }
  }
`));
