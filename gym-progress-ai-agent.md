# Gym Progress Tracker — specyfikacja projektu i instrukcja dla agenta AI

## Cel
Zbuduj kompletny projekt semestralny zgodny z wymaganiami przedmiotu **„Projektowanie i programowanie aplikacji PWA i mobilnych cross-platform”**.

Projekt ma składać się z:
- **backendu z REST API**
- **aplikacji PWA**
- **aplikacji mobilnej cross-platform**
- **wspólnego systemu logowania**
- **wspólnego design systemu**
- **synchronizacji danych między klientami**

Temat aplikacji:
**Gym Progress Tracker** — aplikacja do śledzenia progresu na siłowni.

## Wymagania nadrzędne
Agent ma prowadzić projekt tak, aby finalnie spełniał wymagania zaliczenia:
- backend z API i CRUD
- baza danych PostgreSQL
- uwierzytelnianie użytkowników
- PWA z manifestem, Service Workerem i trybem offline
- aplikacja mobilna cross-platform z minimum 3 ekranami
- wykorzystanie tego samego API przez PWA i mobile
- lokalne przechowywanie danych w mobile
- minimum 1 funkcja natywna w mobile
- spójny interfejs graficzny między platformami
- dokumentacja projektu
- testy
- wdrożenie

Agent ma pilnować, żeby żadna z tych części nie została pominięta.

---

# Wybrany stack technologiczny

## Backend
- **Laravel 11 lub nowszy**
- **PHP 8.2+**
- **PostgreSQL**
- **Laravel Sanctum** do token-based auth
- **OpenAPI / Swagger** do dokumentacji API
- **Pest lub PHPUnit** do testów backendu

## PWA
- **Vue 3**
- **Vite**
- **PrimeVue**
- **Pinia**
- **Vue Router**
- **vite-plugin-pwa**

## Mobile
- **Ionic Vue**
- **Capacitor**
- **Pinia**
- **Vue Router**
- lokalne przechowywanie: **Capacitor Preferences** lub **SQLite**
- funkcja natywna: **aparat do zdjęcia sylwetki / posiłku** albo **powiadomienia lokalne**

## Repozytorium
Monorepo:
- `backend/`
- `pwa/`
- `mobile/`

---

# Główna idea aplikacji

Aplikacja ma pomagać użytkownikowi śledzić progres na siłowni:
- plan treningowy
- wykonane treningi
- ćwiczenia
- serie, powtórzenia, ciężary
- pomiary ciała
- masa ciała
- zdjęcia progresu
- cele treningowe
- statystyki i historia postępów

## Główna grupa docelowa
- osoby początkujące i średniozaawansowane
- osoby ćwiczące samodzielnie
- użytkownicy chcący monitorować wzrost siły, sylwetki i regularności

---

# Minimalny zakres funkcjonalny

## 1. Użytkownicy i logowanie
Musi istnieć:
- rejestracja
- logowanie
- wylogowanie
- odświeżanie sesji/tokenu jeśli potrzebne
- dostęp do własnych danych użytkownika
- ochrona endpointów

## 2. Plan treningowy
Użytkownik może:
- tworzyć plan treningowy
- dodawać dni treningowe
- dodawać ćwiczenia do planu
- edytować i usuwać plan

## 3. Rejestrowanie treningów
Użytkownik może:
- rozpocząć trening
- zapisać wykonane ćwiczenia
- zapisać serie, powtórzenia, ciężar
- zakończyć trening
- przeglądać historię treningów

## 4. Śledzenie progresu
Użytkownik może:
- zapisywać wagę ciała
- dodawać pomiary ciała
- dodawać zdjęcia progresu
- przeglądać historię zmian
- oglądać podstawowe wykresy/statystyki

## 5. Cele
Użytkownik może:
- ustawić cel, np. redukcja, masa, wzrost siły
- oznaczyć wartość docelową, np. waga lub wynik
- obserwować postęp do celu

## 6. Offline / synchronizacja
PWA musi:
- działać po instalacji
- cache’ować podstawowe zasoby
- mieć podstawową funkcjonalność offline
- synchronizować dane po odzyskaniu połączenia

Mobile musi:
- przechowywać lokalnie dane lub kolejkę zmian
- synchronizować dane z API po odzyskaniu sieci

---

# Minimalne wymagania projektowe per warstwa

## Backend — obowiązkowe
Agent ma dopilnować:
- poprawnego modelu danych
- pełnego REST API dla głównych zasobów
- walidacji requestów
- autoryzacji dostępu do zasobów użytkownika
- paginacji i filtrowania tam, gdzie ma sens
- obsługi błędów i spójnego formatu odpowiedzi JSON
- testów endpointów

