import { Sequelize } from "sequelize";
import { config } from "./config.js";

const sequelize = new Sequelize(
  config.database.database,
  config.database.username,
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: config.database.dialect,
    logging: config.database.logging,
    pool: config.database.pool,
  }
);

sequelize.afterConnect(async (connection) => {
  await connection.query(`SET search_path TO primary_secondary_sales_schm, public`);
});

// Test database connection
export const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log("✓ Database connection established successfully");
    return true;
  } catch (error) {
    console.error("✗ Unable to connect to the database:", error.message);
    return false;
  }
};

export default sequelize;
