import { Sequelize } from "sequelize";
import { config } from "./config.js";

const normalizeSql = (sql) => String(sql).replace(/\s+/g, " ").trim();

const createLimiter = (maxConcurrency) => {
  let activeCount = 0;
  const queue = [];

  const runNext = () => {
    if (activeCount >= maxConcurrency || queue.length === 0) {
      return;
    }

    const { task, resolve, reject } = queue.shift();
    activeCount += 1;

    Promise.resolve()
      .then(task)
      .then(resolve, reject)
      .finally(() => {
        activeCount -= 1;
        runNext();
      });
  };

  return (task) =>
    new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      runNext();
    });
};

const sequelize = new Sequelize(
  config.database.database,
  config.database.username,
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: config.database.dialect,
    logging: config.database.logging,
    dialectOptions: config.database.dialectOptions,
    pool: config.database.pool,
  }
);

const limitQuery = createLimiter(config.query.concurrency);
const originalQuery = sequelize.query.bind(sequelize);

sequelize.query = async (sql, options = {}) => {
  const queuedAt = Date.now();

  return limitQuery(async () => {
    const startedAt = Date.now();

    try {
      return await originalQuery(sql, options);
    } finally {
      const executionMs = Date.now() - startedAt;
      const queuedMs = startedAt - queuedAt;

      if (config.query.slowQueryMs > 0 && executionMs >= config.query.slowQueryMs) {
        console.warn(
          `[db] slow query execution=${executionMs}ms queued=${queuedMs}ms sql="${normalizeSql(sql).slice(0, 240)}"`
        );
      }
    }
  });
};

console.log(
  `[db] pool max=${config.database.pool.max}, min=${config.database.pool.min}, query concurrency=${config.query.concurrency}`
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
