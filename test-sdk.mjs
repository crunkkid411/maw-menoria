import { create, use } from '@memvid/sdk';
import { existsSync } from 'fs';

async function test() {
  const filePath = '/tmp/test-append.mv2';

  // Create new or open existing
  let mem;
  if (existsSync(filePath)) {
    console.log('Opening existing memory...');
    mem = await use('basic', filePath);
  } else {
    console.log('Creating memory...');
    mem = await create(filePath, 'basic');
  }

  // Generate 10 docs with realistic content (like web pages)
  const docs = [];
  for (let i = 0; i < 10; i++) {
    docs.push({
      title: `Page ${i + 1} - Sample Web Page`,
      label: 'web',
      text: `# Page ${i + 1}\n\nThis is sample content for page ${i + 1}. `.repeat(50) +
            `\n\nThis is a longer document with more text to simulate real web pages.`,
      metadata: {
        url: `https://example.com/page-${i + 1}`,
        crawledAt: new Date().toISOString(),
      },
    });
  }

  console.log(`Trying putMany with ${docs.length} docs...`);
  const start = Date.now();
  try {
    const ids = await mem.putMany(docs);
    console.log('putMany() succeeded in ' + (Date.now() - start) + 'ms');
  } catch (e) {
    console.error('putMany() failed:', e.message);
  }

  // Now test find
  console.log('\nTesting find...');
  try {
    const results = await mem.find('sample content', { k: 5 });
    console.log('find() returned', results?.hits?.length || 0, 'results');
  } catch (e) {
    console.error('find() failed:', e.message);
  }

  console.log('Done');
}

test().catch(console.error);
