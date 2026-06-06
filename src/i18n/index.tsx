/**
 * i18n — client-side translation system for MonteCalcio.
 *
 * Design:
 *  - Per-language dictionaries (it/en/es/fr), dot-notation keys, string or
 *    string-array values. Italian is the source of truth.
 *  - `t(key, vars?)` resolves the key in the active language, falling back to
 *    EN then IT, and interpolates `{name}` placeholders.
 *  - `tList(key)` returns a string array (for lists/hints).
 *  - Numbers formatted with the right locale via `nf()`.
 *  - Language is persisted in localStorage; on first load the browser language
 *    is detected (if supported, else EN — global audience).
 *
 * Note: only IT and EN are exposed in the switcher (LANGUAGES); ES/FR
 * dictionaries exist but are not yet enabled.
 *
 * The engine (`src/engine`) stays pure: no dependency on this module.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { it } from './it';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';

export type LangCode = 'it' | 'en' | 'es' | 'fr';

export interface LangMeta {
  code: LangCode;
  /** flag-icons code (renders well on Windows, unlike emoji). */
  flag: string;
  label: string;
}

export const LANGUAGES: LangMeta[] = [
  { code: 'it', flag: 'it', label: 'Italiano' },
  { code: 'en', flag: 'gb', label: 'English' },
  // { code: 'es', flag: 'es', label: 'Español' },   // TODO: finish translation
  // { code: 'fr', flag: 'fr', label: 'Français' },  // TODO: finish translation
];

/** BCP-47 locale for number formatting, per language. */
const NUMBER_LOCALE: Record<LangCode, string> = {
  it: 'it-IT',
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
};

type Dict = Record<string, string | string[]>;

const DICTS: Record<LangCode, Dict> = { it, en, es, fr };

const STORAGE_KEY = 'mc_lang';

/** Detect the initial language: localStorage → browser language → 'en'. */
export function detectInitialLang(): LangCode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as LangCode | null;
    if (saved && DICTS[saved]) return saved;
  } catch { /* localStorage unavailable */ }
  const nav = (typeof navigator !== 'undefined' && (navigator.languages?.[0] || navigator.language)) || 'en';
  const short = nav.slice(0, 2).toLowerCase() as LangCode;
  return DICTS[short] ? short : 'en';
}

/** Interpolate `{name}` placeholders with the given values. */
function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** Resolve a key with fallback: language → EN → IT → the key itself. */
function resolve(lang: LangCode, key: string): string | string[] | undefined {
  return DICTS[lang][key] ?? DICTS.en[key] ?? DICTS.it[key];
}

export interface I18n {
  lang: LangCode;
  setLang: (l: LangCode) => void;
  /** Translate a (string) key with optional interpolation. */
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Translate an array key (list of strings). */
  tList: (key: string, vars?: Record<string, string | number>) => string[];
  /** Format a number per the active locale. */
  nf: (n: number) => string;
  /** Active BCP-47 locale (for localeCompare, toLocaleString, etc.). */
  locale: string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(detectInitialLang);

  const setLang = (l: LangCode) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  };

  // Update the document's lang attribute (accessibility / hyphenation).
  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<I18n>(() => {
    const locale = NUMBER_LOCALE[lang];
    const t = (key: string, vars?: Record<string, string | number>): string => {
      const raw = resolve(lang, key);
      if (raw === undefined) {
        if (import.meta.env?.DEV) console.warn(`[i18n] missing key: ${key}`);
        return key;
      }
      const str = Array.isArray(raw) ? raw.join(' ') : raw;
      return interpolate(str, vars);
    };
    const tList = (key: string, vars?: Record<string, string | number>): string[] => {
      const raw = resolve(lang, key);
      if (raw === undefined) return [];
      const arr = Array.isArray(raw) ? raw : [raw];
      return arr.map((s) => interpolate(s, vars));
    };
    const nf = (n: number) => n.toLocaleString(locale);
    return { lang, setLang, t, tList, nf, locale };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

/** Convenience shortcut: returns the i18n object directly (t, nf, etc.). */
export function useT() {
  return useI18n();
}

/** Returns a team's localized name based on the active language. */
export function useTeamName() {
  const { lang } = useI18n();
  return (team: { name: string; nameEn?: string; nameEs?: string; nameFr?: string }) => {
    if (lang === 'en') return team.nameEn ?? team.name;
    if (lang === 'es') return team.nameEs ?? team.nameEn ?? team.name;
    if (lang === 'fr') return team.nameFr ?? team.nameEn ?? team.name;
    return team.name;
  };
}
