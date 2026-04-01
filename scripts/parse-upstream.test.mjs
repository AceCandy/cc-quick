import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeText, parsePage } from './parse-upstream.mjs';

test('normalizeText collapses whitespace', () => {
  assert.equal(normalizeText('  hello\n  world \t  '), 'hello world');
});

test('parsePage preserves wrapper layout and section fields', () => {
  const html = `
    <div class="version-info">v1</div>
    <div class="last-updated">today</div>
    <ul class="changelog-list"><li>entry</li></ul>
    <main class="main-grid">
      <div class="section-alpha-beta">
        <section class="section section-alpha">
          <div class="section-header">Alpha</div>
          <div class="section-content">
            <div class="sub-header">Group A</div>
            <div class="row">
              <span class="key">Alpha Key</span>
              <span class="desc">Alpha first</span>
            </div>
            <div class="row">
              <span class="key">Beta Key</span>
              <span class="desc">Alpha second <span class="badge-new" data-added="2026-03-31">NEW</span></span>
            </div>
          </div>
        </section>
        <section class="section section-beta">
          <div class="section-header">Beta</div>
          <div class="section-content">
            <div class="sub-header">Group B</div>
            <div class="row">
              <span class="key">Gamma Key</span>
              <span class="desc">Beta first</span>
            </div>
          </div>
        </section>
      </div>
      <div class="section-gamma-delta">
        <section class="section section-gamma">
          <div class="section-header">Gamma</div>
          <div class="section-content">
            <div class="sub-header">Group C</div>
            <div class="row">
              <span class="key">Delta Key</span>
              <span class="desc">Gamma first</span>
            </div>
          </div>
        </section>
        <section class="section section-delta">
          <div class="section-header">Delta</div>
          <div class="section-content">
            <div class="sub-header">Group D</div>
            <div class="row">
              <span class="key">Epsilon Key</span>
              <span class="desc">Delta first</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  `;

  const parsed = parsePage(html);

  assert.deepEqual(parsed.layout, [
    {
      type: 'wrapper',
      id: 'alpha-beta',
      className: 'section-alpha-beta',
      children: ['alpha', 'beta']
    },
    {
      type: 'wrapper',
      id: 'gamma-delta',
      className: 'section-gamma-delta',
      children: ['gamma', 'delta']
    }
  ]);

  assert.deepEqual(parsed.sections.map(({ id }) => id), ['alpha', 'beta', 'gamma', 'delta']);
  assert.deepEqual(parsed.sections[0], {
    id: 'alpha',
    className: 'section section-alpha',
    title: 'Alpha',
    groups: [
      {
        title: 'Group A',
        items: [
          {
            key: 'Alpha Key',
            desc: 'Alpha first',
            badge: null,
            added: null
          },
          {
            key: 'Beta Key',
            desc: 'Alpha second',
            badge: 'NEW',
            added: '2026-03-31'
          }
        ]
      }
    ]
  });
});

test('parsePage falls back to title-based ids for standalone sections', () => {
  const html = `
    <div class="version-info">v1</div>
    <div class="last-updated">today</div>
    <ul class="changelog-list"><li>entry</li></ul>
    <main class="main-grid">
      <section class="section">
        <div class="section-header">Standalone Title</div>
        <div class="section-content">
          <div class="sub-header">Only Group</div>
          <div class="row">
            <span class="key">Single Key</span>
            <span class="desc">Single desc</span>
          </div>
        </div>
      </section>
    </main>
  `;

  const parsed = parsePage(html);

  assert.deepEqual(parsed.layout, [
    {
      type: 'section',
      id: 'standalone-title',
      className: 'section',
      title: 'Standalone Title'
    }
  ]);
  assert.deepEqual(parsed.sections[0], {
    id: 'standalone-title',
    className: 'section',
    title: 'Standalone Title',
    groups: [
      {
        title: 'Only Group',
        items: [
          {
            key: 'Single Key',
            desc: 'Single desc',
            badge: null,
            added: null
          }
        ]
      }
    ]
  });
});

test('parsePage 遇到缺失 main-grid 会显式报错', () => {
  const html = `
    <div class="version-info">v1</div>
    <div class="last-updated">today</div>
    <ul class="changelog-list"><li>entry</li></ul>
  `;

  assert.throws(() => parsePage(html), /main-grid/);
});

test('parsePage 遇到缺失 version-info 会显式报错', () => {
  const html = `
    <div class="last-updated">today</div>
    <ul class="changelog-list"><li>entry</li></ul>
    <main class="main-grid"></main>
  `;

  assert.throws(() => parsePage(html), /version-info/);
});

test('parsePage 遇到缺失 last-updated 会显式报错', () => {
  const html = `
    <div class="version-info">v1</div>
    <ul class="changelog-list"><li>entry</li></ul>
    <main class="main-grid"></main>
  `;

  assert.throws(() => parsePage(html), /last-updated/);
});

test('parsePage 遇到缺失 changelog-list 会显式报错', () => {
  const html = `
    <div class="version-info">v1</div>
    <div class="last-updated">today</div>
    <main class="main-grid"></main>
  `;

  assert.throws(() => parsePage(html), /changelog-list/);
});

test('parsePage 遇到缺失 section-content 的 section 会显式报错', () => {
  const html = `
    <div class="version-info">v1</div>
    <div class="last-updated">today</div>
    <ul class="changelog-list"><li>entry</li></ul>
    <main class="main-grid">
      <section class="section section-broken">
        <div class="section-header">Broken</div>
      </section>
    </main>
  `;

  assert.throws(() => parsePage(html), /section-content/);
});

test('parsePage 遇到不受支持的 main-grid 子节点会显式报错', () => {
  const html = `
    <div class="version-info">v1</div>
    <div class="last-updated">today</div>
    <ul class="changelog-list"><li>entry</li></ul>
    <main class="main-grid">
      <div class="unexpected-block">
        <div>orphan content</div>
      </div>
    </main>
  `;

  assert.throws(() => parsePage(html), /main-grid.*unexpected-block/);
});

test('parsePage 遇到 section-content 内未知节点会显式报错', () => {
  const html = `
    <div class="version-info">v1</div>
    <div class="last-updated">today</div>
    <ul class="changelog-list"><li>entry</li></ul>
    <main class="main-grid">
      <section class="section section-broken">
        <div class="section-header">Broken</div>
        <div class="section-content">
          <div class="unexpected-node">orphan</div>
        </div>
      </section>
    </main>
  `;

  assert.throws(() => parsePage(html), /section-content.*unexpected-node/);
});

test('parsePage 使用真实 upstream fixture 保留 wrapper 分组', () => {
  const upstreamHtml = readFileSync(new URL('../data/upstream/storyfox.html', import.meta.url), 'utf8');

  const parsed = parsePage(upstreamHtml);

  assert.deepEqual(parsed.layout.slice(0, 4), [
    {
      type: 'wrapper',
      id: 'keyboard-mcp',
      className: 'section-keyboard-mcp',
      children: ['keyboard', 'mcp']
    },
    {
      type: 'wrapper',
      id: 'slash-memory',
      className: 'section-slash-memory',
      children: ['slash', 'memory']
    },
    {
      type: 'wrapper',
      id: 'workflows-config',
      className: 'section-workflows-config',
      children: ['workflows', 'config']
    },
    {
      type: 'wrapper',
      id: 'skills-cli',
      className: 'section-skills-cli',
      children: ['skills', 'cli']
    }
  ]);
});
