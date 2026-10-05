# Review: fix/align-hedera-mirror-node-types-with-swagger

Gałąź: `fix/align-hedera-mirror-node-types-with-swagger`, jeden commit `ad5cf289f87` względem `develop`.
Spec: commit message, changeset i OpenAPI mirror node'a (hiero-ledger, main).
Data review: 2026-10-05.

## Weryfikacja

| Sprawdzenie | Wynik |
|---|---|
| typecheck (`coin-hedera`) | pass |
| lint (`coin-hedera`) | pass, brak nowych ostrzeżeń w zmienionych plikach |
| testy jednostkowe (`coin-hedera`) | 42 suite, 695 testów, pass |
| użycia usuniętych typów `*Response` w `libs/` i `apps/` | brak |
| mainnet, testnet, previewnet: null w polach oznaczonych jako wymagane | brak, poza `gas_consumed` i `gas_used` w wynikach kontraktów |

## Co robi gałąź

- `types/mirror.raw.ts`: typy surowych odpowiedzi, pola opcjonalne lub nullable zgodnie ze swaggerem.
- `network/mirror.parse.ts`: siedem funkcji `parseMirror*` przepisuje `Raw*` na `HederaMirror*`. `requiredField` rzuca `HederaMirrorNodeResponseError`, gdy pole jest null lub go brak.
- `network/api.ts`: każdy fetch przechodzi przez parser.
- `types/mirror.ts`: `transaction_type` rozszerzone do `string`, `stake` wymagane ale nullable, `gas_consumed` i `gas_used` nullable, typy `*Response` usunięte.
- `logic/listOperations.v2.ts`: `gasConsumed` i `gasUsed` pomijane w `extra`, gdy null.
- Changeset `patch`.

## Standards

Twarde:

- Changeset powinien być `minor`. Zmiana modyfikuje zachowanie w runtime. Nazwa pliku nie ma formy przymiotnik-rzeczownik-czasownik.
- Skille repo wskazują Zod przy walidacji runtime. Żaden coin-module go nie używa, więc ręczny parser zgadza się z praktyką pakietu, nie ze skillem.
- Skill coin-modules chce `*.unit.test.ts` dla testów jednostkowych. `coin-hedera` ma zero takich plików, gałąź trzyma się pakietu.

Ocena:

- Powtórzony wzorzec `(res.data.x ?? []).map(parseY)` i `links?.next ?? null` w trzech fetcherach. Trzy identyczne `.map` z indeksem w parserze transakcji.
- `HederaMirrorNodeResponseError` przyjmuje `fields` i robi `Object.assign`. Nikt tego nie używa.
- `res.data.accounts`, `res.data.nodes` w `getNodes` i `getNode` oraz `balance.tokens.map` nie mają guardów. Brak tablicy daje `TypeError`, nie `HederaMirrorNodeResponseError`.

## Spec

Typy `Raw*` zgadzają się ze swaggerem. `transaction_type` jako `string` jest poprawne (brak enum). `stake` jako wymagane nullable jest poprawne.

Parser rzuca na polach, które swagger oznacza jako nullable:

- token: `created_timestamp`, `decimals`, `automatic_association`, `freeze_status`
- node: `node_account_id`, `min_stake`, `max_stake`, `stake_rewarded`, `reward_rate_start`
- wynik kontraktu: `contract_id`, `block_hash`, `block_gas_used`
- konto: `evm_address`, `balance.balance`, `balance.timestamp`, brak `pending_reward`

Sieci publiczne nie zwracają tych nulli. Lokalne Solo może zwracać null w polach stake'u node'ów.

Luki względem changesetu:

- `?? []` na `transactions` i `tokens` daje pusty wynik przy braku tablicy, czyli cichy przypadek, który changeset obiecuje usunąć.
- `amount`, `token.balance`, `node_id`, `staked_node_id` są kopiowane bez kontroli.

## Decyzja: co jest core

Zasada: core to pole, bez którego nie da się poprawnie zbudować operacji, salda lub stanu konta. Brak lub null w polu core rzuca.

### Core (rzucać)

| Pole | Konsument |
|---|---|
| transaction: `transaction_id`, `transaction_hash`, `consensus_timestamp`, `charged_tx_fee`, `result`, `name` | `listOperations.v2`, `getBlock.v2` |
| transaction.nonce | `listOperations.v2` decyduje po `nonce === 0`, czy dodać operację FEES |
| transfers[].account, token_transfers[].token_id, token_transfers[].account | budowa operacji |
| transfers[].amount, staking_reward_transfers[].amount, token_transfers[].amount | `BigInt`/`BigNumber` w `listOperations.v2`, `getBlock.v2`, `network/utils`, `getRewards` |
| account: `account`, `balance`, `balance.balance`, `balance.timestamp` | `getBalance`, sync |
| account.pending_reward | `BigInt` w `getBalance`, `getStakes`, `validateIntent`, sync |
| balance.tokens[].token_id, balance.tokens[].balance | `getBalance` |
| token.token_id, token.balance | `getBalance`, `bridge/utils` |
| node.node_account_id | `delegate` w `getBalance`/`getStakes`, `address` w `getValidators` |
| fees[].gas, fees.timestamp | `estimateFees` |
| contractCall.result | `estimateContractCallGas` |

