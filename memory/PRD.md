# TruckerMaps - LKW Routenplaner PRD

## App Name
**TruckerMaps** - EU-konformer LKW-Routenplaner

## Original Problem Statement
LKW-Routenplaner mit EU-konformer Lenk- und Ruhezeitenberechnung für Berufskraftfahrer. Die App soll wie Google Maps funktionieren, aber speziell für LKW-Fahrer.

## Was wurde implementiert ✅

### 🆕 Tachograph-Display (31.01.2025)
- [x] **Stoneridge/VDO Style Display** im Dashboard
- [x] **BLOCK 1** - Lenkzeit seit letzter Pause (max 4:30h)
- [x] **REST** - Restlenkzeit bis Pause mit Warnung
- [x] **Heute / Rest Tag / Woche** - Übersicht der Zeiten
- [x] **Arbeitszeit heute** - Orange hervorgehoben
- [x] **Warnungen** bei Grenzwerten (rot + "Pause erforderlich!")

### 🆕 Eco-Routing (31.01.2025)
- [x] **Toggle im Routenplaner** - Grün für Eco, Orange für Normal
- [x] **TomTom routeType=eco** - Kraftstoffsparende Route
- [x] **Button-Anzeige wechselt** - "🌿 Eco-Route berechnen"

### 🆕 Rastplatz-Namen (31.01.2025)
- [x] **Echte POI-Namen** via TomTom POI Search API
- [x] **Zwischenziel zeigt Namen** - z.B. "Pizzeria Venezia" statt "Früh"
- [x] **"Als Zwischenziel" Button** zeigt echten Namen

### Routenplanung
- [x] **3 Routenvorschläge** - Schnellste + 2 Alternativen
- [x] **Bis zu 7 Zwischenziele** (Waypoints)
- [x] **TomTom Truck Routing**
- [x] **Spracheingabe** für Ziel

### EU 561/2006 Compliance
- [x] **3 Fahrtunterbrechungs-Vorschläge** pro Route
- [x] **Echte Rastplätze** mit Namen und Adresse
- [x] **LKW-freundlich Kennzeichnung** 🚛

### Navigation
- [x] **Turn-by-Turn Navigation** mit TomTom Anweisungen
- [x] **Heading-Up Modus**
- [x] **Off-Route Erkennung**
- [x] **Höhere Kartenauflösung** (512px Retina)

## Anstehende Aufgaben

### P1 - Als nächstes
- [ ] UI-Design Vorschläge für Navigation

### P2 - Zu verifizieren
- [ ] Bottom Bar komplett ausblendbar (Mobile)
- [ ] Fahrtenbuch-Export verifizieren

### Backlog
- [ ] Offline-Karten
- [ ] Native iOS & Android App (PAUSIERT)

## API Endpoints

### Routing
- `POST /api/route/professional` - Mit eco_routing Parameter

### Tachograph
- `GET /api/tachograph/compliance` - Lenkzeit-Status

## Test-Ergebnisse (31.01.2025)
- **Backend:** 100% (9/9 Tests bestanden)
- **Frontend:** 100% (12/12 Features verifiziert)

## Last Updated
31.01.2025 - Tachograph-Display, Eco-Routing, echte Rastplatznamen
