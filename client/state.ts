/** Lien entre l'écran de réglages et le fond posé au démarrage du plugin. */
let refresher: () => void = () => {};

export const setRefresher = (fn: () => void) => {
  refresher = fn;
};
export const refreshBackground = () => refresher();
