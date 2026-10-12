# Post-review: walidacja odpowiedzi mirror node w `coin-hedera`

Zakres: commit `ad5cf289f87` „fix(coin-hedera): align types with swagger” względem `develop`.
Dokument zastępuje `hedera-mirror-review.md` z 2026-10-05. Bierze z niego wnioski, które są dalej aktualne, i dodaje analizę skutków.
Źródła: kod gałęzi, kod `develop`, OpenAPI mirror node'a pobrane z mainnetu 2026-10-12.
Data: 2026-10-12. Tezy zweryfikował niezależny agent. Dokument zawiera jego korekty.

## Werdykt

Nie mergować w obecnej formie. Nie mergować też w formie z pierwszego review bez zmian.

Zmiana dotyczy ścieżki, z której korzysta każdy użytkownik Hedera: sync konta, historia operacji, dodanie konta, staking. Obecny kod dodaje nowe sposoby awarii w miejscach, które na `develop` działają. Część z tych awarii jest trwała i nie znika po ponownej próbie. Część zależy od danych innych użytkowników.

Cel zmiany jest dobry. Na `develop` część null daje dziś `TypeError` albo ciche złe dane (saldo `NaN`). Problem jest w zakresie i w sposobie wdrożenia, nie w celu.

## Zasady ostrożności

Każda zmiana w tej gałęzi musi spełniać te zasady. Lista zmian na końcu wynika z nich.

1. **Brak nowych awarii.** Przypadek, który na `develop` daje poprawny wynik, po zmianie też daje poprawny wynik. Nowy błąd jest dozwolony tylko tam, gdzie `develop` już dziś daje błąd albo złe dane.
2. **Błąd dotyczy elementu, nie odpowiedzi.** Zły transfer, token, konto albo node jest pomijany. Nie zatrzymuje całej listy.
3. **Cudze dane nie mogą zatrzymać naszego konta.** Walidacja nie może rzucać na transakcjach, które nie należą do konta użytkownika.
4. **Kształt danych bez zmian.** Walidacja sprawdza obiekt i zwraca ten sam obiekt. Nie przebudowuje go, nie usuwa pól, nie zamienia `null` na `""` ani na brak pola.
5. **Brak danych nigdy nie jest cichy.** Brak tablicy albo `links` nie może dać pustej listy ani uciętej paginacji.
6. **Najpierw obserwacja, potem błąd.** Pierwsze wydanie tylko loguje naruszenia. Twardy błąd wchodzi po danych z produkcji albo z dużej próbki.
7. **Dowód różnicowy przed merge.** Wynik `develop` i wynik gałęzi dla tych samych realnych kont muszą być identyczne, poza różnicami opisanymi w changesecie.

## Skutki, których nie ma w pierwszym review

### S1. Cudze transakcje zatrzymują sync konta (krytyczne)

`findTransactionByContractCallV2` (`network/api.ts:289`) pobiera do 100 transakcji **całej sieci** z okna czasu wokół transferu ERC20. Zapytanie nie ma filtra `account.id`. Każda z tych transakcji przechodzi przez `parseMirrorTransaction`.

Skutek: jedna zła transakcja innego użytkownika w tym oknie zatrzymuje sync każdego konta, które ma w historii transfer ERC20 z tego okna. Na `develop` funkcja czyta z tych transakcji tylko `name`, `transaction_id` i `parent_consensus_timestamp`. Pozostałe pola nie mają wpływu. Wyjątek: `transaction_id: null` w cudzej transakcji CONTRACTCALL daje `TypeError` także na `develop` (`null.startsWith`).

`getBlock.v2` (`logic/getBlock.v2.ts:177`) pobiera wszystkie transakcje bloku, też bez filtra konta. Ten sam problem dotyczy API `getBlock`.

### S2. Błąd na historii jest trwały (krytyczne)

`getAccountTransactions` z `fetchAllPages` parsuje całą historię konta przy każdym syncu od zera. Sync od zera ma miejsce przy pierwszym dodaniu konta i po każdej zmianie `syncHash` (`bridge/synchronisation.ts:60`).

