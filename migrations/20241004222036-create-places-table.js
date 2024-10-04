'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        await queryInterface.createTable('places', {
            id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                autoIncrement: true,
                primaryKey: true,
            },
            country: {
                type: Sequelize.CHAR(2),
                allowNull: true,
            },
            zipcode: {
                type: Sequelize.CHAR(5),
                allowNull: true,
            },
            name: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            region: {
                type: Sequelize.STRING(255),
                allowNull: true,
            },
            short_region: {
                type: Sequelize.CHAR(2),
                allowNull: true,
            },
            lat: {
                type: Sequelize.DECIMAL(10, 6),
                allowNull: true,
            },
            lon: {
                type: Sequelize.DECIMAL(10, 6),
                allowNull: true,
            },
            createdAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.fn('now'),
            },
            updatedAt: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.fn('now'),
            },
        });
    },

    down: async (queryInterface, Sequelize) => {
        await queryInterface.dropTable('places');
    },
};
