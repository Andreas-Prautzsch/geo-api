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
    console.warn('[Geocoder] Empty or invalid address provided');
    return null;
  }

  console.log(`[Geocoder] Starting geocoding request for address: "${trimmed}"`);
  
  const geocoderBaseUrls = buildServiceBaseUrls(process.env.GEOCODER_BASE_URL);
  console.log(`[Geocoder] Available base URLs: ${geocoderBaseUrls.join(', ')}`);

  let lastError = null;
  let attemptCount = 0;

  for (const geocoderBaseUrl of geocoderBaseUrls) {
    attemptCount++;
    
    try {
      const url = new URL('/api', geocoderBaseUrl);
      url.searchParams.set('q', trimmed);
      url.searchParams.set('limit', '1');
      url.searchParams.set('lang', 'de');

      console.log(`[Geocoder] Attempt ${attemptCount}/${geocoderBaseUrls.length} - Requesting: ${url.toString()}`);
      const startTime = Date.now();

      // Erhöhtes Timeout für Geocoding auf 30 Sekunden
      const response = await fetchWithTimeout(url, { timeout: 30_000 });
      const responseTime = Date.now() - startTime;

      console.log(`[Geocoder] Response received from ${geocoderBaseUrl} in ${responseTime}ms - Status: ${response.status}`);

      if (!response.ok) {
        const body = await response.text();
        console.error(`[Geocoder] Backend error (${geocoderBaseUrl}): ${response.status} ${response.statusText} - Response body: ${body.substring(0, 200)}`);
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        continue;
      }

      let data;
      try {
        const responseText = await response.text();
        console.log(`[Geocoder] Raw response body length: ${responseText.length} bytes`);
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error(`[Geocoder] Failed to parse JSON response from ${geocoderBaseUrl}:`, parseError.message);
        lastError = parseError;
        continue;
      }

      console.log(`[Geocoder] Parsed JSON response - Features count: ${data?.features?.length || 0}`);
      
      if (!data || typeof data !== 'object') {
        console.error(`[Geocoder] Invalid response structure from ${geocoderBaseUrl}`);
        lastError = new Error('Invalid response structure');
        continue;
      }

      const feature = data?.features?.[0];

      if (!feature?.geometry?.coordinates) {
        console.warn(`[Geocoder] No valid coordinates found in response for "${trimmed}"`);
        return null;
      }

      const [rawLon, rawLat] = feature.geometry.coordinates;
      const lat = Number(rawLat);
      const lon = Number(rawLon);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        console.error(`[Geocoder] Invalid coordinates: lat=${rawLat}, lon=${rawLon}`);
        lastError = new Error('Invalid coordinates in response');
        continue;
      }

      console.log(`[Geocoder] ✓ Successfully geocoded "${trimmed}" to [${lat}, ${lon}] via ${geocoderBaseUrl} in ${responseTime}ms`);

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
      const responseTime = Date.now() - startTime;
      lastError = error;

      if (error.name === 'AbortError') {
        console.error(`[Geocoder] ✗ Timeout after ${responseTime}ms for ${geocoderBaseUrl} - Address: "${trimmed}"`);
      } else if (error.cause?.code) {
        console.error(`[Geocoder] ✗ Network error (${error.cause.code}) for ${geocoderBaseUrl} after ${responseTime}ms - ${error.cause.hostname || ''} - Address: "${trimmed}"`);
      } else if (error.code === 'ECONNREFUSED') {
        console.error(`[Geocoder] ✗ Connection refused for ${geocoderBaseUrl} - Address: "${trimmed}"`);
      } else if (error.code === 'ENOTFOUND') {
        console.error(`[Geocoder] ✗ DNS lookup failed for ${geocoderBaseUrl} - Address: "${trimmed}"`);
      } else {
        console.error(`[Geocoder] ✗ Request failed for ${geocoderBaseUrl} after ${responseTime}ms - Error: ${error.message} - Address: "${trimmed}"`);
        console.error(`[Geocoder] Error details:`, {
          name: error.name,
          code: error.code,
          cause: error.cause,
          stack: error.stack?.split('\n').slice(0, 3).join('\n')
        });
      }
    }
  }

  if (lastError) {
    console.error(`[Geocoder] ✗✗✗ ALL GEOCODER ENDPOINTS FAILED for address "${trimmed}" - Last error: ${lastError.message}`);
  } else {
    console.log(`[Geocoder] No results found for address "${trimmed}" (not an error - address simply not in database)`);
  }

  return null;
};