Jedna zła transakcja z przeszłości daje błąd przy każdej próbie. Ponowna próba nie pomaga. Konto zostaje zablokowane do poprawki danych w mirror node albo do nowego wydania aplikacji.

### S3. Ucięta paginacja bez błędu (wysokie)

`network/api.ts:159`, `:202`, `:398` używają `res.data.links?.next ?? null`. Gdy w odpowiedzi brak `links`, pętla kończy się bez błędu i historia jest ucięta.

Na `develop` ten sam przypadek daje `TypeError`, czyli głośny błąd. Ucięta historia jest gorsza od błędu. Sync przyrostowy startuje od najnowszej operacji (`bridge/synchronisation.ts:66`), więc brakujące operacje nie wracają do zmiany `syncHash`.

`network/api.ts:459` (`getNodes`) nadal używa `res.data.links.next`, czyli ma inne zachowanie niż reszta.

### S4. Brak tablicy `tokens` usuwa tokeny HTS (wysokie)

`res.data.tokens ?? []` (`network/api.ts:201`) daje pustą listę tokenów. `getSubAccounts` (`bridge/utils.ts:211-213`) nie znajduje salda i pomija subkonto. Skutek zależy od rodzaju synca (`bridge/synchronisation.ts:125-127`):
- sync od zera: subkonta HTS znikają z konta;
- sync przyrostowy: `mergeSubAccounts` (`bridge/utils.ts:418-420`) zachowuje stare subkonta. Zostają ze starym saldem i bez nowych operacji HTS.

Na `develop` ten sam przypadek daje `TypeError` i konto zostaje bez zmian.

### S5. Dodanie konta: jedno konto blokuje wszystkie (wysokie)

`getAccountsForPublicKey` (`network/api.ts:64`) parsuje wszystkie konta dla klucza publicznego. `buildIterateResult` (`bridge/synchronisation.ts:150`) woła tę funkcję dla każdego indeksu. Błąd w jednym koncie daje błąd na każdym indeksie i zatrzymuje skan. Użytkownik nie może dodać żadnego konta Hedera dla tego klucza.

Na `develop` konto z `account: null` kończy skan na tym koncie. Kolejne konta nie są znalezione, ale wcześniejsze tak.

### S6. Błąd na polach, których logika nie czyta (wysokie)

Parser rzuca na polach, których żaden kod nie czyta. Koszt jest pełny, zysk zerowy.

- token: `decimals`, `automatic_association`, `freeze_status`;
- wynik kontraktu: `contract_id`, `block_hash`, `block_gas_used`. Ten przypadek zatrzymuje sync każdego konta z historią ERC20;
- konto: `evm_address`. Czyta go tylko `toEVMAddress` (`network/utils.ts:363`), który łapie błąd i zwraca `null` (`:376-378`). Ale trzech wywołujących `toEVMAddress` rzuca `invariant` przy `null`: `bridge/synchronisation.ts:37`, `api/index.ts:137`, `logic/craftTransaction.ts:134`. Na `develop` `evm_address: null` już dziś zatrzymuje sync i craft ERC20. `estimateFees.ts:30-31` też woła `toEVMAddress`, ale przy `null` zwraca opłatę bez gazu. Gałąź rozszerza awarię na każde `getAccount`: sync (`getAccountShape`), `getAccountInfo`, saldo, staking, `validateIntent`, `checkAccountTokenAssociationStatus`, `analyzeStakingOperation`.

Swagger oznacza wszystkie te pola jako nullable.

### S7. Legalny brak pola daje błąd (średnie)

- `pending_reward` jest w swaggerze optional. Brak tego pola jest zgodny z kontraktem API. Parser rzuca. Na `develop` sync pokazuje nagrodę `NaN`, a `getBalance`, `getStakes` i `validateIntent` rzucają `TypeError`. `getAccountInfo.ts:24` przepuszcza `undefined` cicho, mimo typu `number`. Właściwa wartość zastępcza: `0`.
- `max_automatic_token_associations` jest w swaggerze nullable. Parser rzuca. Pierwsze review pominęło to pole. Kod, który go używa: `bridge/synchronisation.ts:143` i `:144` (`=== -1`), `logic/getAccountInfo.ts:21`, `network/utils.ts:287`. Na `develop` null daje `isAutoTokenAssociationEnabled: false`, co jest akceptowalne.

