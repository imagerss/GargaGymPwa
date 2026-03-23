# Dokumentacja API - Gym Progress Tracker

## Bazowe informacje

- Base URL lokalnie: `http://localhost:8000/api`
- Format: `application/json`
- Auth: `Bearer Token` (Laravel Sanctum, ability `access-api`)
- Język komunikatów: polski
- Wszystkie endpointy poza `auth/register` i `auth/login` wymagają tokena

## Uwierzytelnianie

### Rejestracja
- `POST /auth/register`

Request:
```json
{
  "name": "Jan Kowalski",
  "email": "jan@example.com",
  "password": "password",
  "password_confirmation": "password",
  "device_name": "pwa-chrome"
}
```

Przykładowa odpowiedź `201 Created`:
```json
{
  "token": "1|long-sanctum-token",
  "token_type": "Bearer",
  "user": {
    "id": 1,
    "name": "Jan Kowalski",
    "email": "jan@example.com",
    "email_verified_at": null,
    "created_at": "2026-03-23T11:00:00.000000Z",
    "updated_at": "2026-03-23T11:00:00.000000Z"
  }
}
```

### Logowanie
- `POST /auth/login`

Request:
```json
{
  "email": "jan@example.com",
  "password": "password",
  "device_name": "pwa-chrome"
}
```

Przykładowa odpowiedź `200 OK`:
```json
{
  "token": "2|long-sanctum-token",
  "token_type": "Bearer",
  "user": {
    "id": 1,
    "name": "Jan Kowalski",
    "email": "jan@example.com",
    "email_verified_at": null,
    "created_at": "2026-03-23T11:00:00.000000Z",
    "updated_at": "2026-03-23T11:00:00.000000Z"
  }
}
```

Przykładowa odpowiedź błędu logowania `401 Unauthorized`:
```json
{
  "message": "Podane dane logowania są nieprawidłowe."
}
```

### Aktualny użytkownik
- `GET /auth/me`

Przykładowa odpowiedź `200 OK`:
```json
{
  "user": {
    "id": 1,
    "name": "Jan Kowalski",
    "email": "jan@example.com",
    "email_verified_at": null,
    "created_at": "2026-03-23T11:00:00.000000Z",
    "updated_at": "2026-03-23T11:00:00.000000Z"
  }
}
```

### Wylogowanie
- `POST /auth/logout`

Przykładowa odpowiedź `200 OK`:
```json
{
  "message": "Wylogowano pomyślnie."
}
```

## Nagłówki HTTP (Vue PWA)

W kliencie zawsze wysyłaj:

- `Accept: application/json`
- `Authorization: Bearer <token>` (dla endpointów chronionych)
- `Content-Type: application/json` (dla `POST/PUT`)

Przykład:
```http
Authorization: Bearer 1|abc...
Accept: application/json
Content-Type: application/json
```

## Zasoby API

### Workout Plans
- `GET /workout-plans`
- `POST /workout-plans`
- `GET /workout-plans/{id}`
- `PUT /workout-plans/{id}`
- `DELETE /workout-plans/{id}`

### Workout Days
- `POST /workout-plans/{workoutPlan}/days`
- `PUT /workout-days/{workoutDay}`
- `DELETE /workout-days/{workoutDay}`

### Exercises
- `GET /exercises`
- `POST /exercises`
- `GET /exercises/{id}`
- `PUT /exercises/{id}`
- `DELETE /exercises/{id}`

### Workout Sessions
- `GET /workout-sessions`
- `POST /workout-sessions`
- `GET /workout-sessions/{id}`
- `PUT /workout-sessions/{id}`
- `DELETE /workout-sessions/{id}`

### Workout Session Exercises / Sets
- `POST /workout-sessions/{workoutSession}/exercises`
- `POST /workout-session-exercises/{workoutSessionExercise}/sets`
- `PUT /workout-sets/{workoutSet}`
- `DELETE /workout-sets/{workoutSet}`

### Body Measurements
- `GET /body-measurements`
- `POST /body-measurements`
- `GET /body-measurements/{id}`
- `PUT /body-measurements/{id}`
- `DELETE /body-measurements/{id}`

### Progress Photos
- `GET /progress-photos`
- `POST /progress-photos`
- `DELETE /progress-photos/{id}`

### Goals
- `GET /goals`
- `POST /goals`
- `GET /goals/{id}`
- `PUT /goals/{id}`
- `DELETE /goals/{id}`

### Stats
- `GET /stats/overview`
- `GET /stats/strength-progress`
- `GET /stats/body-progress`

