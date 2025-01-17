# # # Dockerfile
# Node.js als Basisimage
FROM node:18

# Arbeitsverzeichnis im Container
WORKDIR /app

# Kopiere package.json und package-lock.json und installiere Produktionsabhängigkeiten
COPY package*.json ./
RUN npm install --production

# Kopiere den restlichen Anwendungscode
COPY . .

# Exponiere den Port der Anwendung
EXPOSE 3002

# Standardbefehl: Migrationen ausführen und dann die App starten
CMD npx sequelize-cli db:migrate && npm start