### S8. Niespójne pola gazu (niskie)

`listOperations.v2` pomija `gasConsumed` i `gasUsed`, gdy są `null`. `getBlock.v2.ts:311-313` przekazuje `null`. Typ `HederaOperationExtra` (`types/bridge.ts:171-173`) to `number | undefined`.

### S9. Słabe dowody z sieci (średnie)

Twierdzenie „sieci publiczne nie zwracają tych null” opiera się na małej próbce z 2026-10-05:

- node'y: 25 mainnet, 7 testnet, 7 previewnet;
- 100 najnowszych kont i 100 najnowszych transakcji, tylko mainnet;
- 25 wyników kontraktów, tylko mainnet;
- tokeny: **0 rekordów**. Konto `0.0.800` nie ma tokenów, więc pól tokena nie sprawdzono wcale.

Solo nie było sprawdzone. Twierdzenie o null w polach stake na Solo to założenie, nie pomiar.

### S10. Komunikat błędu dla użytkownika (średnie)

`HederaMirrorNodeResponseError` nie ma tłumaczenia w `apps/ledger-live-desktop/static/i18n/en/app.json` ani w `apps/ledger-live-mobile/src/locales/en/common.json`. Użytkownik dostanie ogólny komunikat.

Komunikat błędu zawiera ID transakcji z ID konta płatnika (`transaction[0.0.x@...]`, `mirror.parse.ts:57`), ID konta użytkownika (`account[0.0.x]`, `mirror.parse.ts:85`) i ID tokena (`mirror.parse.ts:110`). Trzeba sprawdzić, czy ten tekst może trafić do Datadog (logi, RUM) albo do analityki. Do tego jest skill `detect-data-leaks`.

### S11. Pola transakcji są w swaggerze optional (średnie)

Swagger oznacza wszystkie pola `Transaction` jako optional. Parser wymaga `transaction_hash`, `consensus_timestamp`, `charged_tx_fee`, `nonce`, `result` i `name` (`mirror.parse.ts:62-67`). Zasada „twardy błąd tylko dla pól wymaganych i nie nullable” nie obejmuje więc żadnego pola transakcji.

Decyzja: transakcja konta użytkownika bez któregoś z tych pól jest odrzucana i logowana. Nie daje błędu synca. Bez tych pól nie da się zbudować poprawnej operacji. Dla cudzych transakcji (S1) walidacja dotyczy tylko pól, które czyta wywołujący.

Typ `HederaMirrorTransaction` zostaje strict. Pola optional ze swaggera nie wchodzą do typu. To samo dotyczy `HederaMirrorBlock` i `HederaMirrorNetworkFees`. Granica w `api.ts` gwarantuje te pola, logika nie obsługuje ich braku. Liczby za tą decyzją są w sekcji „Zakres zmian typów”.

Skutek odrzucenia zależy od miejsca transakcji w historii:
- najnowsza transakcja: kursor synca przyrostowego bierze datę z ostatniej zapisanej operacji, więc kolejny sync pobierze tę transakcję jeszcze raz;
- starsza transakcja przy syncu od zera: operacja nie wraca do następnego synca od zera.

Log jest jedynym śladem odrzucenia (zasada 5).

### S12. Historyczny stan konta (średnie)

`analyzeStakingOperation` (`network/utils.ts:452`) woła `getAccount` dwa razy (`:460-470`) na każdą operację CRYPTOUPDATEACCOUNT, z filtrem `timestamp=lt:` i `timestamp=eq:`. Historyczny stan konta może mieć inne null niż bieżący, np. `evm_address` albo `balance.timestamp`. Na gałęzi każde takie null zatrzymuje sync konta ze stakingiem.

### S13. Brak tablicy: trzy różne zachowania w jednym pliku (niskie)

