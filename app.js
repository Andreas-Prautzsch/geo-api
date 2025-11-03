const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const helmet = require('helmet');
const cors = require( 'cors' );
const { URL } = require('url');

const parseCorsOrigins = (value) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const app = express();
const loadRoutes = require('./helper/loadRoutes');
const { fetchWithTimeout, buildServiceBaseUrls, ensureTrailingSlash } = require('./helper/httpUtils');
require('dotenv').config();

const port = process.env.PORT || 3002;

const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
  ? parseCorsOrigins(process.env.CORS_ALLOWED_ORIGINS)
  : ['*'];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
};

app.use(cors(corsOptions));
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

// Health endpoint for container checks
app.get('/', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Lade alle Routen automatisch
loadRoutes(app);

const checkExternalServices = async () => {
  const checks = [
    {
      name: 'Photon Geocoder',
      buildUrls: () =>
        buildServiceBaseUrls(process.env.GEOCODER_BASE_URL),
      buildRequest: (base) => {
        const url = new URL('/api', base);
        url.searchParams.set('q', 'Berlin');
        url.searchParams.set('limit', '1');
        url.searchParams.set('lang', 'de');
        return { url, options: { timeout: 5000 } };
      },
      onSuccess: (base) => {
        console.log(`[ServiceCheck] Photon Geocoder reachable via ${base}`);
      },
      onFailure: (base, reason) => {
        console.warn(`[ServiceCheck] Photon Geocoder failed via ${base}: ${reason}`);
      },
      onCompleteFailure: () => {
        console.error('[ServiceCheck] Photon Geocoder unavailable across all configured endpoints.');
      },
    },
    {
      name: 'OSRM Routing',
      buildUrls: () =>
        buildServiceBaseUrls(process.env.OSRM_BASE_URL, [
          'http://osrm:5000',
          'http://localhost:5000',
        ]),
      buildRequest: (base) => {
        const coordinates = '13.404954,52.520008;13.38886,52.517037'; // short Berlin sanity route
        const normalizedBase = ensureTrailingSlash(base);
        const url = new URL(`route/v1/driving/${coordinates}`, normalizedBase);
        url.searchParams.set('overview', 'false');
        url.searchParams.set('alternatives', 'false');
        url.searchParams.set('steps', 'false');
        url.searchParams.set('geometries', 'geojson');
        return { url, options: { timeout: 5000 } };
      },
      onSuccess: (base) => {
        console.log(`[ServiceCheck] OSRM Routing reachable via ${base}`);
      },
      onFailure: (base, reason) => {
        console.warn(`[ServiceCheck] OSRM Routing failed via ${base}: ${reason}`);
      },
      onCompleteFailure: () => {
        console.error('[ServiceCheck] OSRM Routing unavailable across all configured endpoints.');
      },
    },
  ];

  for (const check of checks) {
    const bases = check.buildUrls();
    let success = false;

    for (const base of bases) {
      try {
        const { url, options } = check.buildRequest(base);
        const response = await fetchWithTimeout(url, options);

        if (!response.ok) {
          const body = await response.text();
          check.onFailure(base, `${response.status} ${response.statusText} - ${body}`);
          continue;
        }

        check.onSuccess(base);
        success = true;
        break;
      } catch (error) {
        const reason =
          error.name === 'AbortError'
            ? 'timeout'
            : error.cause?.code
              ? `${error.cause.code} ${error.cause.hostname || ''}`.trim()
              : error.message;
        check.onFailure(base, reason);
      }
    }

    if (!success && typeof check.onCompleteFailure === 'function') {
      check.onCompleteFailure();
    }
  }
};

// Server starten
app.listen(port, () => {
  console.log(`App running on port ${port}`);
  checkExternalServices().catch((error) => {
    console.error('[ServiceCheck] Unexpected error while probing external services:', error);
  });
});
