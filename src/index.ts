import { app } from './app.js';
import { config } from './config/index.js';

const server = app.listen(config.port, () => {
  console.log(`🚀 NovaHCM Enterprise API is running on http://localhost:${config.port}`);
  console.log(`📊 Health check available at http://localhost:${config.port}/health`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});
