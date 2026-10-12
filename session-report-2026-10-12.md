# Raport z sesji 2026-10-12

Raport ma trzy części:

1. Walidacja odpowiedzi mirror node w `coin-hedera`.
2. Analiza błędu `UnknownDeviceExchangeError` w swapie ALEO → SOL.
3. Połączenie Ledger Live Mobile (Android) ze Speculosem.

## 1. Walidacja odpowiedzi mirror node w `coin-hedera`

### Zakres

Źródło wymagań: `hedera-mirror-post-review.md`.
Gałąź: `wip/mirro-node-swagger`.
Wykonane etapy: 0, 1 i 2. Etap 3 czeka na dane z produkcji. Tak mówi dokument źródłowy.

Każde zadanie zrobił osobny subagent. Każde zadanie sprawdził niezależny reviewer. Na końcu reviewer sprawdził całą gałąź.

### Stan

| Sprawdzenie | Wynik |
|---|---|
| `pnpm jest` w `coin-hedera` | 41 zestawów, 737 testów, wszystkie przechodzą |
| `tsc --noEmit --customConditions node` w `coin-hedera` | 0 błędów |
| `tsc` w `ledger-live-common` | 0 błędów (według raportu subagenta) |
| `pnpm lint` | 0 błędów, tylko istniejące ostrzeżenia |
| `pnpm format:check` | czysto |

Commity są tylko lokalne. Nic nie poszło do `origin`.

### Commity

| Commit | Zmiana |
|---|---|
| `2ffa0b23950` | Typy według swaggera (wariant B). `assertCore*` tylko logują. Brak tablicy albo `links` daje błąd. |
| `0466c3b976a` | Cudze transakcje: walidacja tylko pól, które czyta kod. |
| `24620ecc3cf` | Null w `balance` daje błąd synca. Brak `pending_reward` daje `0`. |
| `1048314ee6b` | Log dla `balance.timestamp: null`. Leniwe liczenie nagrody w `getBalance`. |
| `e1fa67e6149` | Pomijanie tokenów bez `token_id`. Bieżąca data przy null w `created_timestamp`. |
| `09d5fc7bbfe` | Formatowanie. |
| `0fd07cc59b2` | Przy dodawaniu konta kod pomija konta bez `account`. Skan idzie dalej. |
| `96f91adab46` | Pomijanie transferów bez `account`. Odrzucanie niekompletnych własnych transakcji. |
| `7291d00cde9` | Te same zasady dla elementów ERC20, nagród i niezatwierdzonego salda. |
| `0ef6ef4437c` | Obsługa null w polach node'ów. |
| `d3625d50969` | Null w polach gazu jest pomijany. |
| `ac48e2862c1` | Changeset opisuje wszystkie zmiany zachowania. |
| `6b6bf54c2c3` | Cudza transakcja bez `transaction_id` nie zatrzymuje synca. Brak tablicy w `getLatest*` daje `HederaMirrorNodeResponseError`. |
| `adb95e6ff91` | Treść logów i nazwy testów. |

### Wyniki etapu 0

Dane są w `hedera-mirror-stage0-data.md`. Subagent wysłał około 2 600 zapytań do mainnetu, testnetu i previewnetu.

- Żadne pole z listy w dokumencie źródłowym nie miało brakującego klucza.
- Każda strona listy miała `links` i swoją tablicę.
- `max_automatic_token_associations` ma null na 14 z 119 kont w zakresie 0.0.1–999.
- `gas_used` i `gas_consumed` mają null w 250 z 600 wyników kontraktów.
- `parent_consensus_timestamp` ma null w większości transakcji głównych. To normalne zachowanie API.
- Inne pola z listy nigdy nie miały null.

Kod obsługuje oba przypadki z null i ma dla nich testy.

### Decyzje podjęte bez użytkownika