## PWA — obowiązkowe
Agent ma dopilnować:
- co najmniej 3 widoków
- poprawnej nawigacji
- responsywności desktop/mobile
- manifest.json
- service workera
- cache’owania zasobów
- podstawowego trybu offline
- instalowalności

## Mobile — obowiązkowe
Agent ma dopilnować:
- co najmniej 3 ekranów
- poprawnej nawigacji
- korzystania z tego samego API co PWA
- lokalnego przechowywania danych
- minimum 1 funkcji natywnej

Rekomendowana funkcja natywna:
- **kamera** do dodawania zdjęć progresu

Alternatywa:
- **powiadomienia lokalne** o treningu
- **biometria** do odblokowania aplikacji

---

# Proponowane ekrany

## PWA
- logowanie / rejestracja
- dashboard
- plan treningowy
- aktywny trening
- historia treningów
- progres
- cele
- profil

## Mobile
- logowanie
- dashboard
- trening
- historia
- progres
- profil

---

# Model domenowy

## Encje główne

### User
- id
- name
- email
- password
- created_at
- updated_at

### WorkoutPlan
- id
- user_id
- name
- description
- is_active
- created_at
- updated_at

### WorkoutDay
- id
- workout_plan_id
- name
- day_order

### Exercise
- id
- name
- muscle_group
- description
- is_custom
- user_id nullable

### WorkoutDayExercise
- id
- workout_day_id
- exercise_id
- target_sets
- target_reps_min
- target_reps_max
- notes
- sort_order

### WorkoutSession
- id
- user_id
- workout_plan_id nullable
- started_at
- ended_at nullable
- notes
- status

### WorkoutSessionExercise
- id
- workout_session_id
- exercise_id
- order_index
- notes

### WorkoutSet
- id
- workout_session_exercise_id
- reps
- weight
- rir nullable
- is_warmup
- completed_at nullable

### BodyMeasurement
- id
- user_id
- measured_at
- weight
- chest_cm nullable
- waist_cm nullable
- hips_cm nullable
- arm_cm nullable
- thigh_cm nullable
- body_fat nullable
- notes nullable

### ProgressPhoto
- id
- user_id
- photo_path
- taken_at
- note nullable

### Goal
- id
- user_id
- type
- title
- target_value
- current_value nullable
- unit
- start_date
- target_date nullable
- status

---

# Relacje
- User ma wiele WorkoutPlan
- WorkoutPlan ma wiele WorkoutDay
- WorkoutDay ma wiele WorkoutDayExercise
- WorkoutDayExercise należy do Exercise
- User ma wiele WorkoutSession
- WorkoutSession ma wiele WorkoutSessionExercise
- WorkoutSessionExercise ma wiele WorkoutSet
- User ma wiele BodyMeasurement
- User ma wiele ProgressPhoto
- User ma wiele Goal

---

# API — minimalny zakres endpointów

## Auth
- `POST /api/register`
- `POST /api/login`
- `POST /api/logout`
- `GET /api/me`

## Workout plans
- `GET /api/workout-plans`
- `POST /api/workout-plans`
- `GET /api/workout-plans/{id}`
- `PUT /api/workout-plans/{id}`
- `DELETE /api/workout-plans/{id}`

## Workout days
- `POST /api/workout-plans/{id}/days`
- `PUT /api/workout-days/{id}`
- `DELETE /api/workout-days/{id}`

## Exercises
- `GET /api/exercises`
- `POST /api/exercises`
- `GET /api/exercises/{id}`
- `PUT /api/exercises/{id}`
- `DELETE /api/exercises/{id}`

## Workout sessions
- `GET /api/workout-sessions`
- `POST /api/workout-sessions`
- `GET /api/workout-sessions/{id}`
- `PUT /api/workout-sessions/{id}`
- `DELETE /api/workout-sessions/{id}`

## Workout session exercises / sets
- `POST /api/workout-sessions/{id}/exercises`
- `POST /api/workout-session-exercises/{id}/sets`
- `PUT /api/workout-sets/{id}`
- `DELETE /api/workout-sets/{id}`

## Measurements
- `GET /api/body-measurements`
- `POST /api/body-measurements`
- `PUT /api/body-measurements/{id}`
- `DELETE /api/body-measurements/{id}`

## Progress photos
- `GET /api/progress-photos`
- `POST /api/progress-photos`
- `DELETE /api/progress-photos/{id}`

## Goals
- `GET /api/goals`
- `POST /api/goals`
- `PUT /api/goals/{id}`
- `DELETE /api/goals/{id}`

## Stats
- `GET /api/stats/overview`
- `GET /api/stats/strength-progress`
- `GET /api/stats/body-progress`

---

# Zasady implementacji API

Agent ma stosować:
- Laravel Form Requests do walidacji
- Resource classes / API Resources do serializacji JSON
- policy / gate tam, gdzie trzeba ograniczyć dostęp
- spójny format błędów
- pagination dla list
- soft deletes tylko jeśli uzasadnione
- upload plików dla zdjęć progresu
- testy feature dla auth i głównych endpointów

