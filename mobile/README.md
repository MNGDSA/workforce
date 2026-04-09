# WORKFORCE Mobile Attendance App

React Native / Expo mobile app for seasonal worker attendance at Luxury Carts Company Ltd (Masjid Al-Haram operations).

## Features

- **Selfie Check-In**: Camera capture with face guide overlay for attendance photo
- **GPS Verification**: Automatic GPS location capture at check-in time
- **Offline-First**: SQLite-backed offline storage with automatic background sync
- **Geofence Map**: Google Maps view of authorized attendance zones
- **Sync Engine**: Exponential backoff retry, auto-sync every 30s when online
- **Privacy Compliant**: Full privacy policy screen, secure credential storage

## Prerequisites

- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- EAS CLI (for builds): `npm install -g eas-cli`
- Expo Go app on your phone (for development)

## Setup

```bash
cd mobile
npm install

# Configure server URL in the login screen settings,
# or set it in src/services/api.ts

# Start development server
npx expo start
```

## Configuration

### Server URL
Set in the app's login screen via "Server Configuration", or update the default in `src/services/api.ts`.

### Google Maps API Keys
Replace placeholders in `app.json`:
- iOS: `expo.ios.config.googleMapsApiKey`
- Android: `expo.android.config.googleMaps.apiKey`

### EAS Build
Replace placeholders in `eas.json` and `app.json`:
- `YOUR_EAS_PROJECT_ID` in `app.json`
- Apple credentials in `eas.json` (iOS)
- Google service account in `eas.json` (Android)

## Building

```bash
# Development build (internal distribution)
eas build --profile development --platform all

# Preview APK (Android)
eas build --profile preview --platform android

# Production build
eas build --profile production --platform all
```

## Project Structure

```
mobile/
├── App.tsx                     # Root component, screen navigation
├── app.json                    # Expo configuration
├── package.json                # Dependencies
├── tsconfig.json               # TypeScript configuration
├── eas.json                    # EAS Build configuration
├── babel.config.js             # Babel configuration
└── src/
    ├── theme/index.ts          # Colors, fonts, spacing (matches web app)
    ├── types/index.ts          # TypeScript type definitions
    ├── services/
    │   ├── api.ts              # API client, auth, SecureStore
    │   ├── database.ts         # SQLite offline storage
    │   └── sync.ts             # Background sync engine
    ├── hooks/
    │   ├── useAuth.ts          # Authentication state management
    │   └── useLocation.ts      # GPS location hook
    ├── components/
    │   ├── StatusBadge.tsx      # Attendance status badge
    │   └── FaceGuideOverlay.tsx # Camera face guide overlay
    ├── screens/
    │   ├── LoginScreen.tsx      # Login with ID/phone + password
    │   ├── HomeScreen.tsx       # Dashboard, today's status, quick actions
    │   ├── CaptureScreen.tsx    # Camera capture + GPS + submit
    │   ├── HistoryScreen.tsx    # Attendance submission history
    │   ├── MapScreen.tsx        # Geofence zones on Google Maps
    │   └── PrivacyScreen.tsx    # Privacy policy & data rights
    └── assets/                 # App icons, splash screen
```

## Attendance Flow

1. Worker opens app and logs in with National ID/Phone + password
2. Taps "Check In Now" on home screen
3. Camera opens with face guide overlay
4. Worker takes selfie, reviews photo
5. GPS location captured automatically
6. Submission saved to local SQLite database
7. Background sync uploads to server when online
8. Server runs verification pipeline (face match + GPS geofence check)
9. Result syncs back: verified, flagged, or pending HR review