| Decyzja | Koszt pomyłki |
|---|---|
| Tylko etapy 1 i 2. Etap 3 czeka na dane z produkcji. | Jeszcze jedna runda później. |
| Wszystkie etapy na jednej gałęzi, nie jako osobne PR. | Ręczny podział po zakresach commitów. |
| Logi i błędy zawierają tylko ścieżkę pola. Nie zawierają ID kont, transakcji ani tokenów. | Mniej danych do debugowania. |
| Null w `balance.timestamp` daje zmianę salda `0` i wpis w logu. | Zaniżona kwota stake przy złych danych. |
| Kopia odrzuconego elementu ERC20 może zostać jako zwykła operacja contract-call. | W skrajnym przypadku jedna operacja wygląda jak duplikat. |
| Node bez danych stake dostaje `0` i `overstaked: false`. Typ `HederaValidator` nie przyjmuje `null`. | UI pokazuje 0 jako limity dla nieznanych danych. Ta decyzja wymaga potwierdzenia. |
| `getBlock` z niekompletną cudzą transakcją dalej zatrzymuje cały blok, tak jak na `develop`. | Jedna zła transakcja psuje `getBlock`. |
| Etap 0 nie sprawdzał Solo. | Null na Solo jest dalej założeniem. |

### Otwarte bramki

Te sprawdzenia nie były uruchomione:

- dowód różnicowy na 30 kontach z mainnetu,
- `coin-tester-hedera` na Solo,
- test ręczny w LLD,
- `detect-data-leaks`,
- `api.integ.test.ts`.

### Decyzje dla użytkownika

1. Commit `d0cc50bf6c9` zawiera `hedera-mirror-review.md`. Gałąź jest już na `origin`. Usunięcie tego pliku z historii wymaga force pusha.
2. Pliki robocze są poza commitami: `hedera-mirror-post-review.md`, `hedera-mirror-stage0-data.md`, `.superpowers/sdd/` i ten raport. Trzeba zdecydować, czy je usunąć.

## 2. Błąd `UnknownDeviceExchangeError` w swapie ALEO → SOL

### Objaw

Dashboard Datadog „[BD] Aleo swaps” pokazuje 5 zdarzeń `/swap/cancelled` z 2026-10-06 i 2026-10-07. Wskaźnik sukcesu wynosi 0.17: 1 swap przyjęty, 5 anulowanych. Każde zdarzenie ma `errorMessage: "UnknownDeviceExchangeError"`.

### Dane z payloadu `/swap/cancelled`

| Pole | Wartość | Znaczenie |
|---|---|---|
| `http.client.type` | `llm-ios` | Ledger Live Mobile na iOS, nie LLD. |
| `http.client.version` | `4.23.0` | Wersja LLM. |
| `hardwareWalletType` | `europa` | Flex. Na iOS transport to BLE. |
| `exchangeAppVersion` | `4.4.4` | Wersja aplikacji Exchange. |
| `signingAppName` / `signingAppVersion` | `Aleo` / `1.4.0` | Wersja aplikacji Aleo. |
| `provider` / `swapType` | `NearIntents` / `float` | Provider i typ swapa. |
| `fromAmount` | `83589.434624` | Ta sama kwota we wszystkich 5 zdarzeniach. |
| `swapStep` | `INIT` | Wartość zastępcza. Nie oznacza kroku INIT. |
| `statusCode` | `Error` | Nazwa zwykłego obiektu `Error`. |
| `maybeSeedMatch` | `false` | Fałszywy trop. |

### Analiza kodu

1. `executeSwap.ts` (`onCancel`) ustawia `"INIT"` dla każdego błędu, który nie jest `CompleteExchangeError`. Błędy z kroków Exchange dostają swój krok przez `convertTransportError`.
2. `DmkSignerAleo._mapError` (`libs/live-signer-aleo/src/DmkSignerAleo.ts`) tworzy `new Error(tag)`. Wynik to `statusCode: "Error"` i `errorMessage: "UnknownDeviceExchangeError"`. To pasuje dokładnie do payloadu.
3. Surowy błąd DMK z transportu BLE (`DeviceManagementKitBLETransport.exchange`) dałby inny komunikat: „Unexpected device exchange error happened.”.
4. Wniosek: błąd pochodzi z podpisu Aleo, nie z kroków Exchange. Możliwe miejsca to `getTvk`, `signFeeIntent`, `signRootIntent` i `signNestedCall` w `coin-aleo/src/bridge/signOperation.ts`.
5. `maybeSeedMatch` to `seedIdFrom === seedIdTo` (`postSwapState.ts`). Dla ALEO → SOL ta wartość zawsze wynosi `false`.

### Gdzie DMK tworzy ten błąd

DMK 1.10.0 tworzy `UnknownDeviceExchangeError` w dwóch miejscach:

1. `GlobalCommandErrorHandler.handle()`. Kod trafia tu, gdy SW nie ma w `ALEO_APP_ERRORS` ani na liście globalnej DMK. SW jest w `originalError.errorCode`.
2. `DeviceConnectionStateMachine`. Kod trafia tu, gdy transport odrzuci `sendApdu`.

