# Piano di traduzione — MonteCalcio

## Stato: INGLESE ✅ COMPLETATO

Lingua originale: **Italiano**. Tutte le chiavi i18n esistono in `src/i18n/it.ts` (fonte di verità) e `src/i18n/en.ts`.

Il sistema i18n usa `useT()` / `t(key, vars?)` con fallback IT→EN automatico.

---

## Componenti tradotti in inglese

| File | Stato | Note |
|------|-------|-------|
| `src/i18n/en.ts` | ✅ Completo | Dizionario inglese completo, stile idiomatico |
| `src/ui/components/TournamentCinema.tsx` | ✅ Fix sessione 1 | Hardcoded IT rimossi: TIMELINE, ROUND_LABEL, title/sub dinamici, controlli, ChampionScene, ThirdsModal, GroupsScene |
| `src/ui/components/AdminPage.tsx` | ✅ Fix sessione 1 | Intero componente riscritto con `useT` — SimpleLever, SimpleWhatIf, dialogs, tutte le sezioni avanzate |
| `src/ui/components/MatchupPage.tsx` | ✅ Fix sessione 1 | Aggiunti `useT` — context buttons, WDL labels, KO row, tab bar, parametri, H2H, arrow titles |
| `src/ui/components/TeamsPage.tsx` | ✅ Fix sessione 2 | Fix crash (eloTier non definita + getSortValue argomenti mancanti) + traduzione completa: TeamList, TeamDetail (strength banner, tab bar, tutte le stat, H2H section) |
| `src/ui/components/HomeCards.tsx` | ✅ Già OK | Usava `t()` |
| `src/ui/components/Onboarding.tsx` | ✅ Già OK | Usava `t()` |
| `src/ui/components/PreSim.tsx` | ✅ Già OK | Usava `t()` |
| `src/ui/components/SimLaunchOverlay.tsx` | ✅ Già OK | Usava `t()` |
| `src/ui/components/SimLoadingOverlay.tsx` | ✅ Già OK | Usava `t()` |
| `src/ui/components/RevealCards.tsx` | ✅ Già OK | Usava `t()` |
| `src/ui/components/RunDetail.tsx` | ✅ Già OK | Usava `t()` |
| `src/ui/components/Standings.tsx` | ✅ Già OK | Usava `t()` |
| `src/ui/components/PhaseTable.tsx` | ✅ Già OK | Usava `t()` |
| `src/ui/components/ItalyCard.tsx` | ✅ Già OK | Usava `t()` |
| `src/ui/components/HowItWorks.tsx` | ✅ Già OK | Usava `t()` |
| `src/ui/components/TabIntro.tsx` | ✅ Già OK | Usava `t()` |
| `src/ui/components/StrengthPie.tsx` | ✅ Già OK | Usava `t()` |
| `src/ui/App.tsx` | ✅ Già OK | Usava `t()` |

### Componenti non usati (non tradotti, irrilevanti)
- `Bracket.tsx` — non importato da nessuna parte
- `WhatIfPanel.tsx` — non importato da nessuna parte
- `ShareCard.tsx` — non importato da nessuna parte

---

## Prossimi passi: SPAGNOLO e FRANCESE

Quando riprendi da qui, il lavoro per es/fr è **solo nel dizionario**:
- `src/i18n/es.ts` — tradurre tutte le chiavi da `en.ts` in spagnolo
- `src/i18n/fr.ts` — tradurre tutte le chiavi da `en.ts` in francese

I componenti sono già tutti collegati a `t()` — non serve toccarli.

### Come verificare le chiavi mancanti in es/fr

```bash
# Conta chiavi in ogni dizionario
grep -c "^  '" src/i18n/it.ts
grep -c "^  '" src/i18n/en.ts
grep -c "^  '" src/i18n/es.ts
grep -c "^  '" src/i18n/fr.ts
```

Il numero di chiavi in es/fr deve corrispondere a quello di en/it.
Usa `en.ts` come riferimento per le chiavi mancanti — è il dizionario più aggiornato.