### Nie core (przepuścić null)

| Pole | Konsument | Zmiana poza parserem |
|---|---|---|
| account.evm_address | ścieżka ERC20 i hgraph | typ nullable, logika ERC20 pomija konto bez adresu |
| node: `min_stake`, `max_stake`, `stake_rewarded`, `reward_rate_start` | `mapMirrorNodesToValidators`, `calculateAPY` | typ `number \| null`, warunek na `max_stake` w `getBalance:72` i `getStakes:44`, null w `calculateAPY` |
| node.description | etykieta | zostaje `""` |
| token.created_timestamp | `creationDate` w `bridge/utils:267`, dopasowanie TOKENASSOCIATE | typ nullable, fallback daty |
| token: `decimals`, `automatic_association`, `freeze_status`, `kyc_status` | brak użyć | tylko typ |
| contractResult: `contract_id`, `block_hash`, `block_gas_used`, `timestamp`, `gas_limit` | tylko `extra.gasLimit` | tylko typ |
| transaction: `entity_id`, `node`, `parent_consensus_timestamp` | `node` to fallback odbiorcy, `parent_consensus_timestamp` porównywany `=== null` | `?? null` zostaje |

Uwaga: `getBalance:9` i `getBalance:20` robią `token.balance.toFixed(0)` na dwóch różnych typach. Po dodaniu kontroli na `token.balance` typ powinien być jeden.

## Kierunek: walidacja inline w `api.ts`, bez warstwy parserów

Osobna warstwa `mirror.parse.ts` plus `mirror.raw.ts` nie jest potrzebna. Parsery w większości przepisują pola jeden do jednego. Ich wartość dodana to `requiredField` i ścieżka w komunikacie błędu. To samo można mieć w `api.ts`.

Docelowy kształt:

- Jeden zestaw typów `HederaMirror*`. Pola nie core są nullable zgodnie ze swaggerem.
- `requiredField` zostaje.
- Pięć małych funkcji `assertCore*` (transakcja, konto, token, node, fees) wołanych w dziesięciu miejscach w `api.ts`, tuż po `network()`.
- `mirror.raw.ts` i `mirror.parse.ts` usunięte.
- Testy pól core z `mirror.parse.test.ts` przeniesione do `api.test.ts`.

Walidacja w `logic/` w punkcie użycia odpada: ten sam null trzeba by wycinać w czterech do pięciu miejscach na pole.

## Lista zmian

Parser i typy:

1. Usunąć `types/mirror.raw.ts` i `network/mirror.parse.ts`, zostawić `requiredField`.
2. `HederaMirrorNode`: cztery pola stake na `number | null`.
3. `HederaMirrorToken`: `created_timestamp`, `decimals`, `automatic_association`, `freeze_status` nullable.
4. `HederaMirrorContractCallResult`: `contract_id`, `block_hash`, `block_gas_used` nullable.
5. `HederaMirrorAccount.evm_address` nullable.
6. `assertCore*` w `api.ts` dla pól z tabeli core, w tym `amount`, `token.balance`, `pending_reward`, `nonce`.
7. Guardy na `res.data.accounts`, `res.data.nodes`, `balance.tokens`.
8. Decyzja o `?? []` na `transactions` i `tokens`: rzucać albo opisać wyjątek w changesecie.

Logika:

9. `getBalance:72`, `getStakes:44`: warunek na `max_stake`.
10. `mapMirrorNodesToValidators`, `calculateAPY`: obsługa null.
11. `bridge/utils:267`: fallback daty przy null `created_timestamp`.
12. Ścieżka ERC20: pomijać konto bez `evm_address`.

Reszta:

13. Changeset na `minor`, poprawna nazwa pliku.
14. Konstruktor `HederaMirrorNodeResponseError` bez `fields` i fallbacku.
15. Testy core do `api.test.ts`, testy pól nie core usunąć lub odwrócić.
16. Pliki `diff.py`, `diff.tsv`, `ts-extract.cjs`, `ts-types.json` poza commitem.

Przed merge: uruchomić `coin-tester-hedera` na Solo, żeby sprawdzić null w polach stake'u node'ów.
