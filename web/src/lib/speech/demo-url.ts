/**
 * Demo on the Speech pages. The pages read `?demo=<session id>` once when
 * they load and send it with every clip, judgment and verdict; the server
 * then stores the row as demo and no count, export or training read sees it.
 * These two helpers keep the id on the address as a researcher moves between
 * the Speech tabs.
 */

/** The demo session id on an address's query string, or null. */
export function demoFromSearch(search: string): string | null {
  const id = new URLSearchParams(search).get("demo");
  return id && id.trim() ? id : null;
}

/** `href` with the demo session id added (or left alone when there is none). */
export function withDemo(href: string, demo: string | null): string {
  if (!demo) return href;
  const [path, hash = ""] = href.split("#");
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}demo=${encodeURIComponent(demo)}${hash ? `#${hash}` : ""}`;
}