Przykładowy format odpowiedzi:
```json
{
  "data": {},
  "message": "Success"
}
```

Dla walidacji:
```json
{
  "message": "Validation failed",
  "errors": {
    "email": ["The email field is required."]
  }
}
```

---

# Wymagania bezpieczeństwa

Agent ma obowiązkowo wdrożyć:
- hashowanie haseł
- token auth przez Sanctum
- ograniczenie dostępu tylko do zasobów właściciela
- walidację danych wejściowych
- konfigurację CORS
- bezpieczną obsługę uploadu plików
- ochronę przed typowymi błędami typu mass assignment
- `.env` poza repozytorium
- HTTPS na deployu
- sensowne logowanie błędów

Dodatkowo:
- rate limiting dla auth
- sprawdzanie MIME i rozmiaru plików
- brak wrażliwych danych w odpowiedziach API

---

# Design system

## Styl
Aplikacja ma być nowoczesna, prosta i sportowa.

## Założenia
- ciemny i jasny motyw opcjonalnie
- czytelna typografia
- spójne kolory między PWA i mobile
- te same nazwy komponentów i zachowań

## Kolory przykładowe
- primary: odcień zieleni lub niebieskiego
- success: zielony
- warning: pomarańczowy
- danger: czerwony
- surface / background: neutralne

## Podstawowe komponenty
- AppHeader
- AppSidebar / BottomTabBar
- StatCard
- WorkoutCard
- ExerciseListItem
- SetRow
- ProgressChartCard
- GoalCard
- EmptyState
- ConfirmDialog
- AppFormInput
- AppButton

Agent ma dążyć do ponownego wykorzystania komponentów i wzorców UI.

---

# Wymagania offline i synchronizacji

## PWA
Agent ma:
- skonfigurować `vite-plugin-pwa`
- dodać manifest
- dodać service worker
- cache’ować shell aplikacji
- cache’ować ostatnio pobrane dane lub wybrane widoki
- obsłużyć brak internetu komunikatem dla użytkownika

## Mobile
Agent ma:
- trzymać część danych lokalnie
- umożliwić zapis treningu nawet chwilowo offline
- dodać mechanizm synchronizacji po odzyskaniu połączenia
- przynajmniej prostą kolejkę zmian do wysłania

Nie musi to być pełny sync-engine klasy enterprise, ale ma działać sensownie na potrzeby projektu.

---

# Funkcja natywna w mobile

## Preferowana: aparat
Użytkownik może:
- zrobić zdjęcie progresu
- zapisać je do historii postępu
- wysłać do backendu lub odłożyć do synchronizacji

Agent ma użyć Capacitor Camera.

## Alternatywna dodatkowa funkcja
- local notifications z przypomnieniem o treningu

---

# Struktura repozytorium

```txt
gym-progress-tracker/
  backend/
  pwa/
  mobile/
  docs/
```

## Backend
```txt
backend/
  app/
  routes/
  database/
  tests/
  app/Models
  app/Http/Controllers/Api
  app/Http/Requests
  app/Http/Resources
```

## PWA
```txt
pwa/
  src/
    components/
    views/
    stores/
    router/
    services/
    composables/
    assets/
```

## Mobile
```txt
mobile/
  src/
    components/
    views/
    stores/
    router/
    services/
    composables/
```

## Docs
```txt
docs/
  architecture.md
  api.md
  testing-report.md
  design-system.md
```

---

# Kolejność prac

Agent ma prowadzić projekt etapami.

## Etap 1 — analiza i plan
Najpierw przygotuj:
1. opis aplikacji
2. listę funkcjonalności MVP
3. diagram architektury
4. listę encji i relacji
5. user stories
6. strukturę repozytorium

## Etap 2 — backend
Następnie:
1. skonfiguruj Laravel + PostgreSQL
2. przygotuj migracje
3. przygotuj seedery przykładowych ćwiczeń
4. skonfiguruj Sanctum
5. zbuduj auth
6. zbuduj CRUD dla głównych zasobów
7. dodaj testy
8. dodaj OpenAPI / Swagger

## Etap 3 — PWA
1. skonfiguruj Vue + Vite + PrimeVue
2. skonfiguruj router i store
3. zbuduj widoki auth
4. zbuduj dashboard
5. zbuduj moduł planów treningowych
6. zbuduj moduł aktywnego treningu
7. zbuduj moduł progresu
8. dodaj PWA support i offline

## Etap 4 — mobile
1. skonfiguruj Ionic Vue + Capacitor
2. zbuduj nawigację
3. podłącz auth
4. dodaj ekran treningu
5. dodaj ekran historii
6. dodaj ekran progresu
7. dodaj kamerę
8. dodaj lokalne przechowywanie i sync

