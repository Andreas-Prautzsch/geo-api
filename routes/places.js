const express = require('express');
const { Op, Sequelize } = require('sequelize');
const Place = require('../models/place'); // Assuming you have a Place model defined
require('dotenv').config(); // Load environment variables from .env file

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

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

module.exports = router;