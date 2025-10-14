# API-Dokumentation für Places

Diese Dokumentation beschreibt die API-Endpunkte zur Verwaltung von Places-Daten.

## Routen

### 1. Get Places by Zipcode and Radius

```
GET /api/places/{zipcode}/{radius}
```

- **Zusammenfassung**: Holt alle Places innerhalb eines bestimmten Radius von einer gegebenen Postleitzahl.
- **Parameter**:
  - `zipcode` (Pfadparameter, erforderlich): Die Postleitzahl, von der aus gesucht wird.
  - `radius` (Pfadparameter, erforderlich): Der Radius in Kilometern.
- **Antworten**:
  - **200**: Eine Liste der Places innerhalb des angegebenen Radius.
  - **404**: Ort nicht gefunden.
  - **500**: Interner Serverfehler.

### 2. Search for Places by Query

```
GET /api/search/{query}
```

- **Zusammenfassung**: Sucht nach Places anhand einer Abfrage.
- **Parameter**:
  - `query` (Pfadparameter, erforderlich): Die Suchanfrage, die eine Kombination aus PLZ und Name sein kann.
- **Antworten**:
  - **200**: Eine Liste der Places, die der Abfrage entsprechen.
  - **500**: Interner Serverfehler.

### 3. Get Place ID by Zipcode and City

```
GET /api/placeid/{zipcode}/{city}
```

- **Zusammenfassung**: Holt die ID eines Ortes anhand von Postleitzahl und Stadt.
- **Parameter**:
  - `zipcode` (Pfadparameter, erforderlich): Die Postleitzahl des Ortes.
  - `city` (Pfadparameter, erforderlich): Der Name der Stadt.
- **Antworten**:
  - **200**: Die ID des Ortes.
  - **404**: Ort nicht gefunden.
  - **500**: Interner Serverfehler.

### 4. Get Place by ID

```
GET /api/place/{id}
```

- **Zusammenfassung**: Holt die Details eines Ortes anhand seiner ID.
- **Parameter**:
  - `id` (Pfadparameter, erforderlich): Die ID des Ortes.
- **Antworten**:
  - **200**: Die Details des Ortes.
  - **404**: Ort nicht gefunden.
  - **500**: Interner Serverfehler.

### 5. Calculate Distance Between Two Places

```
GET /api/distance?from={identifier}&to={identifier}
```

- **Zusammenfassung**: Berechnet die Distanz zwischen zwei Orten (Luftlinie).
- **Parameter**:
  - `from` (Query-Parameter, erforderlich): ID, Postleitzahl **oder vollständige Adresse** des Startortes.
  - `to` (Query-Parameter, erforderlich): ID, Postleitzahl **oder vollständige Adresse** des Zielortes.
- **Antworten**:
  - **200**: Die Distanz in Kilometern sowie Informationen zu den beiden Orten bzw. Adressen.
  - **400**: Fehlende Parameter oder unvollständige Koordinaten.
  - **404**: Einer oder beide Orte konnten nicht gefunden werden.
  - **500**: Interner Serverfehler.

### 6. Calculate Driving Distance Between Two Places (OSRM)

```
GET /api/driving-distance?from={identifier}&to={identifier}
```

- **Zusammenfassung**: Berechnet die Fahrstrecke anhand eines lokalen OSRM-Backends. Unterstützt IDs, Postleitzahlen **und vollständige Adressangaben**.
- **Parameter**:
  - `from` (Query-Parameter, erforderlich): ID, Postleitzahl oder vollständige Adresse des Startortes (z. B. `Musterstraße 1, 12345 Berlin`).
  - `to` (Query-Parameter, erforderlich): ID, Postleitzahl oder vollständige Adresse des Zielortes.
- **Antworten**:
  - **200**: Fahrstrecke in Metern und Kilometern inkl. Fahrzeit und OSRM-Metadaten.
  - **400**: Fehlende Parameter oder unvollständige Koordinaten.
  - **404**: Einer oder beide Orte konnten nicht gefunden werden.
  - **502**: Fehler oder Timeout des Routing-Backends.
  - **500**: Interner Serverfehler.

## Verwendung

Stelle sicher, dass der Server läuft und die Umgebungsvariablen korrekt konfiguriert sind. Du kannst diese Endpunkte mit einem Tool wie Postman oder direkt über den Browser aufrufen (sofern es sich um GET-Anfragen handelt).

## Swagger-Dokumentation

Die Swagger-Dokumentation ist verfügbar unter: `http://localhost:3000/api-docs` (oder der entsprechende Port, den du in deiner Anwendung verwendest).

## Fahrstrecke mit OSRM vorbereiten

Die Vorbereitung der OSRM-Daten geschieht jetzt automatisch beim Start des `osrm`-Services (z. B. via Coolify oder `docker compose up`). Standardmäßig werden die Regionen Rheinland-Pfalz, Nordrhein-Westfalen und Hessen geladen, zu einer Datei zusammengeführt und anschließend verarbeitet. Du kannst das Verhalten über folgende Umgebungsvariablen anpassen:

- `OSRM_PBF_URLS` (Default: `rheinland-pfalz`, `nordrhein-westfalen`, `hessen` von Geofabrik – kommagetrennt)
- `OSRM_PBF_FILE` (Default: `germany-west.osm.pbf`)
- `OSRM_ALGORITHM` (Default: `mld`)
- `OSRM_PROFILE` (Default: `/opt/car.lua`)

Die Daten werden unter `data/osrm/` abgelegt. Existieren sie bereits, werden sie beim nächsten Deploy nicht erneut heruntergeladen oder vorbereitet.  
Der API-Server greift über `OSRM_BASE_URL` (Default: `http://osrm:5000`, Fallback `http://localhost:5000`) auf diesen Dienst zu.
Beim Start der API erscheinen im Log Einträge wie `[ServiceCheck] OSRM Routing ...`, sodass du in Coolify sofort siehst, ob der Routingdienst erreichbar ist.

## Adress-Geocoding für exakte Fahrstrecken

Out-of-the-box nutzt die API den öffentlichen Photon-Dienst von Komoot (`https://photon.komoot.io`). Du musst dafür keinen weiteren Service starten. Über `GEOCODER_BASE_URL` kannst du später jederzeit auf eine eigene Instanz (Photon/Nominatim) umschalten, falls gewünscht.

> Tipp: Coolify setzt die Services automatisch in Gang. Stelle sicher, dass das Volume-Verzeichnis (`data/`) als persistent mount konfiguriert ist, damit Downloads und Indizes nicht bei jedem Deploy verloren gehen.

> Hinweis: Der erste Start kann je nach Serverleistung 5–20 Minuten dauern, weil OSRM die ausgewählten PBF-Dateien (Standard: die drei Bundesländer aus Geofabrik) herunterlädt und aufbereitet. In den Logs siehst du Meldungen wie `Download complete` oder `Routing data ready`. Nach dem initialen Lauf werden die Dateien im Volume erkannt und übersprungen, sodass spätere Deploys deutlich schneller sind.

## Komplettes Deployment mit Docker Compose / Coolify

- `docker-compose.yml` bringt alle Services (`app`, `db`, `osrm`) in einem Stack zusammen.
- Nutze in Coolify den „Docker Compose / Stack“-Modus oder lokal `docker compose up --build`.
- Hinterlege persistente Volumes für `./data/osrm`, damit die Routingdaten erhalten bleiben.
- Optional kannst du `./data/osm-cache` als Cache für den OSRM-Download nutzen. Der Dienst kümmert sich automatisch darum, dass die Datei nur einmal heruntergeladen wird.
- Setze in der `.env` für den Compose-Betrieb `DB_HOST=db` (der Service-Name aus der Compose-Datei); alle anderen Variablen kannst du übernehmen.
- Die App kommuniziert intern per `http://osrm:5000` mit dem Routingdienst; für das Geocoding verwendet sie standardmäßig `https://photon.komoot.io`.
- Bei Bedarf kannst du `GEOCODER_BASE_URL` überschreiben, um einen eigenen Photon- oder Nominatim-Endpunkt zu verwenden.
- Der OSRM-Container nutzt das offizielle Image und ein eigenes Entry-Script; Downloads erfolgen via `curl` mit Retry-Logik.
- Über `PBF_CACHE_DIR` bzw. `OSRM_PBF_CACHE_DIR` kannst du den Speicherort des OSRM-Download-Caches steuern. Standard ist `/osm-cache`, das Compose bereits als Volume einbindet. Für mehrere Regionen werden die einzelnen PBFs dort zwischengespeichert und anschließend mit `osmium cat` zusammengeführt.
- Während des Starts protokolliert der App-Container die Erreichbarkeit aller Dienste; sobald Photon und OSRM „reachable“ melden, funktionieren Adress-Routen-Abfragen.
- Überprüfe den Fortschritt mit `docker compose logs -f osrm`; du solltest Meldungen wie `Download complete` und `Routing data ready` sehen, bevor der App-Container loslegt.

## Schnelltest mit Bruno

Nach dem erfolgreichen Deploy kannst du in Bruno (oder per Browser) folgende URL aufrufen, um sowohl Geocoder als auch OSRM zu prüfen:

```
GET http://localhost:3002/api/driving-distance?from=Alexanderplatz%201,%2010178%20Berlin&to=Marienplatz%201,%2080331%20Muenchen
```

Falls du aus Coolify heraus testest, ersetze `localhost:3002` durch die externe URL deiner Instanz. Ein erfolgreicher Response liefert u. a. `distance.kilometers`, `duration.minutes` und die aufgelösten Adressdaten.
