/**
 * LexiQuest i18n dictionary + pure translator.
 *
 * `strings[lang][key]` is the template. Placeholders use `{name}` syntax
 * and are replaced by values from the `params` object. Unknown keys
 * return the raw key (so developer sees it in the UI). A key missing
 * in a non-EN language falls back to the EN template.
 */

export const strings = {
  en: {
    "picker.title": "Who are you?",
    "picker.loading": "Loading…",
    "picker.error": "Could not load users",
    "login.title": "Enter your password",
    "login.password": "Password",
    "login.submit": "Sign in",
    "login.submitting": "Signing in…",
    "login.invalid": "invalid credentials",
    "home.greeting": "Hello, {name}",
    "home.logout": "Log out",
    "home.notSignedIn": "Not signed in — go to the picker",
    "home.loading": "Loading…",
    "common.loading": "Loading…",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.delete": "Delete",
    "common.edit": "Edit",
    "common.back": "Back",
    "common.yes": "Yes",
    "common.no": "No",
    "settings.title": "Settings",
    "settings.language": "Language",
    "settings.language.en": "English",
    "settings.language.nl": "Dutch",
    "errors.generic": "Something went wrong",
    "errors.network": "Network error",
    "errors.unauthorized": "Session expired",
  },
  nl: {
    "picker.title": "Wie ben jij?",
    "picker.loading": "Laden…",
    "picker.error": "Kon gebruikers niet laden",
    "login.title": "Voer je wachtwoord in",
    "login.password": "Wachtwoord",
    "login.submit": "Aanmelden",
    "login.submitting": "Bezig met aanmelden…",
    "login.invalid": "ongeldige inloggegevens",
    "home.greeting": "Hallo, {name}",
    "home.logout": "Uitloggen",
    "home.notSignedIn": "Niet aangemeld — ga naar de kiezer",
    "home.loading": "Laden…",
    "common.loading": "Laden…",
    "common.save": "Opslaan",
    "common.cancel": "Annuleren",
    "common.delete": "Verwijderen",
    "common.edit": "Bewerken",
    "common.back": "Terug",
    "common.yes": "Ja",
    "common.no": "Nee",
    "settings.title": "Instellingen",
    "settings.language": "Taal",
    "settings.language.en": "Engels",
    "settings.language.nl": "Nederlands",
    "errors.generic": "Er ging iets mis",
    "errors.network": "Netwerkfout",
    "errors.unauthorized": "Sessie verlopen",
  },
};

const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * @param {"en"|"nl"} lang
 * @param {string} key
 * @param {Record<string, string | number>} [params]
 * @returns {string}
 */
export function translate(lang, key, params) {
  const dict = strings[lang] ?? strings.en;
  const template =
    dict[key] ?? strings.en[key] ?? null;
  if (template === null) return key;
  if (!params) return template;
  return template.replace(PLACEHOLDER, (match, name) =>
    Object.prototype.hasOwnProperty.call(params, name)
      ? String(params[name])
      : match,
  );
}