`network/api.ts` obsługuje brak tablicy na trzy sposoby:
- `?? []`: `transactions`, `tokens`;
- `?.[0]` i własny `Error`: `getLatestTransaction` (`:226-230`), `getLatestBlock` (`:250-254`);
- `TypeError`: `accounts` (`:64`), `nodes` w `getNode` (`:421`) i `getNodes` (`:458`).

## Zachowanie po zwróceniu null

Kolumny:
- **develop**: dzisiejsze zachowanie;
- **gałąź**: obecny kod;
- **docelowo**: zachowanie po zmianach z tego dokumentu.

„Błąd synca” oznacza, że konto pokazuje ikonę błędu, a saldo i historia zostają z ostatniego udanego synca.
„Błąd pobrania walidatorów” oznacza, że `getHederaValidators` odrzuca. `validateIntent` i `getTransactionStatus` dostają `Error`, RTK query w `ledger-live-common` zwraca `error`, API `getValidators` odrzuca.

| Pole | develop | gałąź | docelowo |
|---|---|---|---|
| `transfers[].account` | `TypeError` w `AccountId.fromString`, błąd synca | błąd synca | transfer pominięty, log |
| `staking_reward_transfers[].account` | nagroda niedopasowana, cicho | błąd synca | transfer pominięty, log |
| `token_transfers[].account` | `TypeError`, błąd synca | błąd synca | transfer pominięty, log |
| `token_transfers[].token_id` | operacja z ID `…:null` | błąd synca | transfer pominięty, log |
| dowolne pole w cudzej transakcji (S1) | bez wpływu, poza `transaction_id: null` w CONTRACTCALL (`TypeError`) | **błąd synca konta z ERC20** | bez wpływu |
| brak `transactions` | `TypeError`, błąd synca | pusta strona | błąd, jak na `develop` |
| brak `links` | `TypeError`, błąd synca | **ucięta historia, cicho** | błąd, jak na `develop` |
| wynik kontraktu: `contract_id`, `block_hash`, `block_gas_used` | bez wpływu | **błąd synca konta z ERC20** | bez wpływu |
| `gas_consumed`, `gas_used` | `null` w `extra` | pole pominięte | pole pominięte w obu miejscach |
| konto `account` przy dodawaniu | skan kończy się na tym koncie | **żadne konto do dodania** | konto pominięte, log |
| konto `account` w `getAccount(address)` | `null` w danych | błąd synca | adres z zapytania |
| `evm_address` | błąd synca i `listOperations` API (`invariant`), craft ERC20 pada, `estimateFees` bez gazu | **błąd synca, salda, stakingu** | bez wpływu |
| `max_automatic_token_associations` | auto-association wyłączone | błąd synca | jak na `develop` |
| `balance` | `TypeError`, błąd synca | błąd synca | błąd synca |
| `balance.balance` | **saldo `NaN` w UI** | błąd synca | błąd synca |
| `balance.timestamp` | zapytanie `timestamp=gt:null` → HTTP 400 → błąd synca konta z operacją stakingu | błąd synca | obsługa lokalna w `network/utils.ts:502` przed `calculateUncommittedBalanceChange` |
| `balance.tokens[].token_id` | token traktowany jako niepowiązany w `checkAccountTokenAssociationStatus` (`network/utils.ts:291`) | błąd przy każdym `getAccount` | wpis pominięty, log |
| brak `pending_reward` | **nagroda `NaN` w UI**, `TypeError` w API | błąd synca | `0` |
| token `token_id` (w swaggerze nie nullable) | `TypeError` w `bridge/utils.ts:241` (`null.toLowerCase()`), błąd synca; API `getBalance`: `assetReference: null` | błąd synca | token pominięty, log |
| token `created_timestamp` | `creationDate` = Invalid Date | błąd synca | fallback daty |
| token `decimals`, `automatic_association`, `freeze_status` | bez wpływu | **błąd synca** | bez wpływu |
| brak `tokens` | `TypeError`, błąd synca | **sync od zera: tokeny HTS znikają; przyrostowy: stare saldo** | błąd, jak na `develop` |
| node `min_stake`, `max_stake`, `stake_rewarded` | walidator z `NaN`; `TypeError` w API `getBalance`/`getStakes` tylko dla `max_stake`, gdy `stake` jest liczbą | **błąd pobrania walidatorów** | walidator bez tych danych, `overstaked: null` |
| node `reward_rate_start` | APY `0` | błąd pobrania walidatorów | APY `0` |
| node `node_account_id` | walidator z `address: null` | błąd pobrania walidatorów | node pominięty na liście |
| node `description` | `TypeError`, lista pada | `""` | `""` |

