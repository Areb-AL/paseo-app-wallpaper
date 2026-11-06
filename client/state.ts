/** Lien entre l'écran de réglages et le fond posé au démarrage du plugin. */
let refresher: () => void = () => {};
let lastError: string | null = null;

export const setRefresher = (fn: () => void) => {
  refresher = fn;
};
export const refreshBackground = () => refresher();

/** Dernière erreur de chargement de l'image (chemin faux, format…), affichée dans les réglages. */
export const setLastError = (message: string | null) => {
  lastError = message;
};
export const getLastError = () => lastError;

/** Langue de l'appli Paseo, lue au démarrage du plugin (« en » si inconnue). */
let appLocale = "en";
export const setAppLocale = (locale: string) => {
  appLocale = locale || "en";
};
export const getAppLocale = () => appLocale;
