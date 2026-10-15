import { useState } from "react";
import { ThemeService, type Theme } from "@/services/theme.service";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => ThemeService.get());

  const toggleTheme = () => {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    ThemeService.set(nextTheme);
    setTheme(nextTheme);
  };

  return { theme, toggleTheme };
}