## Wsparcie offline (ważne dla PWA)

Backend wspiera podstawową synchronizację offline przez:

1. `updated_since` na endpointach list:
   - `GET /workout-plans?updated_since=2026-03-23T10:00:00Z`
   - `GET /exercises?updated_since=...`
   - `GET /workout-sessions?updated_since=...`
   - `GET /body-measurements?updated_since=...`
   - `GET /progress-photos?updated_since=...`
   - `GET /goals?updated_since=...`

2. Zbiorcze endpointy synchronizacji:
   - `GET /sync/pull?updated_since=2026-03-23T10:00:00Z&limit=200`
   - `POST /sync/push`

Przykładowy request `sync/push` (kolejka z mobile/PWA):
```json
{
  "operations": [
    {
      "client_id": "op-1",
      "resource": "workout_plans",
      "action": "delete",
      "id": 123
    },
    {
      "client_id": "op-2",
      "resource": "body_measurements",
      "action": "create",
      "data": {
        "measured_at": "2026-03-23T11:10:00Z",
        "weight": 81.4
      }
    }
  ]
}
```

Znaczenie pól `operations[]`:

- `client_id`: unikalny identyfikator operacji po stronie klienta (np. UUID)
- `resource`: nazwa zasobu (`workout_plans`, `workout_sessions`, `exercises`, `body_measurements`, `progress_photos`, `goals`)
- `action`: `create`, `update`, `delete`
- `id`: wymagane dla `update`/`delete` (ID rekordu na backendzie)
- `data`: payload dla `create`/`update`

Przykładowa odpowiedź `sync/pull`:
```json
{
  "data": {
    "server_time": "2026-03-23T11:05:00Z",
    "workout_plans": [],
    "workout_sessions": [],
    "exercises": [],
    "body_measurements": [],
    "progress_photos": [],
    "goals": [],
    "deletions": {
      "workout_plans": [
        {
          "id": 123,
          "deleted_at": "2026-03-23T11:00:00Z"
        }
      ]
    }
  },
  "message": "Pobrano dane do synchronizacji offline."
}
```

### Proponowany flow synchronizacji w PWA

1. Trzymaj lokalnie:
   - `access_token`
   - `last_sync_at`
   - `operations_queue` (kolejka zmian offline)
   - cache encji (IndexedDB / localForage)
2. Po odzyskaniu internetu:
   - wyślij kolejkę lokalnych zmian batchem: `POST /sync/push`,
   - pobierz zmiany z backendu: `GET /sync/pull?updated_since={last_sync_at}`.
3. Zastosuj lokalnie `deletions` z `sync/pull` (usuniecia z innych klientów/urządzeń).
4. Po udanej synchronizacji ustaw `last_sync_at = server_time`.

### Algorytm sync (pseudo)

```text
if (isOnline) {
  pushQueue();
  pullChanges(lastSyncAt);
  applyUpserts();
  applyDeletions();
  save(lastSyncAt = serverTime);
}
```

## Gotowe kontrakty dla frontendu

### Typ operacji w kolejce offline

```json
{
  "client_id": "uuid",
  "resource": "workout_plans",
  "action": "create",
  "id": null,
  "data": {
    "name": "Plan A",
    "description": "FBW",
    "is_active": true
  }
}
```

### Typ odpowiedzi `sync/push`

```json
{
  "data": {
    "server_time": "2026-03-23T11:20:00Z",
    "applied": [
      {
        "index": 0,
        "resource": "workout_plans",
        "action": "delete",
        "client_id": "op-1",
        "result": { "id": 123 }
      }
    ],
    "failed": []
  },
  "message": "Zakończono synchronizację zmian z urządzenia."
}
```

## Integracja w Vue PWA (praktycznie)

### Rekomendowana struktura

- `src/services/apiClient.ts` - axios/fetch + interceptory tokena
- `src/services/syncService.ts` - `pushQueue()` i `pullChanges()`
- `src/stores/auth.ts` - token/user
- `src/stores/sync.ts` - `lastSyncAt`, status sync, błędy
- `src/stores/entities/*` - dane domenowe (plan, sesje, cele itd.)
- `src/db/*` - warstwa IndexedDB (Dexie/localForage)

### Moment uruchamiania synchronizacji

- po zalogowaniu
- po `online` event (`window.addEventListener('online', ...)`)
- cyklicznie (np. co 30-60 sekund, jeśli online)
- ręcznie (przycisk „Synchronizuj”)

