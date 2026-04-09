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

test('parsePage 解析 footer 中带 label 的结构化条目', () => {
  const html = `
    <div class="version-info">v1</div>
    <div class="last-updated">today</div>
    <ul class="changelog-list"><li>entry</li></ul>
    <main class="main-grid"></main>
    <footer class="footer">
      <div class="footer-row">
        <span class="footer-label">Permission Modes:</span>
        <span class="footer-item"><code>default</code> prompts</span>
        <span class="footer-sep">·</span>
        <span class="footer-item"><code>acceptEdits</code> auto-accept edits</span>
      </div>
      <div class="footer-row">
        <span class="footer-label">Key Env Vars:</span>
        <span class="footer-item"><code>ANTHROPIC_API_KEY</code></span>
        <span class="footer-sep">·</span>
        <span class="footer-item"><code>CLAUDE_STREAM_IDLE_TIMEOUT_MS</code> (def 90s)</span>
      </div>
      <div class="footer-row">
        <span class="footer-item">Static note should be ignored</span>
      </div>
    </footer>
  `;

  const parsed = parsePage(html);

  assert.deepEqual(parsed.footer, [
    {
      label: 'Permission Modes',
      items: [
        {
          code: 'default',
          desc: 'prompts'
        },
        {
          code: 'acceptEdits',
          desc: 'auto-accept edits'
        }
      ]
    },
    {
      label: 'Key Env Vars',
      items: [
        {
          code: 'ANTHROPIC_API_KEY',
          desc: ''
        },
        {
          code: 'CLAUDE_STREAM_IDLE_TIMEOUT_MS',
          desc: '(def 90s)'
        }
      ]
    }
  ]);
});

test('parsePage 合并连续两行的 key-only 与 desc-only 条目', () => {
  const html = `
    <div class="version-info">v1</div>
    <div class="last-updated">today</div>
    <ul class="changelog-list"><li>entry</li></ul>
    <main class="main-grid">
      <section class="section section-memory">
        <div class="section-header">Memory</div>
        <div class="section-content">
          <div class="sub-header">Auto Memory</div>
          <div class="row"><span class="key">~/.claude/projects/&lt;proj&gt;/memory/</span></div>
          <div class="row"><span class="desc">MEMORY.md + topic files, auto-loaded (25KB/200 lines max)</span></div>
        </div>
      </section>
    </main>
  `;

  const parsed = parsePage(html);

  assert.deepEqual(parsed.sections[0].groups[0].items, [
    {
      key: '~/.claude/projects/<proj>/memory/',
      desc: 'MEMORY.md + topic files, auto-loaded (25KB/200 lines max)',
      badge: null,
      added: null
    }
  ]);
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
  assert.deepEqual(parsed.footer, [
    {
      label: 'Permission Modes',
      items: [
        { code: 'default', desc: 'prompts' },
        { code: 'acceptEdits', desc: 'auto-accept edits' },
        { code: 'plan', desc: 'read-only' },
        { code: 'dontAsk', desc: 'deny unless allowed' },
        { code: 'bypassPermissions', desc: 'skip all' },
        { code: '--dangerously-skip-permissions', desc: 'CLI flag' }
      ]
    },
    {
      label: 'Key Env Vars',
      items: [
        { code: 'ANTHROPIC_API_KEY', desc: '' },
        { code: 'ANTHROPIC_MODEL', desc: '' },
        { code: 'CLAUDE_CODE_EFFORT_LEVEL', desc: '(low/medium/high/max/auto)' },
        { code: 'MAX_THINKING_TOKENS', desc: '(0=off)' },
        { code: 'CLAUDE_CODE_MAX_OUTPUT_TOKENS', desc: '(def 32K)' },
        { code: 'CLAUDE_CODE_DISABLE_CRON', desc: '' },
        { code: 'CLAUDE_CODE_SUBPROCESS_ENV_SCRUB', desc: '(strip creds)' },
        { code: 'CLAUDE_STREAM_IDLE_TIMEOUT_MS', desc: '(def 90s)' },
        { code: 'CLAUDE_CODE_NO_FLICKER', desc: '(alt-screen)' }
      ]
    }
  ]);
});
