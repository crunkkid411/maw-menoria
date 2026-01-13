import { FetchEngine } from './src/engine/fetch.js';
import { isBlocked } from './src/engine/detector.js';

async function test() {
  const engine = new FetchEngine();

  console.log('Fetching CNN directly...');
  const start = Date.now();

  try {
    const result = await engine.fetch('https://www.cnn.com', { timeout: 15000 });
    console.log(`Fetched in ${Date.now() - start}ms`);
    console.log('Status:', result.statusCode);
    console.log('HTML size:', result.html.length);
    console.log('Final URL:', result.finalUrl);

    const blocked = isBlocked(result.html, result.statusCode, result.finalUrl);
    console.log('Blocked:', blocked.blocked, blocked.reason);
    console.log('First 500 chars:', result.html.slice(0, 500));
  } catch (e) {
    console.error('Error:', e);
  }
}

test();
