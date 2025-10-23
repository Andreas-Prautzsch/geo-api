const express = require('express');
const { URL } = require('url');
const { Op, Sequelize } = require('sequelize');
const Place = require('../models/place'); // Assuming you have a Place model defined
const { fetchWithTimeout, buildServiceBaseUrls } = require('../helper/httpUtils');
require('dotenv').config(); // Load environment variables from .env file

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

const geocodeAddress = async (address) => {
  const trimmed = address?.trim();

  if (!trimmed) {
    return null;
  }

  const geocoderBaseUrls = buildServiceBaseUrls(process.env.GEOCODER_BASE_URL);

  let lastError = null;

  for (const geocoderBaseUrl of geocoderBaseUrls) {
    const url = new URL('/api', geocoderBaseUrl);
    url.searchParams.set('q', trimmed);
    url.searchParams.set('limit', '1');
    url.searchParams.set('lang', 'de');

    try {
      const response = await fetchWithTimeout(url, { timeout: 10_000 });

      if (!response.ok) {
        const body = await response.text();
        console.error(`Geocoder backend error (${geocoderBaseUrl}): ${response.status} - ${body}`);
        continue;
      }

      const data = await response.json();
      const feature = data?.features?.[0];

      if (!feature?.geometry?.coordinates) {
        return null;
      }

      const [rawLon, rawLat] = feature.geometry.coordinates;
      const lat = Number(rawLat);
      const lon = Number(rawLon);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
      }

      return {
        type: 'geocoded',
        label: feature.properties?.label || trimmed,
        lat,
        lon,
        details: {
          street: feature.properties?.street,
          housenumber: feature.properties?.housenumber,
          postcode: feature.properties?.postcode,
          city: feature.properties?.city || feature.properties?.locality,
          state: feature.properties?.state,
          country: feature.properties?.country,
        },
        raw: feature,
      };
    } catch (error) {
      lastError = error;

      if (error.name === 'AbortError') {
        console.error(`Geocoder backend timeout (${geocoderBaseUrl})`, error);
      } else {
        console.error(`Geocoder request failed via ${geocoderBaseUrl}`, error);
      }
    }
  }

  if (lastError) {
    console.error('Geocoder request failed for all configured base URLs.');
  }

  return null;
};

const resolveLocation = async (identifier) => {
  const cleaned = identifier?.trim();

  if (!cleaned) {
    return null;
  }

  let place = null;

  if (/^\d+$/.test(cleaned)) {
    place = await Place.findByPk(cleaned);
  }

  if (!place) {
    place = await Place.findOne({ where: { zipcode: cleaned } });
  }

  if (place) {
    const lat = Number(place.lat);
    const lon = Number(place.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }

    return {
      type: 'place',
      id: place.id,
      zipcode: place.zipcode,
      name: place.name,
      lat,
      lon,
    };
  }

  return geocodeAddress(cleaned);
};

const formatLocationResponse = (location, fallbackLabel) => {
  if (!location) {
    return null;
  }

  if (location.type === 'place') {
    return {
      type: 'database',
      id: location.id,
      zipcode: location.zipcode,
      name: location.name,
      label: `${location.zipcode || ''} ${location.name || ''}`.trim() || fallbackLabel,
      lat: location.lat,
      lon: location.lon,
    };
  }

  return {
    type: 'geocoded',
    label: location.label || fallbackLabel,
    lat: location.lat,
    lon: location.lon,
    details: location.details,
  };
};

/**
 * @swagger
 * tags:
 *   - name: "Places"
 *     description: "Endpoints for managing places"
 */

/**
 * @swagger
 * /api/places/{zipcode}/{radius}:
 *   get:
 *     summary: Get places within a radius from a given zipcode
 *     tags:
 *       - "Places"
 *     parameters:
 *       - name: zipcode
 *         in: path
 *         required: true
 *         description: The zipcode to search from
 *         schema:
 *           type: string
 *       - name: radius
 *         in: path
 *         required: true
 *         description: The radius in kilometers
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: A list of places within the specified radius
 *       404:
 *         description: Place not found
 *       500:
 *         description: Internal Server Error
 */
