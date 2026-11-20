# NavLog

NavLog is a 3D route recorder built with Expo React Native, CesiumJS, Express and MongoDB.

## Repository layout

- `App.tsx`, `index.js`, `app.json`: Expo mobile app.
- `api/`: Express API for route storage and replay.
- CesiumJS runs inside a React Native WebView. Native GPS collection is handled by Expo Location + TaskManager.

## Local development

1. Install Node.js 20 or newer.
2. From the repository root run `npm install`.
3. Set `EXPO_PUBLIC_API_URL` to your API URL and `EXPO_PUBLIC_CESIUM_ION_TOKEN` to a Cesium ion access token.
4. Run `npx expo start`. For background location, build a native development client; Expo Go is not sufficient.
5. For the API, run `npm --prefix api install`, copy `api/.env.example` to `api/.env`, fill in MongoDB credentials, then run `npm --prefix api run dev`.

## Render Web Service (manual setup, no Blueprint)

Create a **Web Service** from this repository:
- Root Directory: `api`
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`

Environment variables:
- `MONGODB_URI`: MongoDB Atlas connection string
- `MONGODB_DB`: `navlog`
- `CORS_ORIGIN`: `*` for initial development; restrict later

Render injects `PORT`; the API listens on `0.0.0.0`.

## Required external configuration

- Create a Cesium ion token and provide it as `EXPO_PUBLIC_CESIUM_ION_TOKEN`; Cesium World Terrain requires a valid token and internet access.
- Set `EXPO_PUBLIC_API_URL` to the deployed Render URL before creating an EAS build.
- Create MongoDB Atlas database `navlog` and allow the Render service to connect.

## MVP limitations

- Background GPS requires a native build, explicit foreground/background location permission, and OS-level background execution settings. Expo Go is not sufficient. Force-stopping the app or powering off the phone stops GPS collection.
- Android Home Screen Widget and iOS Live Activity are not implemented in this first scaffold; they require separate native Android/iOS widget targets.
- This MVP uses an installation-scoped device ID, not user accounts. Add authentication before treating route data as private multi-user data.