`_getGenericErrorMessage` dopisuje treść tylko wtedy, gdy `originalError` jest obiektem `Error`. Payload zawiera sam tag. Najbardziej prawdopodobny jest więc przypadek 1: urządzenie zwróciło nieznany SW, a log ten SW zgubił. Przypadek 2 jest możliwy tylko wtedy, gdy transport odrzucił wartość, która nie jest `Error`.

### Ocena prób odtworzenia

Kolega sprawdził swap na 4 sposoby. Żadna próba nie dała błędu.

| Próba | Ocena |
|---|---|
| LLD + Nano S Plus z naszym seedem | Inna platforma i inny transport. |
| Nagranie APDU z LLD i odtworzenie na Speculosie (Flex) | Podejrzane. Urządzenie generuje nowy nonce w START_NEW_TRANSACTION. Podpisany payload partnera powinien wtedy odpaść. Replay sprawdza tylko stronę urządzenia. |
| LLD z `SPECULOS_API_PORT` + Flex na Speculosie | Zmienna jest poprawna (`transportHandler.ts`, `live-common-setup.ts`). Inna platforma i inny transport. |
| Agent E2E na LLD, różne kwoty | Inna platforma. Inne kwoty i inny stan konta. |

Wszystkie próby były na LLD i na naszym seedzie. Błąd wystąpił na LLM iOS przez BLE, przy jednej kwocie, na koncie użytkownika. Ścieżka Aleo zależy od stanu konta: saldo publiczne albo prywatne, wybór rekordów, rekordy na opłatę.

### Hipoteza

Hipoteza nie jest potwierdzona. Podpis Aleo wysyła kilka komend po kolei. W swapie aplikacja Aleo działa jako biblioteka aplikacji Exchange. Duża kwota może wymagać więcej wywołań `getTvk` albo `signNestedCall`. Jedna z tych komend może dostać SW spoza obu list.

### Następne kroki

1. Odtwórz swap na LLM iOS 4.23.0 z Flexem przez BLE.
2. Użyj aplikacji Exchange 4.4.4, aplikacji Aleo 1.4.0 i providera NearIntents.
3. Użyj kwoty bliskiej całemu saldu, najlepiej z konta z rekordami prywatnymi.
4. Sprawdź w explorerze Aleo saldo publiczne adresu z payloadu.
5. W `DmkSignerAleo._getGenericErrorMessage` dopisz `originalError.errorCode`. Datadog pokaże wtedy SW.

## 3. Ledger Live Mobile (Android) i Speculos

### Dostępne transporty

Plik `apps/ledger-live-mobile/src/services/registerTransports.ts` definiuje dwie drogi:

1. Build z `DETOX` ma transport `speculos|<url>`. Urządzenie podaje mostek Detox. Ten build służy do testów E2E, nie do ręcznej pracy.
2. Build debug (`__DEV__`) ma transport HTTP proxy. URL ustawia się w Settings → Debug → Connectivity → HTTP transport.

Transport HTTP proxy wysyła `POST {apduHex}` i czyta endpoint metadanych z `deviceModelId`. Speculos przyjmuje `POST /apdu {data}`. Te protokoły się różnią. `wallet-cli apdu-proxy` obsługuje tylko urządzenie USB. Potrzebny jest więc mały proxy, który tłumaczy jeden protokół na drugi. Emulator Androida widzi hosta pod adresem `10.0.2.2`.

### Braki na maszynie

- Android SDK: `ANDROID_HOME` jest puste.
- NDK i build-tools.
- Emulator i obraz systemu albo fizyczny telefon. `adb` jest zainstalowane.
- Java jest w wersji 21. React Native zwykle wymaga wersji 17. To trzeba sprawdzić.

Na dysku jest 70 GB wolnego miejsca. SDK zajmie kilkanaście GB.

### Ograniczenie

Ta konfiguracja nie odtwarza warunków z payloadu. Błąd wystąpił na iOS przez BLE. Android ze Speculosem używa HTTP. Test sprawdzi logikę LLM i aplikacji Aleo dla tej samej kwoty i tych samych rekordów. Pokaże SW, jeśli pochodzi on z aplikacji Aleo. Nie pokaże błędu BLE.

Instalacja SDK czeka na decyzję użytkownika.
