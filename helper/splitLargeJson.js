const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'places.json'); // Pfad zur großen JSON-Datei
const outputDir = path.join(__dirname, '..', 'places'); // Verzeichnis, in dem die Chunks gespeichert werden
const chunkSize = 10000; // Anzahl der Datensätze pro Datei

// Erstelle das Ausgabeverzeichnis, falls es nicht existiert
if (!fs.existsSync(outputDir)){
    fs.mkdirSync(outputDir);
}

fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) throw err;

    // Entferne zusätzliche Zeilenumbrüche und Leerzeichen
    const cleanedData = data.trim();

    // Parse die Daten direkt, ohne sie in ein zusätzliches Array zu setzen
    const records = JSON.parse(cleanedData); // Array erstellen

    let chunkIndex = 0;

    while (chunkIndex * chunkSize < records.length) {
        const chunk = records.slice(chunkIndex * chunkSize, (chunkIndex + 1) * chunkSize);
        fs.writeFileSync(`${outputDir}/places_chunk_${chunkIndex + 1}.json`, JSON.stringify(chunk, null, 2));
        chunkIndex++;
    }

    console.log('Datei in Chunks aufgeteilt.');
});
