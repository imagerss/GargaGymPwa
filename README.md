# GargaGym PWA

Aplikacja webowa PWA oparta o Vue 3 do śledzenia treningów, planów treningowych, pomiarów ciała, zdjęć progresu oraz historii sesji.

Frontend współpracuje z backendem Laravel znajdującym się pod adresem https://github.com/imagerss/GargaGymBackend, ale został zbudowany tak, żeby działał sensownie również przy słabym połączeniu albo całkowitym braku internetu.

Najważniejsze założenia:

- sesja użytkownika jest przywracana lokalnie,
- dane są cache’owane w IndexedDB,
- operacje zapisu są kolejkowane offline,
- synchronizacja odbywa się w tle po odzyskaniu połączenia.

## Do Czego Służy Aplikacja

GargaGym to osobisty tracker progresu treningowego. Użytkownik może:

- zalogować się albo zarejestrować,
- tworzyć plany treningowe,
- dodawać ćwiczenia do planów,
- uruchamiać sesje treningowe na podstawie planu,
- zapisywać serie, ciężary i powtórzenia,
- kończyć sesję z opcjonalnym zdjęciem i pomiarami,
- dodawać ręczne pomiary ciała,
- dodawać zdjęcia progresu,
- przeglądać progres i historię sesji.

## Główne Funkcje

### Dashboard

- uruchamianie sesji z wybranego planu,
- podgląd aktywnej sesji,
- szybkie logowanie serii,
- zakończenie aktywnej sesji,
- wykres progresu,
- powiązanie punktów pomiarowych ze zdjęciami.

### Plany

- tworzenie planów treningowych,
- dodawanie ćwiczeń do planu,
- ustawianie liczby serii i powtórzeń,
- usuwanie ćwiczeń z planu,
- lokalne przechowywanie konfiguracji planu przed pełnym syncem z backendem.

### Sesje

- start sesji z planu,
- lokalne zapisywanie przebiegu treningu,
- zakończenie sesji z pomiarami i zdjęciem,
- przegląd aktywnych i zakończonych sesji,
- odtwarzanie snapshotów sesji zapisanych lokalnie.

### Pomiary

- dodawanie ręcznych pomiarów,
- łączenie pomiarów ręcznych z pomiarami końcowymi z sesji,
- unikanie oczywistych duplikatów danych.

### Zdjęcia

- dodawanie zdjęć progresu,
- przechowywanie oczekujących zdjęć lokalnie,
- późniejsze wysłanie zdjęć po odzyskaniu internetu,
- łączenie zdjęć ręcznych ze zdjęciami z zakończonych sesji.

### Auth i Offline

- bezpieczne przechowywanie tokenu,
- trwała sesja użytkownika,
- lokalny cache encji,
- kolejka operacji offline,
- automatyczny background sync.

## Stack Technologiczny

- Vue 3
- TypeScript
- Vite
- PrimeVue 4
- Tailwind CSS 4
- Pinia
- Vue Router
- Dexie / IndexedDB
- `vite-plugin-pwa`
- Axios
- Chart.js

## Struktura Projektu

Najważniejsze katalogi:

```text
src/
  components/          współdzielone komponenty UI
  views/               widoki routów
  router/              routing i guardy auth
  stores/              store’y Pinia
  services/            logika API, syncu, cache i flow treningowego
  db/                  schemat IndexedDB
  styles/              style globalne
```

Najważniejsze pliki:

- `src/main.ts` - bootstrap aplikacji i konfiguracja PrimeVue
- `src/router/index.ts` - routing i przekierowania auth
- `src/stores/auth.ts` - logowanie, rejestracja, restore sesji, logout
- `src/stores/sync.ts` - zarządzanie synchronizacją w tle
- `src/services/gymService.ts` - odczyt i cache podstawowych zasobów
- `src/services/trainingFlowService.ts` - lokalny flow planów i sesji
- `src/services/syncService.ts` - push/pull sync
- `src/db/appDb.ts` - IndexedDB i lokalne zasoby
- `vite.config.ts` - konfiguracja Vite oraz PWA

## Jak Działa Aplikacja

### 1. Uwierzytelnianie

Logowanie i rejestracja odbywają się przez backend API.

Frontend:

- zapisuje token w bezpiecznej pamięci,
- zapisuje użytkownika w IndexedDB,
- przywraca sesję po odświeżeniu,
- przy problemach sieciowych stara się zachować lokalną sesję.

Główne pliki:

- `src/stores/auth.ts`
- `src/services/authService.ts`
- `src/services/secureStorage.ts`

### 2. Lokalny Cache

Podstawowe zasoby są przechowywane w IndexedDB:

- plany treningowe,
- ćwiczenia,
- sesje treningowe,
- pomiary ciała,
- zdjęcia progresu.

Widoki czytają dane z cache tak szybko jak to możliwe. Jeśli cache już istnieje, aplikacja nie musi za każdym razem czekać na backend.

Główne pliki:

- `src/services/gymService.ts`
- `src/services/offlineEntityService.ts`
- `src/db/appDb.ts`

### 3. Kolejka Offline i Synchronizacja

Jeżeli użytkownik zapisuje dane offline, aplikacja nie wywala błędu od razu, tylko odkłada operację do kolejki.

