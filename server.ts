import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveSourceRunConfig, startServer } from './src/server/createServer.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = resolveSourceRunConfig(process.env, __dirname);

startServer(config)
  .then((running) => {
    console.log(`FMD2 Studio server running at http://${running.host}:${running.port}`);
  })
  .catch((err) => {
    console.error('FMD2 Studio server failed to start:', err);
    process.exit(1);
  });
