const fs = require('fs');
const path = require('path');

function loadRoutes( app ) {
    fs.readdirSync(path.join(__dirname, '../routes')).forEach((file) => {
    const route = require(`../routes/${file}`);
    app.use(route);
  });
}

module.exports = loadRoutes;