## Etap 5 — testy i wdrożenie
1. testy backendu
2. testy podstawowych flow frontendowych
3. testy manualne mobile
4. raport z testów
5. deploy backendu
6. deploy PWA
7. build mobile
8. dokumentacja końcowa

---

# User stories

## Auth
- Jako użytkownik chcę założyć konto, aby zapisywać swoje dane treningowe.
- Jako użytkownik chcę się zalogować, aby mieć dostęp do swojego planu i historii.

## Trening
- Jako użytkownik chcę utworzyć plan treningowy, aby ćwiczyć według harmonogramu.
- Jako użytkownik chcę zapisać wykonane serie i ciężary, aby śledzić progres siłowy.
- Jako użytkownik chcę przeglądać historię treningów, aby porównywać wyniki.

## Progres
- Jako użytkownik chcę zapisywać wagę i pomiary, aby obserwować zmiany sylwetki.
- Jako użytkownik chcę dodawać zdjęcia progresu, aby wizualnie śledzić efekty.
- Jako użytkownik chcę mieć wykres zmian, aby szybko ocenić postępy.

## Mobile
- Jako użytkownik chcę zrobić zdjęcie z poziomu telefonu, aby dodać zdjęcie progresu.
- Jako użytkownik chcę korzystać z aplikacji na telefonie, aby notować trening na siłowni.

## Offline
- Jako użytkownik chcę mieć dostęp do podstawowych danych bez internetu, aby korzystać z aplikacji na siłowni.
- Jako użytkownik chcę zsynchronizować lokalne zmiany po powrocie sieci, aby nic nie utracić.

---

# Kryteria jakości kodu

Agent ma pilnować:
- małych i czytelnych komponentów
- dobrego nazewnictwa
- spójnych typów i struktur danych
- podziału na warstwę widoków, logiki i usług
- unikania duplikacji
- sensownych commitów
- prostych komentarzy tylko tam, gdzie są potrzebne

---

# Testowanie

## Backend
- test rejestracji
- test logowania
- test dostępu do chronionych endpointów
- test CRUD planów
- test CRUD treningów
- test walidacji danych
- test uprawnień właściciela

## PWA
- test logowania
- test tworzenia planu
- test zapisania treningu
- test wyświetlenia historii

## Mobile
- test logowania
- test zapisania treningu
- test dodania zdjęcia progresu
- test działania wybranych ekranów

## Raport testów
Agent ma przygotować:
- listę przypadków testowych
- listę wykrytych błędów
- sposób naprawy
- wynik końcowy

---

# Dokumentacja końcowa

Agent ma finalnie przygotować dokumentację zawierającą:
1. opis aplikacji
2. architekturę systemu
3. uzasadnienie wybranej technologii
4. opis API
5. design system
6. opis funkcjonalności
7. zabezpieczenia
8. testowanie
9. zrzuty ekranu
10. instrukcję uruchomienia
11. napotkane problemy
12. możliwości rozwoju

---

# Zasady pracy dla agenta AI

1. Nie pomijaj żadnej warstwy projektu.
2. Zawsze pilnuj zgodności z wymaganiami zaliczenia.
3. Najpierw proponuj MVP, potem rozszerzenia.
4. Kod ma być praktyczny, prosty i wykonalny na projekt semestralny.
5. Każdy większy moduł rozbijaj na małe kroki.
6. Dla backendu preferuj standardy Laravel.
7. Dla PWA preferuj Vue 3 Composition API.
8. Dla mobile preferuj Ionic Vue + Capacitor.
9. Każdy endpoint i ekran powinien mieć jasny cel biznesowy.
10. Przy generowaniu kodu uwzględniaj bezpieczeństwo, walidację i obsługę błędów.
11. Tam, gdzie to możliwe, twórz checklisty ukończenia.
12. Gdy czegoś brakuje, zaproponuj najprostszą wersję zgodną z wymaganiami.

---

# Co agent ma zrobić najpierw

W pierwszej odpowiedzi agent powinien przygotować:
1. nazwę projektu
2. krótki opis aplikacji
3. MVP feature list
4. diagram architektury tekstowo
5. listę encji
6. propozycję struktury repo
7. plan prac na 5 etapów

W kolejnych krokach agent ma pomagać implementować projekt moduł po module.

---

# Definicja sukcesu
Projekt jest uznany za gotowy, gdy:
- backend działa i wystawia REST API
- PWA działa, jest instalowalne i ma tryb offline
- mobile działa na Androidzie
- obie aplikacje używają jednego API
- użytkownik może się zalogować i zarządzać swoimi danymi treningowymi
- działa zapis progresu i historii treningów
- działa co najmniej jedna funkcja natywna
- projekt ma testy, dokumentację i deploy

