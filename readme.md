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

## Verwendung

Stelle sicher, dass der Server läuft und die Umgebungsvariablen korrekt konfiguriert sind. Du kannst diese Endpunkte mit einem Tool wie Postman oder direkt über den Browser aufrufen (sofern es sich um GET-Anfragen handelt).

## Swagger-Dokumentation

Die Swagger-Dokumentation ist verfügbar unter: `http://localhost:3000/api-docs` (oder der entsprechende Port, den du in deiner Anwendung verwendest).
