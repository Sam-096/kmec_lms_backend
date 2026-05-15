const { sequelize, testConnection } = require('../config/database');
require('../models'); // Load all models

const syncDatabase = async () => {
  try {
    await testConnection();
    
    console.log('🔄 Syncing database...');
    
    // force: true will drop tables if they exist
    // alter: true will update tables without dropping
    await sequelize.sync({ alter: true });
    
    console.log('✅ Database synced successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database sync failed:', error);
    process.exit(1);
  }
};

syncDatabase();