### Obsługa błędów sync

- `401`: wygaśnięty token -> wymuś ponowne logowanie
- `403`: próba operacji na cudzym zasobie -> oznacz operację jako failed i usuń z kolejki
- walidacja `422`: pokaż użytkownikowi błąd i oznacz operację jako failed
- timeout/network: zostaw operację w kolejce, retry z backoff

## Endpointy i minimalne payloady (MVP)

### `POST /workout-plans`
```json
{
  "name": "Push Pull Legs",
  "description": "3 dni",
  "is_active": true
}
```

Przykładowa odpowiedź `201 Created`:
```json
{
  "data": {
    "id": 10,
    "user_id": 1,
    "name": "Push Pull Legs",
    "description": "3 dni",
    "is_active": true,
    "created_at": "2026-03-23T11:30:00.000000Z",
    "updated_at": "2026-03-23T11:30:00.000000Z"
  },
  "message": "Plan treningowy został utworzony."
}
```

### `POST /workout-sessions`
```json
{
  "workout_plan_id": 1,
  "started_at": "2026-03-23T10:00:00Z",
  "status": "active"
}
```

Przykładowa odpowiedź `201 Created`:
```json
{
  "data": {
    "id": 25,
    "user_id": 1,
    "workout_plan_id": 10,
    "started_at": "2026-03-23T10:00:00.000000Z",
    "ended_at": null,
    "notes": null,
    "status": "active",
    "created_at": "2026-03-23T10:00:01.000000Z",
    "updated_at": "2026-03-23T10:00:01.000000Z"
  },
  "message": "Sesja treningowa została utworzona."
}
```

### `POST /body-measurements`
```json
{
  "measured_at": "2026-03-23T09:00:00Z",
  "weight": 81.4,
  "waist_cm": 84.0
}
```

Przykładowa odpowiedź `201 Created`:
```json
{
  "data": {
    "id": 44,
    "user_id": 1,
    "measured_at": "2026-03-23T09:00:00.000000Z",
    "weight": "81.40",
    "waist_cm": "84.00",
    "created_at": "2026-03-23T11:35:00.000000Z",
    "updated_at": "2026-03-23T11:35:00.000000Z"
  },
  "message": "Pomiar ciała został zapisany."
}
```

### `POST /goals`
```json
{
  "type": "waga",
  "title": "Schudnąć do 78 kg",
  "target_value": 78,
  "current_value": 82,
  "unit": "kg",
  "start_date": "2026-03-23",
  "status": "active"
}
```

Przykładowa odpowiedź `201 Created`:
```json
{
  "data": {
    "id": 9,
    "user_id": 1,
    "type": "waga",
    "title": "Schudnąć do 78 kg",
    "target_value": "78.00",
    "current_value": "82.00",
    "unit": "kg",
    "start_date": "2026-03-23",
    "target_date": null,
    "status": "active",
    "created_at": "2026-03-23T11:40:00.000000Z",
    "updated_at": "2026-03-23T11:40:00.000000Z"
  },
  "message": "Cel został utworzony."
}
```

## Checklista dla Ciebie (PWA)

- logowanie + zapis tokena
- kolejka operacji offline (create/update/delete)
- `sync/push` po odzyskaniu internetu
- `sync/pull` i merge danych
- stosowanie `deletions` lokalnie
- aktualizacja `last_sync_at`
- retry/backoff dla błędów sieci
- UI statusu sync (np. „Oczekuje 3 zmian do wysłania”)

## Kształt odpowiedzi

Sukces:
```json
{
  "data": {},
  "message": "Operacja zakończona powodzeniem."
}
```

Błąd walidacji (Laravel):
```json
{
  "message": "The given data was invalid.",
  "errors": {
    "field": ["Komunikat walidacji"]
  }
}
```

Brak autoryzacji `401 Unauthorized`:
```json
{
  "message": "Unauthenticated."
}
```

Brak dostępu do zasobu `403 Forbidden`:
```json
{
  "message": "This action is unauthorized."
}
```

## Uwagi implementacyjne dla frontendu

- Większość endpointów listujących zwraca paginację Laravel (`data`, `links`, `meta`).
- Zawsze wysyłaj nagłówek:
  - `Authorization: Bearer {token}`
  - `Accept: application/json`
- Przy `403` traktuj to jako próbę dostępu do cudzego zasobu.
- Przy `401` odśwież sesję/token przez ponowne logowanie.
- Do sync używaj `server_time` z backendu, nie czasu urządzenia.
