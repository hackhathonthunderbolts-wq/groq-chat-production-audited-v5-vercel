import { app, pool, PORT } from './app.js';

const server = app.listen(PORT, '0.0.0.0', () => console.log(`Production server listening on port ${PORT}`));

const shutdown = async signal => {
  console.log(`${signal}: shutting down`);
  server.close(async () => {
    if (pool) await pool.end();
    process.exit(0);
  });
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
