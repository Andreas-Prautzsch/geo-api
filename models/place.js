const { DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Stelle sicher, dass du die Sequelize-Instanz korrekt importierst

const Place = sequelize.define('Place', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    country: {
        type: DataTypes.CHAR(2),
        allowNull: true,
    },
    zipcode: {
        type: DataTypes.CHAR(5),
        allowNull: true,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    region: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    short_region: {
        type: DataTypes.CHAR(2),
        allowNull: true,
    },
    lat: {
        type: DataTypes.DECIMAL(10, 6),
        allowNull: true,
    },
    lon: {
        type: DataTypes.DECIMAL(10, 6),
        allowNull: true,
    },
}, {
    tableName: 'places',
    timestamps: true, // Erstellt die createdAt und updatedAt Spalten
});

module.exports = Place;
