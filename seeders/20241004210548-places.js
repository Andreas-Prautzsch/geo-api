'use strict';
const fs = require('fs');
const path = require('path');

module.exports = {
    up: async (queryInterface, Sequelize) => {
        const directoryPath = path.join(__dirname, '..' ,'places'); // Pfad zum Verzeichnis mit den Chunks

        const files = fs.readdirSync(directoryPath).filter(file => file.endsWith('.json'));

        for (const file of files) {
            const filePath = path.join(directoryPath, file);
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

            const places = data.map(place => ({
                id: place.id,
                country: place.country,
                zipcode: place.zipcode,
                name: place.name,
                region: place.region,
                short_region: place.short_region,
                lat: parseFloat(place.lat),
                lon: parseFloat(place.lon),
                createdAt: new Date(),
                updatedAt: new Date(),
            }));

            // Füge die Daten zur Tabelle hinzu
            await queryInterface.bulkInsert('places', places, {});
            console.log(`Importiert: ${file}`);
        }
    },

    down: async (queryInterface, Sequelize) => {
        // Entferne die Daten aus der Tabelle
        await queryInterface.bulkDelete('places', null, {});
    }
};
