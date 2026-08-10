// Shared logic for username-based login, used by LoginSide.jsx,
// AdminParts.jsx (NyBrugerForm) and SystemAdminSide.jsx.
//
// Supabase Auth internally always requires an email-formatted identity - for
// username login we therefore use a synthetic email of the form
// "username@brugere.kaedeplan.local", which is never meant to receive real
// mail, it's just a technical key for the Auth system. The domain MUST match
// the one used in the Edge Functions (admin-opret-bruger, systemadmin-opret-butik).
export const USERNAME_DOMAIN = "brugere.kaedeplan.local";

export const emailFromUsername = (username) => `${(username || "").trim().toLowerCase()}@${USERNAME_DOMAIN}`;

export const isValidUsername = (username) => /^[a-z0-9.\-]{2,40}$/.test((username || "").trim().toLowerCase());

// Suggests a username from a full name, e.g. "Jens Hansen" -> "jens.hansen".
// Strips Danish special characters so it's always valid for the login format.
export const suggestUsername = (name) => {
  return (name || "")
    .trim()
    .toLowerCase()
    .replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa")
    .replace(/[^a-z0-9\s.\-]/g, "")
    .trim()
    .replace(/\s+/g, ".")
    .slice(0, 40);
};

// Used on the login page: is what was typed an email (contains @, and is
// NOT our own synthetic username email), or a username?
export const isEmailFormat = (text) => (text || "").includes("@") && !text.trim().toLowerCase().endsWith(`@${USERNAME_DOMAIN}`);

// Converts whatever the user typed in the login field into the email
// Supabase Auth actually needs to sign in with.
export const identifierToEmail = (text) => (isEmailFormat(text) ? text.trim() : emailFromUsername(text));
