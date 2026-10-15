/**
 * Persists the light/dark preference in localStorage and applies it to the page
 * by setting `data-ft-theme` on <html>. The palettes live in styles/theme.scss.
 *
 * With no stored preference, the OS-level `prefers-color-scheme` is used.
 */

const KEY_THEME = "ft_theme";

export type Theme = "light" | "dark";

export const ThemeService = {
  get(): Theme {
    const storedTheme = window.localStorage.getItem(KEY_THEME);
    if (storedTheme === "light" || storedTheme === "dark") return storedTheme;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  },

  set(theme: Theme): void {
    window.localStorage.setItem(KEY_THEME, theme);
    ThemeService.apply(theme);
  },

  apply(theme: Theme): void {
    document.documentElement.setAttribute("data-ft-theme", theme);
  },
};
