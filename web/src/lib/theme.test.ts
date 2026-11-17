import { describe, expect, it } from "vitest";
import { THEME_INIT_SCRIPT, THEME_KEY, applyTheme, parseTheme, readTheme } from "./theme";

const memory = (start: Record<string, string> = {}) => {
  const data = { ...start };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
  };
};
const root = () => {
  const attrs: Record<string, string> = {};
  return {
    attrs,
    setAttribute: (k: string, v: string) => void (attrs[k] = v),
    removeAttribute: (k: string) => void delete attrs[k],
  } as unknown as HTMLElement & { attrs: Record<string, string> };
};

describe("the theme", () => {
  it("is light unless the person chose dark", () => {
    expect(parseTheme(null)).toBe("light");
    expect(parseTheme("blue")).toBe("light");
    expect(readTheme(memory({ [THEME_KEY]: "dark" }))).toBe("dark");
    expect(readTheme(null)).toBe("light");
  });

  it("is one attribute on the page, and is remembered", () => {
    const store = memory();
    const el = root();
    applyTheme("dark", store, el);
    expect(el.attrs["data-theme"]).toBe("dark");
    expect(store.data[THEME_KEY]).toBe("dark");
    applyTheme("light", store, el);
    expect(el.attrs["data-theme"]).toBeUndefined();
    expect(store.data[THEME_KEY]).toBe("light");
  });

  it("still changes the page when storage refuses", () => {
    const el = root();
    const refusing = {
      getItem: () => null,
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => applyTheme("dark", refusing, el)).not.toThrow();
    expect(el.attrs["data-theme"]).toBe("dark");
  });

  it("the head script reads the same key and never throws", () => {
    expect(THEME_INIT_SCRIPT).toContain(JSON.stringify(THEME_KEY));
    expect(THEME_INIT_SCRIPT.startsWith("try{")).toBe(true);
  });
});