## Zakres zmian typów

Pomiar: typy `HederaMirror*` podmienione na typy `Raw*` z `types/mirror.raw.ts`, `tsc --noEmit --customConditions node` na gałęzi, liczone błędy TS w kodzie produkcyjnym. Testy i `mirror.parse.ts` pominięte. Bez podmiany: 0 błędów. Wynik jest ten sam dla TypeScript 7.0.2 i 6.0.3.

Wariant A: wszystkie pola zgodnie ze swaggerem, także optional pola transakcji, bloku i opłat.

| Plik | Błędów |
|---|---|
| `logic/listOperations.v2.ts` | 22 |
| `logic/utils.ts` | 15 |
| `network/utils.ts` | 12 |
| `logic/getBlock.v2.ts` | 12 |
| `logic/getBalance.ts` | 11 |
| `logic/getStakes.ts` | 5 |
| `logic/getAccountInfo.ts` | 4 |
| `bridge/utils.ts` | 4 |
| `bridge/synchronisation.ts` | 4 |
| `logic/getValidators.ts` | 3 |
| `logic/getRewards.ts` | 3 |
| `network/api.ts`, `logic/validateIntent.ts`, `logic/lastBlock.v2.ts`, `logic/estimateFees.ts` | po 1 |
| **Razem** | **99 błędów w 15 plikach (87 różnych linii)** |

Wariant B: `HederaMirrorTransaction`, `HederaMirrorBlock` i `HederaMirrorNetworkFees` strict. Nullable tylko konto, token, node, wynik kontraktu i transfery.

| Plik | Błędów |
|---|---|
| `logic/getBalance.ts` | 11 |
| `network/utils.ts` | 8 |
| `logic/utils.ts` | 7 |
| `logic/listOperations.v2.ts` | 6 |
| `logic/getStakes.ts` | 5 |
| `logic/getBlock.v2.ts` | 4 |
| `logic/getAccountInfo.ts` | 4 |
| `bridge/utils.ts` | 4 |
| `bridge/synchronisation.ts` | 4 |
| `logic/getValidators.ts` | 3 |
| `logic/validateIntent.ts` | 1 |
| **Razem** | **57 błędów w 11 plikach (48 różnych linii)** |

Decyzja: wariant B.

- Pola transakcji, bloku i opłat odpowiadają za 42 z 99 błędów, głównie w `listOperations.v2` i `getBlock.v2`. Żadne z nich nie ma wartości zastępczej. Bez `consensus_timestamp`, `transaction_hash` albo `name` operacja nie powstaje. Obsługa `undefined` w logice to 42 sztuczne gałęzie bez nowego zachowania.
- Konto, token i node mają wartości zastępcze: `pending_reward` → `0`, `max_automatic_token_associations: null` → auto-association wyłączone, node bez danych stake → walidator bez tych danych. Te decyzje należą do logiki, więc tu typ nullable jest uzasadniony.
- Swagger oznacza wszystkie pola `Transaction` jako optional, ale próbka z S9 nie pokazała żadnego braku. Granica w `api.ts` traktuje to jak gwarancję kontraktu.
- Każdy z 57 błędów to ręczna decyzja „co przy null”. W etapie 1 każda musi dać wynik z `develop`. Dowód różnicowy (zasada 7) obejmuje te miejsca, nie tylko parser.

Warunek: w etapie 1 brak pola transakcji jest tylko logowany, a obiekt idzie dalej bez zmian, jak na `develop`. Pomijanie transakcji wchodzi w etapie 2 razem z testem z bramek. To jedyny punkt, gdzie wariant B łamie zasadę 5, i dlatego jest osobną zmianą zachowania.

## Co zostaje z pierwszego review

