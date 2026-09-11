# Aleo — Undelegate (unbond) na Ledger Live Mobile

Data: 2026-09-11
Status: zatwierdzony design, gotowy do planu implementacji

## Cel

Dodać do Ledger Live Mobile możliwość wycofania stake'u Aleo (`unbond_public`) wraz z
sekcją pozycji stakingowej na ekranie konta. Logika i wording pochodzą z Ledger Live
Desktop, gdzie flow już działa; kształt nawigacji z istniejącego mobilnego
`BondPublicFlow` i z `families/multiversx`.

## Stan wyjściowy

- `libs/coin-modules/coin-aleo` obsługuje `unbond_public` w komplecie (craft, status,
  optimistic operation, device config). **Nie wymaga zmian.**
- LLD ma `UnbondFlowModal`, `ManageModal`, sekcję `Staking/` i hook `useStakingPosition`.
- LLM ma wyłącznie `BondPublicFlow` oraz akcję `stake` z `TODO(LIVE-32811)`; żadnego UI
  pozycji stakingowej.

## Zakres

W zakresie:

1. Sekcja stakingu na koncie Aleo w LLM (`AccountBodyHeader`), read-only poza jedną akcją.
2. Bottom-sheet na wierszu pozycji z akcją „Unstake".
3. Flow Unbond: Amount → SelectDevice → ConnectDevice → Success/Error.
4. Przeniesienie `useStakingPosition` do live-common.

Poza zakresem: Claim / withdraw unbonded, zmiana walidatora, zmiany w coin-aleo,
tłumaczenia inne niż `en`, testy Detox.

## Architektura

| Warstwa | Zmiana |
|---|---|
| `live-common/families/aleo/react.ts` | `useStakingPosition` + typy `AleoStakingPosition`, `AleoNonEarningReason` przeniesione z LLD wraz z testem; `useSyncOnUnbondingComplete` i stałe `UNBONDING_SYNC_*` również |
| LLD | importuje powyższe z live-common; `Staking/useStakingPosition.ts` i `hooks/useSyncOnUnbondingComplete.ts` znikają |
| `LLM/families/aleo/Staking/` | `index.tsx`, `StakingSummary`, `StakedRow`, `Unstakings`, `StatusIcon`, `ManageDrawer` — prezentacja karmiona `AleoStakingPosition` |
| `LLM/families/aleo/AccountBodyHeader.tsx` | re-export sekcji; `src/generated/AccountBodyHeader.ts` odbudowany przez `scripts/sync-families-dispatch.mjs` (postinstall), nigdy edytowany ręcznie |
| `LLM/families/aleo/hooks/useAleoLiveBlockHeight.ts` | bliźniak wersji z LLD, oparty na `AppState` zamiast `document.hidden` |
| `LLM/families/aleo/UnbondFlow/` | navigator + ekrany + `types.ts` |
| `const/navigation.ts`, `RootNavigator/types/BaseNavigator.ts` | `NavigatorName.AleoUnbondFlow`, 5 × `ScreenName.AleoUnbond*`, `UnbondFlowParamList` |
| `locales/en/common.json` | `aleo.unbond.*`, `aleo.stake.*` |

Granica: ekrany LLM nie czytają `account.aleoResources` — wyłącznie `useStakingPosition`.
Zmiana reguł unbondingu to wtedy jeden plik w live-common, wspólny dla obu aplikacji.

## Wejście w flow

Sekcja renderuje kartę pozycji, wiersz walidatora i listę unbondingów. Tap w wiersz
otwiera bottom-sheet z akcją „Unstake" (miejsce na „Claim" w kolejnej iteracji).
Gating identyczny jak w `ManageModal` LLD:

- „Unstake" aktywne gdy `hasBonded && !hasPendingUnbondingChange`
- przy `hasPendingUnbond` / `hasPendingClaim` akcja zablokowana z komunikatem o
  oczekującej operacji

Pusty stan (brak stake'u) pokazuje CTA prowadzące do istniejącego `BondPublicFlow`.

## Flow Unbond

Ekrany w `NavigatorName.AleoUnbondFlow`:

1. `AleoUnbondAmount` — `AmountInput` + przełącznik „use max"; bez wyboru walidatora,
   bo unbond dotyczy jedynej pozycji. Dwa bannery:
   - maksymalna kwota do wycofania = `bondedBalance`
   - jeśli po operacji zostałoby mniej niż `MIN_DELEGATOR_STAKE_MICROCREDITS`
     (10 000 ALEO), łańcuch wycofuje całość — komunikat informacyjny, nie błąd
2. `AleoUnbondSelectDevice` → 3. `AleoUnbondConnectDevice` (`~/screens/SelectDevice`,
   `~/screens/ConnectDevice`, jak w `BondPublicFlow`)
4. `AleoUnbondValidationSuccess` z `beforeRemove: notifyFlowCompleted("stake")` /
   `AleoUnbondValidationError`

Transakcja: `mode: "unbond_public"`, `recipient = mainAccount.freshAddress` (staker,
i tak przypinany przez `prepareTransaction`), `amount` albo `useAllAmount`.

## Walidacja

Cała w `getTransactionStatus` coin-module; ekran renderuje `status.errors`.

| Sytuacja | Efekt |
|---|---|
| `amount = 0`, albo `useAllAmount` przy zerowym bonded | `AmountRequired` |
| `amount > bondedBalance` | `NotEnoughBalance` |
| brak transparent balance na fee | błąd z `validatePublicFees`; fee nie pochodzi z bonded |
| pozostałoby < 10 000 ALEO | brak błędu, banner informacyjny |

Po broadcaście `hasPendingOperationType(account, "UNBOND")` daje `true`, co blokuje
kolejny unbond i przełącza sekcję w stan oczekiwania.

## Odliczanie unbondingu

`Unstakings` pokazuje kwotę, status i liczbę pozostałych bloków z
`unbondingHeight - liveHeight`. Gdy łańcuch minie `unbondingHeight`, a
`account.blockHeight` jeszcze nie, `useSyncOnUnbondingComplete` zamawia sync konta —
wszystkie decyzje o wypłacalności czytają wysokość zsynchronizowaną, nie live.

## Analytics

`TrackScreen category="UnbondFlow" flow="unbond" currency="aleo"` na każdym ekranie,
`track("staking_completed", { flow: "unbond", currency: "aleo" })` po sukcesie —
symetrycznie do `BondPublicFlow`.

## Testy

- `UnbondFlow/__integrations__/unbondFlow.integration.test.tsx` — pełne przejście
  amount → device → success, wzorowane na `bondFlow.integration.test.tsx`
- unity `Staking/*` — gating akcji przy: braku stake'u, oczekującym unbondzie,
  unbondingu gotowym do odebrania
- test `useStakingPosition` wędruje do live-common razem z hookiem
- asercje na konkretny kształt, bez `toBeDefined` / `toBeTruthy`
