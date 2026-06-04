/**
 * i18n — sistema di traduzione client-side per MonteCalcio.
 *
 * Design:
 *  - Dizionari per lingua (it/en/es/fr), chiavi a notazione puntata, valori
 *    stringa o array di stringhe. L'italiano è la fonte di verità.
 *  - `t(key, vars?)` risolve la chiave nella lingua attiva con fallback su EN
 *    e poi IT, e interpola i segnaposto `{nome}`.
 *  - `tList(key)` restituisce un array di stringhe (per liste/hint).
 *  - Numeri formattati con la locale giusta tramite `nf()`.
 *  - La lingua è persistita in localStorage; al primo avvio si rileva quella
 *    del browser (se tra quelle supportate, altrimenti EN — pubblico globale).
 *
 * Il motore (`src/engine`) resta puro: nessuna dipendenza da qui.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { it } from './it';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';

export type LangCode = 'it' | 'en' | 'es' | 'fr';

export interface LangMeta {
  code: LangCode;
  /** Codice flag-icons (rende bene su Windows, non emoji). */
  flag: string;
  label: string;
}

export const LANGUAGES: LangMeta[] = [
  { code: 'it', flag: 'it', label: 'Italiano' },
  { code: 'en', flag: 'gb', label: 'English' },
  // { code: 'es', flag: 'es', label: 'Español' },   // TODO: traduzione da completare
  // { code: 'fr', flag: 'fr', label: 'Français' },  // TODO: traduzione da completare
];

/** Locale BCP-47 per la formattazione dei numeri, per lingua. */
const NUMBER_LOCALE: Record<LangCode, string> = {
  it: 'it-IT',
  en: 'en-US',
  es: 'es-ES',
  fr: 'fr-FR',
};

type Dict = Record<string, string | string[]>;

const DICTS: Record<LangCode, Dict> = { it, en, es, fr };

const STORAGE_KEY = 'mc_lang';

/** Rileva la lingua iniziale: localStorage → lingua browser → 'en'. */
export function detectInitialLang(): LangCode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as LangCode | null;
    if (saved && DICTS[saved]) return saved;
  } catch { /* localStorage non disponibile */ }
  const nav = (typeof navigator !== 'undefined' && (navigator.languages?.[0] || navigator.language)) || 'en';
  const short = nav.slice(0, 2).toLowerCase() as LangCode;
  return DICTS[short] ? short : 'en';
}

/** Interpola `{nome}` con i valori passati. */
function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** Risolve una chiave con fallback lingua → EN → IT → chiave stessa. */
function resolve(lang: LangCode, key: string): string | string[] | undefined {
  return DICTS[lang][key] ?? DICTS.en[key] ?? DICTS.it[key];
}

export interface I18n {
  lang: LangCode;
  setLang: (l: LangCode) => void;
  /** Traduce una chiave (stringa) con interpolazione opzionale. */
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Traduce una chiave-array (lista di stringhe). */
  tList: (key: string, vars?: Record<string, string | number>) => string[];
  /** Formatta un numero secondo la locale attiva. */
  nf: (n: number) => string;
  /** Locale BCP-47 attiva (per localeCompare, toLocaleString, ecc.). */
  locale: string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LangCode>(detectInitialLang);

  const setLang = (l: LangCode) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignora */ }
  };

  // Aggiorna l'attributo lang del documento (accessibilità / hyphenation).
  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<I18n>(() => {
    const locale = NUMBER_LOCALE[lang];
    const t = (key: string, vars?: Record<string, string | number>): string => {
      const raw = resolve(lang, key);
      if (raw === undefined) {
        if (import.meta.env?.DEV) console.warn(`[i18n] chiave mancante: ${key}`);
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
  if (!ctx) throw new Error('useI18n deve stare dentro <I18nProvider>');
  return ctx;
}

/** Shortcut comodo: restituisce direttamente la funzione t (+ nf via closure). */
export function useT() {
  return useI18n();
}

/** Restituisce il nome localizzato di una squadra in base alla lingua attiva. */
export function useTeamName() {
  const { lang } = useI18n();
  return (team: { name: string; nameEn?: string; nameEs?: string; nameFr?: string }) => {
    if (lang === 'en') return team.nameEn ?? team.name;
    if (lang === 'es') return team.nameEs ?? team.nameEn ?? team.name;
    if (lang === 'fr') return team.nameFr ?? team.nameEn ?? team.name;
    return team.name;
  };
}
