# NavLog mobile

Expo SDK 54 app. CesiumJS runs inside a WebView; native Expo Location records GPS in foreground/background.

Set `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_CESIUM_ION_TOKEN` in your local environment or EAS environment. A Cesium ion access token is required for Cesium World Terrain and imagery.

Run `npm install`, then `npx expo start`. Background GPS and native widgets require a development/production build; Expo Go is not sufficient. Request foreground permission first, then background permission explicitly.
