const { Sequelize } = require('sequelize');
require('dotenv').config(); // Lädt die Umgebungsvariablen aus der .env-Datei

// Erstellen der Sequelize-Instanz
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres',
} );

module.exports = sequelize;