router.get('/api/places/:zipcode/:radius', async (req, res) => {
  const { zipcode, radius } = req.params;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
      const place = await Place.findOne({ where: { zipcode } });

      if (!place) {
          return res.status(404).send('Place not found');
      }

      const { lat, lon } = place;

      const places = await Place.findAll({
          attributes: [
              'name', 
              'zipcode', 
              [Sequelize.literal(`(6371 * acos(cos(radians(${lat})) * cos(radians(lat)) * cos(radians(lon) - radians(${lon})) + sin(radians(${lat})) * sin(radians(lat))))`), 'distance']
          ],
          where: Sequelize.where(
              Sequelize.literal(`(6371 * acos(cos(radians(${lat})) * cos(radians(lat)) * cos(radians(lon) - radians(${lon})) + sin(radians(${lat})) * sin(radians(lat))))`),
              '<',
              radius
          ),
          order: Sequelize.literal('distance')
      });

      res.setHeader('Content-Type', 'application/json');
      res.json(places);
  } catch (error) {
      console.error(error);
      res.status(500).send('Internal Server Error');
  }
});

/**
 * @swagger
 * /api/search/{query}:
 *   get:
 *     summary: Search for places by query
 *     tags:
 *       - "Places"
 *     parameters:
 *       - name: query
 *         in: path
 *         required: true
 *         description: The search query
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A list of places matching the query
 *       500:
 *         description: Internal Server Error
 */
router.get('/api/search/:query', async (req, res) => {
  const { query } = req.params;

  try {
      let whereClause;

      if (/\d+\s+.+/.test(query)) {
          const [zipcode, ...nameParts] = query.split(' ');
          const name = nameParts.join(' ');
          whereClause = {
              zipcode,
              name: { [Op.like]: `%${name}%` }
          };
      } else {
          whereClause = {
              [Op.or]: [
                  { name: { [Op.like]: `%${query}%` } },
                  { zipcode: { [Op.like]: `%${query}%` } }
              ]
          };
      }

      const results = await Place.findAll({ where: whereClause });
      res.json(results);
  } catch (error) {
      console.error(error);
      res.status(500).send('Internal Server Error');
  }
});

/**
 * @swagger
 * /api/placeid/{zipcode}/{city}:
 *   get:
 *     summary: Get place ID by zipcode and city
 *     tags:
 *       - "Places"
 *     parameters:
 *       - name: zipcode
 *         in: path
 *         required: true
 *         description: The zipcode of the place
 *         schema:
 *           type: string
 *       - name: city
 *         in: path
 *         required: true
 *         description: The city name
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The place ID
 *       404:
 *         description: Place not found
 *       500:
 *         description: Internal Server Error
 */
router.get('/api/placeid/:zipcode/:city', async (req, res) => {
  const { zipcode, city } = req.params;

  try {
      const result = await Place.findOne({
          where: {
              zipcode,
              name: decodeURIComponent(city)
          }
      });

      if (!result) {
          return res.status(404).send('Place not found');
      }

      res.json(result);
  } catch (error) {
      console.error(error);
      res.status(500).send('Internal Server Error');
  }
});

/**
 * @swagger
 * /api/place/{id}:
 *   get:
 *     summary: Get place by ID
 *     tags:
 *       - "Places"
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the place
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The place details
 *       404:
 *         description: Place not found
 *       500:
 *         description: Internal Server Error
 */
router.get('/api/place/:id', async (req, res) => {
  const { id } = req.params;

  try {
      const place = await Place.findByPk(id);

      if (!place) {
          return res.status(404).send('Place not found');
      }

      res.json(place);
  } catch (error) {
      console.error(error);
      res.status(500).send('Internal Server Error');
  }
});

/**
 * @swagger
 * /api/distance:
 *   get:
 *     summary: Calculate the distance between two places
 *     tags:
 *       - "Places"
 *     parameters:
 *       - name: from
 *         in: query
 *         required: true
 *         description: Identifier of the origin place (ID, zipcode, or full address)
 *         schema:
 *           type: string
 *       - name: to
 *         in: query
 *         required: true
 *         description: Identifier of the destination place (ID, zipcode, or full address)
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The distance information in kilometers
 *       400:
 *         description: Missing parameters or invalid coordinates
 *       404:
 *         description: One or both places not found
 *       500:
 *         description: Internal Server Error
 */
