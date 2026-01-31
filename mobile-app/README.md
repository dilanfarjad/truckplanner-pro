# TruckerMaps Mobile App

## So testen Sie die App auf Ihrem iPhone

### Methode 1: Expo Go App (Empfohlen - KEINE Installation nötig)

1. **Expo Go App herunterladen**
   - Öffnen Sie den App Store auf Ihrem iPhone
   - Suchen Sie nach "Expo Go"
   - Installieren Sie die App (kostenlos)

2. **QR-Code scannen oder Link öffnen**
   - Öffnen Sie Safari auf Ihrem iPhone
   - Gehen Sie zu: `exp://exp.host/@anonymous/truckermaps`
   - ODER scannen Sie den QR-Code in der Expo Go App

3. **Alternative: Direkt im Browser testen**
   - Öffnen Sie Safari: https://logisticspro-18.preview.emergentagent.com
   - Tippen Sie auf "Teilen" → "Zum Home-Bildschirm"
   - Die App erscheint als Icon auf Ihrem Home-Bildschirm!

### Methode 2: PWA installieren (Am einfachsten!)

1. Öffnen Sie **Safari** auf Ihrem iPhone
2. Gehen Sie zu: **https://logisticspro-18.preview.emergentagent.com**
3. Tippen Sie auf das **Teilen-Symbol** (Quadrat mit Pfeil ↑)
4. Scrollen Sie und tippen Sie auf **"Zum Home-Bildschirm"**
5. Benennen Sie die App "TruckerMaps"
6. Tippen Sie auf **"Hinzufügen"**

Die App ist jetzt auf Ihrem Home-Bildschirm und öffnet sich wie eine normale App - ohne Safari-Leiste!

## Funktionen der mobilen App

- ✅ Vollbild-Modus (keine Browser-Leiste)
- ✅ GPS/Standort-Zugriff
- ✅ Push-Benachrichtigungen
- ✅ Offline-Caching
- ✅ Turn-by-Turn Navigation
- ✅ Sprache Deutsch/Englisch

## Für Entwickler: Native App bauen

Falls Sie eine echte native App im App Store veröffentlichen möchten:

```bash
cd /app/mobile-app
npm install
npx expo prebuild
npx expo build:ios
```

Dies erfordert ein Apple Developer Konto ($99/Jahr).