Po odzyskaniu połączenia:

- kolejka jest wypychana na backend,
- pobierane są zmiany z serwera,
- lokalny cache jest odświeżany,
- synchronizowane są lokalne konfiguracje planów oznaczone jako dirty.

Główne pliki:

- `src/stores/sync.ts`
- `src/services/syncService.ts`
- `src/services/planConfigSyncService.ts`

### 4. Flow Treningowy

Część logiki treningowej działa niezależnie od standardowego CRUD-a.

To oznacza, że:

- konfiguracja ćwiczeń w planie jest trzymana lokalnie,
- aktywne serie są aktualizowane natychmiast lokalnie,
- zakończona sesja zapisuje snapshot do `notes`,
- snapshot może być później odtworzony w UI.

Główny plik:

- `src/services/trainingFlowService.ts`

## Setup Deweloperski

### Wymagania

- Node.js `^20.19.0 || >=22.12.0`
- npm
- uruchomiony backend Laravel https://github.com/imagerss/GargaGymBackend

### Instalacja

```sh
git clone https://github.com/imagerss/GargaGymPwa
cd GargaGymPwa
npm install
npm run build
```

### Konfiguracja `.env`

Utwórz lokalny plik środowiskowy:

```sh
cp .env.example .env
```

Dostępne zmienne:

```env
VITE_API_BASE_URL=http://localhost:8000/api
VITE_DEVICE_NAME=pwa-web
VITE_SYNC_INTERVAL_MS=45000
```

Znaczenie:

- `VITE_API_BASE_URL` - bazowy adres backendowego API,
- `VITE_DEVICE_NAME` - nazwa urządzenia używana przy auth,
- `VITE_SYNC_INTERVAL_MS` - interwał synchronizacji używany przez aplikację.

### Uruchomienie Lokalnie

```sh
npm run dev
```

Frontend wystartuje na Vite. Backend musi być dostępny pod adresem wskazanym w `.env`.

## Skrypty

```sh
npm run dev
npm run build
npm run preview
npm run type-check
npm run lint
npm run lint:oxlint
npm run lint:eslint
npm run format
```

Rekomendowany workflow:

1. Uruchom backend.
2. Uruchom frontend przez `npm run dev`.
3. Wprowadź zmiany.
4. Przed końcem pracy odpal `npm run build`.
5. Przy większych zmianach odpal też `npm run lint`.

## Build i Preview

Build produkcyjny:

```sh
npm run build
```

Podgląd buildu lokalnie:

```sh
npm run preview
```

## Zachowanie PWA

Aplikacja korzysta z `vite-plugin-pwa`.

Obecne zachowanie:

- service worker rejestruje się automatycznie,
- manifest generowany jest z `vite.config.ts`,
- app shell jest cache’owany,
- strony używają `StaleWhileRevalidate`,
- requesty do API używają `NetworkFirst`,
- aplikacja może działać na lokalnych danych bez pełnego dostępu do sieci.

Najważniejsze ustawienia manifestu:

- nazwa aplikacji: `GargaGym PWA`
- skrócona nazwa: `GargaGym`
- tryb wyświetlania: `standalone`

## Routing

Główne ścieżki:

- `/login`
- `/`
- `/plans`
- `/sessions`
- `/exercises`
- `/measurements`
- `/photos`
- `/profile`

Większość routów wymaga zalogowanego użytkownika. Niezalogowany użytkownik trafia na `/login`.

## UI i Zasady Projektowe

Frontend opiera się na:

- PrimeVue jako baza komponentów,
- mobilnym, responsywnym układzie,
- czarno-białym kierunku wizualnym,
- czerwieni dla akcji destrukcyjnych i błędów,
- pomarańczu dla warningów.


## Oczekiwania Wobec Backendu

Frontend zakłada istnienie endpointów dla:

- auth,
- workout plans,
- workout days / workout day exercises,
- exercises,
- workout sessions,
- body measurements,
- goals,
- progress photos,
- sync push / pull,
- stats overview.


## Gdzie Zmieniać Co

Jeżeli chcesz zmienić:

- nawigację lub shell aplikacji: `src/App.vue`
- routing i auth guard: `src/router/index.ts`
- komunikację z API: `src/services/apiClient.ts` i pliki w `services/`
- cache i lokalne encje: `src/db/appDb.ts`, `src/services/offlineEntityService.ts`
- sync: `src/stores/sync.ts`, `src/services/syncService.ts`
- logikę sesji treningowych: `src/services/trainingFlowService.ts`
- motyw i globalne style: `src/main.ts`, `src/styles/main.css`

## Ważne Ograniczenia i Decyzje

- część flow treningowego jest świadomie trzymana w `localStorage`,
- część danych encji jest przechowywana w IndexedDB,
- snapshot zakończonej sesji jest serializowany do `notes`,
- zdjęcia mogą tymczasowo istnieć tylko lokalnie, zanim przejdą sync.

To są świadome decyzje architektoniczne.


## Szybki Start

```sh
git clone https://github.com/imagerss/GargaGymPwa
cd GargaGymPwa
cp .env.example .env
npm install
npm run dev
```

Potem otwórz aplikację w przeglądarce i upewnij się, że backend Laravel działa pod adresem ustawionym w `.env`.
