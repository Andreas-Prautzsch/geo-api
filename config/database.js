const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME || 'geo-api-db',
  process.env.DB_USER || 'geo-api-usr',
  process.env.DB_PASS || 'password',
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: process.env.DB_LOGGING === 'true' ? console.log : false,
    
    // Connection Pool Settings - WICHTIG!
    pool: {
      max: 10,              // Reduziert von default 5
      min: 2,               // Mindestens 2 Connections
      acquire: 30000,       // Max Zeit um Connection zu bekommen
      idle: 10000,          // Connection wird nach 10s Idle geschlossen
      evict: 5000,          // Prüfe alle 5s auf idle connections
    },
    
    // Retry Logic
    retry: {
      max: 3,
      timeout: 3000,
    },
    
    // Timeouts
    dialectOptions: {
      connectTimeout: 10000,
      statement_timeout: 30000,  // Query timeout
      idle_in_transaction_session_timeout: 30000,
    },
    
    // Besseres Error Handling
    define: {
      timestamps: false,
      freezeTableName: true,
    },
  }
);

// Test connection on startup
sequelize.authenticate()
  .then(() => {
    console.log('[Database] Connection established successfully');
    console.log(`[Database] Pool: max=${sequelize.config.pool.max}, min=${sequelize.config.pool.min}`);
  })
  .catch(err => {
    console.error('[Database] Unable to connect:', err);
  });

// Monitor connection pool
setInterval(() => {
  const pool = sequelize.connectionManager.pool;
  if (pool) {
    console.log(`[Database] Pool status - Size: ${pool.size}, Available: ${pool.available}, Pending: ${pool.pending}`);
  }
}, 60000); // Alle 60 Sekunden

module.exports = sequelize;