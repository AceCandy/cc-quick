import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFetchUrl, fetchText } from './fetch-upstream.mjs';

test('buildFetchUrl 保留原有查询参数并追加时间戳', () => {
  assert.equal(
    buildFetchUrl('https://cc.storyfox.cz/?lang=zh', 1711843200000),
    'https://cc.storyfox.cz/?lang=zh&__ccquick_ts=1711843200000'
  );
});

test('fetchText 使用 no-store 抓取并发送去缓存请求头', async () => {
  let capturedUrl = '';
  let capturedOptions = null;

  const fetchImpl = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return new Response('<html></html>', { status: 200 });
  };

  const text = await fetchText('https://cc.storyfox.cz/', {
    fetchImpl,
    timestamp: 1711843200000
  });

  assert.equal(text, '<html></html>');
  assert.equal(capturedUrl, 'https://cc.storyfox.cz/?__ccquick_ts=1711843200000');
  assert.equal(capturedOptions.cache, 'no-store');
  assert.equal(capturedOptions.headers['cache-control'], 'no-cache, no-store, max-age=0');
  assert.equal(capturedOptions.headers.pragma, 'no-cache');
  assert.equal(capturedOptions.headers['user-agent'], 'cc-quick-sync/1.0');
});

test('fetchText 报错时保留原始 URL', async () => {
  const fetchImpl = async () => new Response('bad gateway', { status: 502 });

  await assert.rejects(
    () =>
      fetchText('https://code.claude.com/docs/en/changelog', {
        fetchImpl,
        timestamp: 1711843200000
      }),
    /抓取失败: https:\/\/code\.claude\.com\/docs\/en\/changelog -> 502/
  );
});