const resolveLocation = async (identifier) => {
  const cleaned = identifier?.trim();

  if (!cleaned) {
    console.warn('[ResolveLocation] Empty or invalid identifier provided');
    return null;
  }

  console.log(`[ResolveLocation] Resolving location for identifier: "${cleaned}"`);

  try {
    let place = null;

    // Versuche zuerst als ID
    if (/^\d+$/.test(cleaned)) {
      console.log(`[ResolveLocation] Attempting to find place by ID: ${cleaned}`);
      try {
        place = await Place.findByPk(cleaned);
        if (place) {
          console.log(`[ResolveLocation] ✓ Found place by ID: ${place.id} - ${place.name}`);
        } else {
          console.log(`[ResolveLocation] No place found with ID: ${cleaned}`);
        }
      } catch (dbError) {
        console.error(`[ResolveLocation] Database error while searching by ID:`, dbError.message);
      }
    }

    // Versuche als Postleitzahl
    if (!place) {
      console.log(`[ResolveLocation] Attempting to find place by zipcode: ${cleaned}`);
      try {
        place = await Place.findOne({ where: { zipcode: cleaned } });
        if (place) {
          console.log(`[ResolveLocation] ✓ Found place by zipcode: ${place.zipcode} - ${place.name}`);
        } else {
          console.log(`[ResolveLocation] No place found with zipcode: ${cleaned}`);
        }
      } catch (dbError) {
        console.error(`[ResolveLocation] Database error while searching by zipcode:`, dbError.message);
      }
    }

    // Wenn in Datenbank gefunden, validiere und gib zurück
    if (place) {
      const lat = Number(place.lat);
      const lon = Number(place.lon);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        console.error(`[ResolveLocation] Invalid coordinates in database for place ${place.id}: lat=${place.lat}, lon=${place.lon}`);
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

    // Wenn nicht in Datenbank, versuche Geocoding
    console.log(`[ResolveLocation] No database match found, attempting geocoding for: "${cleaned}"`);
    const geocoded = await geocodeAddress(cleaned);
    
    if (!geocoded) {
      console.warn(`[ResolveLocation] ✗ Failed to resolve location for: "${cleaned}"`);
    }
    
    return geocoded;
  } catch (error) {
    console.error(`[ResolveLocation] Unexpected error while resolving location for "${cleaned}":`, error);
    return null;
  }
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
  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  console.log(`[DrivingDistance:${requestId}] ========== NEW REQUEST ==========`);
  console.log(`[DrivingDistance:${requestId}] From: "${from}"`);
  console.log(`[DrivingDistance:${requestId}] To: "${to}"`);

  if (!from || !to) {
    console.warn(`[DrivingDistance:${requestId}] Missing parameters`);
    return res.status(400).json({ message: 'Query parameters "from" and "to" are required.' });
  }

  const overallStartTime = Date.now();

  try {
    console.log(`[DrivingDistance:${requestId}] Step 1: Resolving locations...`);
    const startResolve = Date.now();
    
    const [fromPlace, toPlace] = await Promise.all([
      resolveLocation(from),
      resolveLocation(to),
    ]);

    const resolveTime = Date.now() - startResolve;
    console.log(`[DrivingDistance:${requestId}] Step 1 completed in ${resolveTime}ms`);

    if (!fromPlace || !toPlace) {
      console.warn(`[DrivingDistance:${requestId}] Location resolution failed - fromPlace: ${!!fromPlace}, toPlace: ${!!toPlace}`);
      return res.status(404).json({ 
        message: 'One or both places could not be found.',
        details: {
          from: fromPlace ? 'found' : 'not found',
          to: toPlace ? 'found' : 'not found'
        }
      });
    }

    console.log(`[DrivingDistance:${requestId}] Resolved locations:`);
    console.log(`[DrivingDistance:${requestId}]   From: [${fromPlace.lat}, ${fromPlace.lon}] (${fromPlace.type})`);
    console.log(`[DrivingDistance:${requestId}]   To: [${toPlace.lat}, ${toPlace.lon}] (${toPlace.type})`);

    console.log(`[DrivingDistance:${requestId}] Step 2: Calling OSRM routing service...`);
    const osrmBaseUrls = buildServiceBaseUrls(process.env.OSRM_BASE_URL, [
      'http://osrm:5000',
      'http://localhost:5000',
    ]);

    console.log(`[DrivingDistance:${requestId}] Available OSRM URLs: ${osrmBaseUrls.join(', ')}`);

    let lastError = null;
    let attemptCount = 0;

    for (const osrmBaseUrl of osrmBaseUrls) {
      attemptCount++;
      const coordinates = `${fromPlace.lon},${fromPlace.lat};${toPlace.lon},${toPlace.lat}`;
      const url = new URL(`/route/v1/driving/${coordinates}`, osrmBaseUrl);
      url.searchParams.set('overview', 'false');
      url.searchParams.set('alternatives', 'false');
      url.searchParams.set('steps', 'false');
      url.searchParams.set('geometries', 'geojson');

      console.log(`[DrivingDistance:${requestId}] OSRM attempt ${attemptCount}/${osrmBaseUrls.length} - URL: ${url.toString()}`);
      const startTime = Date.now();

      try {
        const response = await fetchWithTimeout(url, { timeout: 15_000 });
        const responseTime = Date.now() - startTime;

        console.log(`[DrivingDistance:${requestId}] OSRM response received from ${osrmBaseUrl} in ${responseTime}ms - Status: ${response.status}`);

        if (!response.ok) {
          const body = await response.text();
          console.error(`[DrivingDistance:${requestId}] OSRM backend error (${osrmBaseUrl}): ${response.status} - ${body.substring(0, 200)}`);
          lastError = new Error(`OSRM backend error: ${response.status}`);
          continue;
        }

        const payload = await response.json();

        if (!payload.routes || payload.routes.length === 0) {
          console.error(`[DrivingDistance:${requestId}] No routes returned by OSRM - Code: ${payload.code}, Message: ${payload.message || 'N/A'}`);
          lastError = new Error('OSRM backend did not return a route.');
          continue;
        }

        const route = payload.routes[0];
        const distanceKm = route.distance / 1000;
        const durationMinutes = route.duration / 60;

        console.log(`[DrivingDistance:${requestId}] ✓ Successfully calculated route via ${osrmBaseUrl} - Distance: ${distanceKm.toFixed(2)}km, Duration: ${durationMinutes.toFixed(1)}min, Response time: ${responseTime}ms`);

        const overallTime = Date.now() - overallStartTime;
        console.log(`[DrivingDistance:${requestId}] Overall processing time: ${overallTime}ms`);

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
        const responseTime = Date.now() - startTime;
        lastError = error;
        
        if (error.name === 'AbortError') {
          console.error(`[DrivingDistance:${requestId}] ✗ OSRM timeout after ${responseTime}ms for ${osrmBaseUrl}`);
        } else if (error.cause?.code) {
          console.error(`[DrivingDistance:${requestId}] ✗ OSRM network error (${error.cause.code}) for ${osrmBaseUrl} after ${responseTime}ms - ${error.cause.hostname || ''}`);
        } else {
          console.error(`[DrivingDistance:${requestId}] ✗ OSRM request failed for ${osrmBaseUrl} after ${responseTime}ms - Error: ${error.message}`, error.stack);
        }
      }
    }

    const overallTime = Date.now() - overallStartTime;
    console.log(`[DrivingDistance:${requestId}] Overall processing time: ${overallTime}ms`);

    if (lastError) {
      console.error(`[DrivingDistance:${requestId}] ✗✗✗ ALL OSRM ENDPOINTS FAILED - Last error: ${lastError.message}`);
      return res.status(502).json({ message: lastError.message || 'Routing backend error' });
    }

    console.error(`[DrivingDistance:${requestId}] ✗✗✗ No OSRM endpoints available`);
    return res.status(502).json({ message: 'Routing backend error' });
  } catch (error) {
    const overallTime = Date.now() - overallStartTime;
    console.log(`[DrivingDistance:${requestId}] Overall processing time: ${overallTime}ms`);
    
    if (error.name === 'AbortError') {
      console.error(`[DrivingDistance:${requestId}] ✗ Request timeout - Error: ${error.message}`);
      return res.status(502).json({ message: 'Routing backend timeout' });
    }

    console.error(`[DrivingDistance:${requestId}] ✗ Unexpected error:`, error);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
