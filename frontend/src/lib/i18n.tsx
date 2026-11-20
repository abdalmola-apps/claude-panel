import { useStore } from "./store";

export type Lang = "en" | "ar";

/**
 * Inline translator. Usage:  const t = useT();  …  {t("Settings", "الإعدادات")}
 *
 * Translations live next to their call site (easy to review, no key registry).
 * Falls back to English when the language is English or no Arabic is supplied.
 * Arabic strings are clear Modern Standard Arabic (فصحى). Technical identifiers
 * — settings keys, env-var names, model IDs, code in <code> — stay untranslated.
 */
export function useT() {
  const { lang } = useStore();
  return (en: string, ar?: string) => (lang === "ar" && ar !== undefined ? ar : en);
}
