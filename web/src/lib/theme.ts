/**
 * Light or dark. The person chooses (the switch at the foot of the sidebar)
 * and this browser remembers. It does not follow the system setting: nobody
 * should land in a theme they did not pick.
 *
 * The theme is one attribute on <html>, data-theme="dark". The colours are in
 * src/styles/tokens.css, section 6.
 */
export type Theme = "light" | "dark";
export const THEME_KEY = "wt-theme";

type Store = Pick<Storage, "getItem" | "setItem"> | null;

export function parseTheme(value: unknown): Theme {
  return value === "dark" ? "dark" : "light";
}

export function readTheme(store: Store): Theme {
  try {
    return parseTheme(store?.getItem(THEME_KEY));
  } catch {
    return "light";
  }
}

/** Put the theme on the page and remember it. Storage may refuse; the page
 *  still changes. */
export function applyTheme(theme: Theme, store: Store, root: HTMLElement) {
  if (theme === "dark") root.setAttribute("data-theme", "dark");
  else root.removeAttribute("data-theme");
  try {
    store?.setItem(THEME_KEY, theme);
  } catch {
    // Private window or storage blocked: the choice lasts for this page.
  }
}

/**
 * Runs in <head> before the first paint, so a dark-theme reader never sees a
 * white flash. Plain text on purpose: it must run before any bundle loads.
 */
export const THEME_INIT_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(
  THEME_KEY,
)})==="dark")document.documentElement.setAttribute("data-theme","dark")}catch(e){}`;
