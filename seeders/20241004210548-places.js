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
                id: Number(place.id),
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

            if (places.length === 0) {
                console.log(`Keine Datensätze in ${file}, übersprungen.`);
                continue;
            }

            const ids = places.map(place => place.id);

            const existing = await queryInterface.sequelize.query(
                'SELECT id FROM "places" WHERE id IN (:ids)',
                {
                    replacements: { ids },
                    type: Sequelize.QueryTypes.SELECT,
                }
            );

            const existingIds = new Set(existing.map(row => Number(row.id)));
            const newPlaces = places.filter(place => !existingIds.has(Number(place.id)));

            if (newPlaces.length === 0) {
                console.log(`Übersprungen (bereits vorhanden): ${file}`);
                continue;
            }

            await queryInterface.bulkInsert('places', newPlaces, {});
            console.log(`Importiert: ${file} (${newPlaces.length} neue Datensätze)`);
        }
    },

    down: async (queryInterface, Sequelize) => {
        // Entferne die Daten aus der Tabelle
        await queryInterface.bulkDelete('places', null, {});
    }
};
