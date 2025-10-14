# # # Dockerfile
# Node.js als Basisimage
FROM node:18

# Arbeitsverzeichnis im Container
WORKDIR /app

# Installiere benötigte Basis-Tools (curl für Healthchecks etc.)
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*

# Kopiere package.json und package-lock.json und installiere Produktionsabhängigkeiten
COPY package*.json ./
RUN npm install --production

# Kopiere den restlichen Anwendungscode
COPY . .

# Exponiere den Port der Anwendung
EXPOSE 3002

# Standardbefehl: Migrationen & Seed ausführen und dann die App starten
CMD npx sequelize-cli db:migrate && npx sequelize-cli db:seed:all && npm start
