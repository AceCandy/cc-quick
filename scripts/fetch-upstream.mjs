import { mkdir, writeFile } from 'node:fs/promises';

const targets = [
  {
    url: 'https://cc.storyfox.cz/',
    path: 'data/upstream/storyfox.html'
  },
  {
    url: 'https://code.claude.com/docs/en/changelog',
    path: 'data/upstream/changelog.html'
  }
];

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'cc-quick-sync/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`抓取失败: ${url} -> ${response.status}`);
  }

  return response.text();
}

await mkdir('data/upstream', { recursive: true });

for (const target of targets) {
  const text = await fetchText(target.url);
  await writeFile(target.path, text, 'utf8');
}

await writeFile(
  'data/upstream/fetched-at.json',
  JSON.stringify({ fetchedAt: new Date().toISOString(), targets }, null, 2),
  'utf8'
);

console.log('已抓取上游页面');