Zgoda:
- typy `Raw*` są zgodne ze swaggerem;
- `transaction_type` jako `string`, `stake` jako wymagane i nullable;
- podział pól na core i nie core jako metoda;
- changeset `minor` z poprawną nazwą pliku;
- konstruktor `HederaMirrorNodeResponseError` bez `fields`;
- uruchomienie `coin-tester-hedera` na Solo przed merge.

Zmiany względem pierwszego review:
- **Pola core:** element pominięty zamiast błędu. Twardy błąd tylko dla `balance` i `balance.balance` oraz dla pól, które swagger oznacza jako wymagane i nie nullable. Transakcja bez pól kluczowych jest odrzucana i logowana (S11).
- **Zakres typów:** wariant B z sekcji „Zakres zmian typów”. Typ transakcji, bloku i opłat zostaje strict. 57 błędów TS do obsługi `null` zamiast 99.
- **Punkt 8** (`?? []`): decyzja to błąd, jak na `develop`. To samo dotyczy `links`.
- **Kierunek inline w `api.ts`:** tak, ale funkcje `assertCore*` tylko sprawdzają i filtrują. Nie przebudowują obiektów (zasada 4).
- **Transakcje bez filtra konta** (`findTransactionByContractCallV2`, `getTransactionsByTimestampRange` bez `address`): walidacja tylko na polach, które dana funkcja czyta.
- **`pending_reward`:** nie core, wartość zastępcza `0`.
- **`max_automatic_token_associations`:** nullable, zachowanie jak na `develop`.

## Plan wdrożenia

Każdy etap to osobny PR. Każdy PR da się cofnąć bez cofania pozostałych.

### Etap 0: dane przed kodem

1. Sprawdzić pola tokena na kontach, które mają tokeny HTS.
2. Sprawdzić stare konta: niskie numery, konta bez aliasu.
3. Powtórzyć próbkę kont i transakcji na testnecie i previewnecie.
4. Przejrzeć co najmniej 10 000 transakcji z mainnetu pod kątem null w polach z tabeli.
5. Sprawdzić historyczny stan kont ze stakingiem: `/accounts/{id}?timestamp=lt:…` (S12).
6. Uruchomić Solo i sprawdzić `/network/nodes`, `/accounts`, `/contracts/results`.
7. Zapisać wyniki obok tego dokumentu.

### Etap 1: typy i obserwacja, bez zmiany zachowania

1. Typy `HederaMirror*` według wariantu B: konto, token, node, wynik kontraktu i transfery nullable zgodnie ze swaggerem. Transakcja, blok i opłaty strict.
2. Funkcje `assertCore*` tylko logują naruszenie i zwracają obiekt bez zmian. Dotyczy też brakujących pól transakcji.
3. Cofnąć `links?.next ?? null` i `tokens ?? []` z gałęzi. Brak `links` albo tablicy daje błąd, jak na `develop`. Bez tego etap 1 wypuszcza uciętą historię (S3) i znikające subkonta (S4).
4. W 48 liniach (57 błędów TS), gdzie TypeScript wymaga obsługi `null`, kod zachowuje wynik z `develop`. Lista plików w sekcji „Zakres zmian typów”.
5. Dowód różnicowy (zasada 7) musi dać zero różnic.

### Etap 2: naprawy tam, gdzie `develop` daje złe dane

Każda poprawka to osobny commit z testem:

1. Saldo `NaN`: błąd synca.
2. Nagroda `NaN`: `0`.
3. Invalid Date w `creationDate`: fallback daty.
4. Skan przy dodawaniu konta: pominąć złe konto, kontynuować skan.
5. Transfery z `account: null`: pominąć. Transakcje bez pól kluczowych (S11): odrzucić i zalogować.
6. Node'y bez danych stake: obsługa `null` w `mapMirrorNodesToValidators` i `calculateAPY`, typ `HederaValidator` bez zmian.
7. Pola gazu: jedno zachowanie w `listOperations.v2` i `getBlock.v2`.

### Etap 3: twarde błędy

Wchodzą tylko po etapie 0 i po danych z etapu 1:

1. Brak `transactions`, `tokens`, `accounts`, `nodes` albo `links`: błąd.
2. Brak `balance` albo `balance.balance`: błąd.
3. Brak pola wymaganego i nie nullable w swaggerze, na koncie użytkownika: błąd. Nie dotyczy transakcji (S11).
4. Tłumaczenie `HederaMirrorNodeResponseError` w LLD i LLM.

## Bramki przed merge

- [ ] Dowód różnicowy: `getAccountShape` i `listOperations` na `develop` i na gałęzi dla co najmniej 30 realnych kont z mainnetu. Kategorie: tylko HBAR, tokeny HTS, ERC20, staking z nagrodami, stare konta, konta z TOKENASSOCIATE. Porównanie JSON operacji, sald i subkont.
- [ ] Test: zła transakcja innego konta w oknie `findTransactionByContractCallV2` nie zatrzymuje synca.
- [ ] Test: brak `links` daje błąd, nie uciętą historię.
- [ ] Test: brak `tokens` nie usuwa subkont HTS.
- [ ] Test: jedno złe konto przy dodawaniu nie blokuje pozostałych.
- [ ] Test: transakcja bez pola kluczowego jest odrzucana, pozostałe operacje są budowane, log zawiera wpis.
- [ ] `coin-tester-hedera` na Solo przechodzi.
- [ ] Ręcznie w LLD: dodanie konta, sync konta z HTS i ERC20, ekran delegacji, wysyłka ERC20.
- [ ] `detect-data-leaks` dla komunikatów błędu i logów.
- [ ] Pliki robocze (`diff.py`, `diff.tsv`, `ts-extract.cjs`, `ts-types.json`, ten dokument, `hedera-mirror-review.md`) poza historią gałęzi.

## Lista zmian

Parser i typy:

1. Usunąć `types/mirror.raw.ts` i `network/mirror.parse.ts`. Zostawić `requiredField`.
2. Typy `HederaMirror*` według wariantu B: konto, token, node, wynik kontraktu i transfery nullable zgodnie ze swaggerem, w tym `max_automatic_token_associations` i `pending_reward`. Transakcja, blok i opłaty strict.
3. Funkcje `assertCore*` w `api.ts`: sprawdzają i filtrują elementy, nie przebudowują obiektów.
4. `findTransactionByContractCallV2` i `getTransactionsByTimestampRange` bez `address`: walidacja tylko pól czytanych przez wywołującego.
5. Brak tablicy lub `links`: błąd we wszystkich funkcjach, także w `getNodes` i `getNode`.

Logika:

6. `getAccountsForPublicKey` i `buildIterateResult`: pominąć złe konto, kontynuować skan.
7. `pending_reward`: wartość zastępcza `0` w `synchronisation.ts:113`, `getBalance.ts:64-66`, `getStakes.ts:29`, `validateIntent.ts:237`, `getAccountInfo.ts:24`.
8. `max_automatic_token_associations`: `null` daje `isAutoTokenAssociationEnabled: false`.
9. `mapMirrorNodesToValidators` (`logic/utils.ts:371-382`), `getValidators.ts:23-27` (w tym `calculateAPY`), `getBalance.ts:67`, `:72`, `getStakes.ts:44`, `:48`: obsługa `null`, typ `HederaValidator` bez zmian.
10. `bridge/utils.ts:267`: fallback daty przy `created_timestamp: null`. Sprawdzić też odczyty w `getBlock.v2.ts:233` i `listOperations.v2.ts:331`.
11. `network/utils.ts:502`: obsługa `balance.timestamp: null` przed wywołaniem `calculateUncommittedBalanceChange`, która buduje zapytanie `timestamp=gt:` (mirror node odpowiada 400 na `null`).
12. `getBlock.v2.ts:311-313`: pola gazu jak w `listOperations.v2`.

Reszta:

13. Changeset `minor`, nazwa pliku w formie przymiotnik-rzeczownik-czasownik.
14. Konstruktor `HederaMirrorNodeResponseError` bez `fields`.
15. Tłumaczenie błędu w LLD i LLM.
16. Testy z sekcji „Bramki przed merge”.
