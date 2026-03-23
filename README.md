# GargaGym PWA

Vue 3 + Vite PWA for Gym Progress Tracker, connected to Laravel API.

## Configuration

1. Copy env file:

```sh
cp .env.example .env
```

2. Edit backend URL:

```env
VITE_API_BASE_URL=http://localhost:8000/api
VITE_DEVICE_NAME=pwa-web
VITE_SYNC_INTERVAL_MS=45000
```

## Security and offline basics

- Access token is stored encrypted in IndexedDB (AES-GCM via Web Crypto).
- PWA uses Service Worker (`vite-plugin-pwa`) for app-shell/runtime cache.
- Offline operations are queued in IndexedDB and sent via `POST /sync/push`.
- Pull sync uses `GET /sync/pull?updated_since=...`.

## Run

```sh
npm install
npm run dev
```

## Build

```sh
npm run build
```
