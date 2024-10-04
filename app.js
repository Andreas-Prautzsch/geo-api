const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const helmet = require('helmet');
const cors = require( 'cors' );

const app = express();
const loadRoutes = require('./helper/loadRoutes');
require('dotenv').config();

const port = process.env.PORT || 3002;

app.use(cors());
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],  // Vermeidet unsafe-eval
        imgSrc: ["'self'", "data:"],
        styleSrc: ["'self'", "'unsafe-inline'"],  // Erlaubt Inline-Styles, falls notwendig
        connectSrc: ["'self'", "http://localhost:3000"],  // Erlaubt Verbindungen von deiner Nuxt.js App
        frameAncestors: ["'self'"],  // Verhindert Clickjacking-Angriffe
      },
    },
  })
);

app.use('/api-docs', helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-eval'"],  // unsafe-eval nur für Swagger UI erlauben
      styleSrc: ["'self'", "'unsafe-inline'"],  // Erlaubt Swagger UI, Inline-Styles zu verwenden
      imgSrc: ["'self'", "data:"],
    },
  },
}));

// Swagger Set up
const swaggerOptions = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'Express API',
      version: '1.0.0',
      description: 'API Dokumentation',
    },
    servers: [
      {
        url: `http://localhost:${port}`,
      },
    ],
  },
  apis: ['./routes/*.js'], // Pfad zu den Routen-Dateien, in denen die Swagger-Kommentare stehen
};

if (process.env.NODE_ENV === 'development') {
  const swaggerDocs = swaggerJsdoc(swaggerOptions);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));
}

// Middleware
app.use( express.json() );

// Lade alle Routen automatisch
loadRoutes(app);

// Server starten
app.listen(port, () => {
  console.log(`App running on port ${port}`);
});