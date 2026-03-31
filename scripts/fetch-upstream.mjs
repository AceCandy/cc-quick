import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const targets = [
  {
    url: 'https://cc.storyfox.cz/',
    path: 'data/upstream/storyfox.html'
  },
  {
    url: 'https://code.claude.com/docs/en/changelog',
    path: 'data/upstream/changelog.html'
  }
];

export function buildFetchUrl(url, timestamp = Date.now()) {
  const requestUrl = new URL(url);
  requestUrl.searchParams.set('__ccquick_ts', String(timestamp));
  return requestUrl.toString();
}

export async function fetchText(url, { fetchImpl = fetch, timestamp = Date.now() } = {}) {
  const response = await fetchImpl(buildFetchUrl(url, timestamp), {
    cache: 'no-store',
    headers: {
      'cache-control': 'no-cache, no-store, max-age=0',
      pragma: 'no-cache',
      'user-agent': 'cc-quick-sync/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`抓取失败: ${url} -> ${response.status}`);
  }

  return response.text();
}

export async function main({ fetchImpl = fetch, now = () => Date.now() } = {}) {
  const runTimestamp = now();

  await mkdir('data/upstream', { recursive: true });

  // 每次运行都强制绕过缓存，确保 Actions 抓到的是上游当前页面。
  for (const target of targets) {
    const text = await fetchText(target.url, { fetchImpl, timestamp: runTimestamp });
    await writeFile(target.path, text, 'utf8');
  }

  await writeFile(
    'data/upstream/fetched-at.json',
    JSON.stringify({ fetchedAt: new Date(runTimestamp).toISOString(), targets }, null, 2),
    'utf8'
  );

  console.log('已抓取上游页面');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