router.get('/api/distance', async (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
      return res.status(400).json({ message: 'Query parameters "from" and "to" are required.' });
  }

  const toRadians = (value) => (value * Math.PI) / 180;

  try {
      const [fromPlace, toPlace] = await Promise.all([
        resolveLocation(from),
        resolveLocation(to),
      ]);

      if (!fromPlace || !toPlace) {
          return res.status(404).json({ message: 'One or both places could not be found.' });
      }

      const { lat: lat1, lon: lon1 } = fromPlace;
      const { lat: lat2, lon: lon2 } = toPlace;

      const earthRadiusKm = 6371;
      const dLat = toRadians(lat2 - lat1);
      const dLon = toRadians(lon2 - lon1);

      const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);

      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = earthRadiusKm * c;

      res.json({
          from: formatLocationResponse(fromPlace, from),
          to: formatLocationResponse(toPlace, to),
          distanceKm: Number(distance.toFixed(2))
      });
  } catch (error) {
      console.error(error);
      res.status(500).send('Internal Server Error');
  }
});

/**
 * @swagger
 * /api/driving-distance:
 *   get:
 *     summary: Calculate the driving distance between two places
 *     description: Uses an OSRM backend (car profile) to compute the driving route between two points.
 *     tags:
 *       - "Places"
 *     parameters:
 *       - name: from
 *         in: query
 *         required: true
 *         description: Identifier of the origin place (ID, zipcode, or full address)
 *         schema:
 *           type: string
 *       - name: to
 *         in: query
 *         required: true
 *         description: Identifier of the destination place (ID, zipcode, or full address)
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: The driving distance information in meters and kilometers
 *       400:
 *         description: Missing parameters or invalid coordinates
 *       404:
 *         description: One or both places not found
 *       502:
 *         description: Routing backend error
 *       500:
 *         description: Internal Server Error
 */
router.get('/api/driving-distance', async (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({ message: 'Query parameters "from" and "to" are required.' });
  }

  try {
    const [fromPlace, toPlace] = await Promise.all([
      resolveLocation(from),
      resolveLocation(to),
    ]);

    if (!fromPlace || !toPlace) {
      return res.status(404).json({ message: 'One or both places could not be found.' });
    }

    const osrmBaseUrls = buildServiceBaseUrls(process.env.OSRM_BASE_URL, [
      'http://osrm:5000',
      'http://localhost:5000',
    ]);

    let lastError = null;

    for (const osrmBaseUrl of osrmBaseUrls) {
      const coordinates = `${fromPlace.lon},${fromPlace.lat};${toPlace.lon},${toPlace.lat}`;
      const url = new URL(`/route/v1/driving/${coordinates}`, osrmBaseUrl);
      url.searchParams.set('overview', 'false');
      url.searchParams.set('alternatives', 'false');
      url.searchParams.set('steps', 'false');
      url.searchParams.set('geometries', 'geojson');

      try {
        const response = await fetchWithTimeout(url, { timeout: 15_000 });

        if (!response.ok) {
          const body = await response.text();
          console.error(`OSRM backend error (${osrmBaseUrl}): ${response.status} - ${body}`);
          lastError = new Error(`OSRM backend error: ${response.status}`);
          continue;
        }

        const payload = await response.json();

        if (!payload.routes || payload.routes.length === 0) {
          lastError = new Error('OSRM backend did not return a route.');
          continue;
        }

        const route = payload.routes[0];
        const distanceKm = route.distance / 1000;
        const durationMinutes = route.duration / 60;

        return res.json({
          from: formatLocationResponse(fromPlace, from),
          to: formatLocationResponse(toPlace, to),
          distance: {
            meters: Math.round(route.distance),
            kilometers: Number(distanceKm.toFixed(3)),
          },
          duration: {
            seconds: Math.round(route.duration),
            minutes: Number(durationMinutes.toFixed(1)),
          },
          geometry: route.geometry,
          osrm: {
            code: payload.code,
            waypoints: payload.waypoints,
          },
        });
      } catch (error) {
        lastError = error;
        if (error.name === 'AbortError') {
          console.error(`OSRM backend timeout (${osrmBaseUrl})`, error);
        } else {
          console.error(`OSRM request failed via ${osrmBaseUrl}`, error);
        }
      }
    }

    if (lastError) {
      return res.status(502).json({ message: lastError.message || 'Routing backend error' });
    }

    return res.status(502).json({ message: 'Routing backend error' });
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('OSRM backend timeout', error);
      return res.status(502).json({ message: 'Routing backend timeout' });
    }

    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
