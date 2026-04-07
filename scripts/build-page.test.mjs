import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { badgeHtml, escapeHtml, renderPage, renderSection } from './build-page.mjs';
import { parsePage } from './parse-upstream.mjs';
import { transformUpstream } from './transform-content.mjs';

function makeSection(id, title, className = `section section-${id}`, desc = `${title} desc`) {
  return {
    id,
    className,
    title,
    groups: [
      {
        title: `${title} group`,
        items: [
          {
            key: `${title} key`,
            desc,
            badge: null,
            added: null
          }
        ]
      }
    ]
  };
}

test('escapeHtml 转义 HTML 特殊字符', () => {
  assert.equal(escapeHtml(`a & b < c > "d"`), 'a &amp; b &lt; c &gt; &quot;d&quot;');
});

test('badgeHtml 只在 badge 存在时输出徽标', () => {
  assert.equal(badgeHtml({ badge: null }), '');
  assert.equal(
    badgeHtml({ badge: 'NEW', added: '2026-04-01' }),
    '<span class="badge-new" data-added="2026-04-01">NEW</span>'
  );
});

test('renderSection 使用 section.className 并渲染 badge', () => {
  const html = renderSection({
    id: 'special',
    className: 'section section-special',
    title: 'A & "B"',
    groups: [
      {
        title: 'Group <1>',
        items: [
          {
            key: 'Ctrl <1>',
            desc: 'Use > now & then',
            badge: 'NEW',
            added: '2026-04-01'
          }
        ]
      }
    ]
  });

  assert.match(html, /<section class="section section-special" aria-labelledby="section-special">/);
  assert.match(html, /<h2 class="section-title" id="section-special">A &amp; &quot;B&quot;<\/h2>/);
  assert.match(html, /<h3 class="group-title" id="section-special-group-group-1">Group &lt;1&gt;<\/h3>/);
  assert.match(html, /<span class="key">Ctrl &lt;1&gt;<\/span>/);
  assert.match(html, /<span class="badge-new" data-added="2026-04-01">NEW<\/span>/);
});

test('renderSection 输出语义标题和稳定锚点', () => {
  const html = renderSection({
    id: 'keyboard',
    className: 'section section-keyboard',
    title: '⌨️ 键盘快捷键',
    groups: [
      {
        title: 'General Controls',
        items: [
          {
            key: 'CtrlC',
            desc: '取消当前输入或生成',
            badge: null,
            added: null
          }
        ]
      }
    ]
  });

  assert.match(html, /<section class="section section-keyboard"[^>]*>/);
  assert.match(html, /<h2 class="section-title" id="section-keyboard">⌨️ 键盘快捷键<\/h2>/);
  assert.match(html, /<h3 class="group-title" id="section-keyboard-group-general-controls">General Controls<\/h3>/);
});

test('renderPage 按 layout 渲染 wrapper、section 顺序和 standalone', () => {
  const template = '<main>{{SECTIONS_HTML}}</main>';
  const localized = {
    version: '1.0.0',
    lastUpdated: '2026-04-01',
    changelog: [],
    layout: [
      {
        type: 'wrapper',
        id: 'alpha-beta',
        className: 'section-alpha-beta',
        children: ['beta', 'alpha']
      },
      {
        type: 'section',
        id: 'solo',
        className: 'section section-solo',
        title: 'Solo'
      }
    ],
    sections: [
      makeSection('solo', 'Solo', 'section section-solo', 'Solo desc'),
      makeSection('beta', 'Beta', 'section section-beta', 'Beta desc'),
      makeSection('alpha', 'Alpha', 'section section-alpha', 'Alpha desc')
    ]
  };

  const html = renderPage(template, localized);
  const wrapperIndex = html.indexOf('<div class="section-alpha-beta">');
  const betaIndex = html.indexOf('<section class="section section-beta" aria-labelledby="section-beta">');
  const alphaIndex = html.indexOf('<section class="section section-alpha" aria-labelledby="section-alpha">');
  const soloIndex = html.indexOf('<section class="section section-solo" aria-labelledby="section-solo">');

  assert.notEqual(wrapperIndex, -1);
  assert.notEqual(betaIndex, -1);
  assert.notEqual(alphaIndex, -1);
  assert.notEqual(soloIndex, -1);
  assert.ok(wrapperIndex < betaIndex);
  assert.ok(betaIndex < alphaIndex);
  assert.ok(alphaIndex < soloIndex);
  assert.match(
    html,
    /<div class="section-alpha-beta">\s*<section class="section section-beta" aria-labelledby="section-beta">[\s\S]*<section class="section section-alpha" aria-labelledby="section-alpha">[\s\S]*<\/section>\s*<\/div>\s*<section class="section section-solo" aria-labelledby="section-solo">/
  );
});

test('renderPage 输出 skip link、目录和附录容器', () => {
  const template = `
    <a class="skip-link" href="#main-content">跳到正文</a>
    <div class="page-shell">
      <aside class="page-sidebar">{{NAV_HTML}}</aside>
      <main id="main-content">{{SECTIONS_HTML}}</main>
    </div>
    <section class="appendix" aria-labelledby="appendix-title">
      <h2 id="appendix-title">附录</h2>
      {{FOOTER_HTML}}
    </section>
  `;
  const localized = {
    version: '1.0.0',
    lastUpdated: '2026-04-01',
    changelog: [],
    layout: [
      {
        type: 'section',
        id: 'keyboard'
      }
    ],
    sections: [
      {
        id: 'keyboard',
        className: 'section section-keyboard',
        title: '键盘快捷键',
        groups: [
          {
            title: 'General Controls',
            items: [
              {
                key: 'CtrlC',
                desc: '取消当前输入或生成',
                badge: null,
                added: null
              }
            ]
          }
        ]
      }
    ],
    footer: [
      {
        label: '权限模式',
        items: [
          {
            code: 'default',
            desc: '每次提示'
          }
        ]
      }
    ]
  };

  const html = renderPage(template, localized);

  assert.match(html, /<a class="skip-link" href="#main-content">跳到正文<\/a>/);
  assert.match(html, /<nav class="page-nav" aria-label="页面目录">/);
  assert.match(html, /<a class="page-nav-link" href="#section-keyboard">键盘快捷键<\/a>/);
  assert.match(html, /<a class="page-nav-sublink" href="#section-keyboard-group-general-controls">General Controls<\/a>/);
  assert.match(html, /<section class="appendix" aria-labelledby="appendix-title">/);
});

test('renderPage 遇到缺失的 section id 会抛出显式错误', () => {
  const template = '<main>{{SECTIONS_HTML}}</main>';
  const localized = {
    version: '1.0.0',
    lastUpdated: '2026-04-01',
    changelog: [],
    layout: [
      {
        type: 'wrapper',
        id: 'alpha-beta',
        className: 'section-alpha-beta',
        children: ['alpha', 'missing']
      }
    ],
    sections: [makeSection('alpha', 'Alpha', 'section section-alpha')]
  };

  assert.throws(() => renderPage(template, localized), /layout.*missing/);
});

test('renderPage 渲染结构化 footer 并保留本地说明行', () => {
  const template = `
    <footer class="footer">
      {{FOOTER_HTML}}
      <div class="footer-row">
        <span class="footer-item">页面由上游内容自动同步生成；未命中词表时默认保留原文。</span>
      </div>
    </footer>
  `;
  const localized = {
    version: '1.0.0',
    lastUpdated: '2026-04-01',
    changelog: [],
    layout: [],
    sections: [],
    footer: [
      {
        label: '权限模式',
        items: [
          {
            code: 'default',
            desc: '每次提示'
          },
          {
            code: '--dangerously-skip-permissions',
            desc: 'CLI 参数'
          }
        ]
      },
      {
        label: '关键环境变量',
        items: [
          {
            code: 'CLAUDE_STREAM_IDLE_TIMEOUT_MS',
            desc: '（默认 90 秒）'
          },
          {
            code: 'ANTHROPIC_API_KEY',
            desc: ''
          }
        ]
      }
    ]
  };

  const html = renderPage(template, localized);

  assert.match(html, /<span class="footer-label">权限模式:<\/span>/);
  assert.match(html, /<span class="footer-item"><code>default<\/code> 每次提示<\/span>/);
  assert.match(html, /<span class="footer-item"><code>--dangerously-skip-permissions<\/code> CLI 参数<\/span>/);
  assert.match(html, /<span class="footer-label">关键环境变量:<\/span>/);
  assert.match(html, /<span class="footer-item"><code>CLAUDE_STREAM_IDLE_TIMEOUT_MS<\/code> （默认 90 秒）<\/span>/);
  assert.match(html, /<span class="footer-item"><code>ANTHROPIC_API_KEY<\/code><\/span>/);
  assert.match(html, /页面由上游内容自动同步生成；未命中词表时默认保留原文。/);
});

test('renderPage 使用真实 upstream fixture 保留全部 wrapper 分组', () => {
  const upstreamHtml = readFileSync(new URL('../data/upstream/storyfox.html', import.meta.url), 'utf8');
  const template = readFileSync(new URL('../templates/index.template.html', import.meta.url), 'utf8');
  const sectionMap = JSON.parse(readFileSync(new URL('../data/config/section-map.json', import.meta.url), 'utf8'));
  const itemMap = JSON.parse(readFileSync(new URL('../data/config/item-map.json', import.meta.url), 'utf8'));
  const terms = JSON.parse(readFileSync(new URL('../data/config/terms.json', import.meta.url), 'utf8'));
  const upstream = parsePage(upstreamHtml);
  const { localized } = transformUpstream(upstream, { sectionMap, itemMap, terms });

  const html = renderPage(template, localized);

  assert.match(
    html,
    /<nav class="page-nav" aria-label="页面目录">[\s\S]*<a class="page-nav-link" href="#section-keyboard">⌨️ 键盘快捷键<\/a>/
  );
  assert.match(
    html,
    /<div class="section-keyboard-mcp">\s*<section class="section section-keyboard" aria-labelledby="section-keyboard">[\s\S]*<section class="section section-mcp" aria-labelledby="section-mcp">[\s\S]*<\/div>/
  );
  assert.match(
    html,
    /<div class="section-slash-memory">\s*<section class="section section-slash" aria-labelledby="section-slash">[\s\S]*<section class="section section-memory" aria-labelledby="section-memory">[\s\S]*<\/div>/
  );
  assert.match(
    html,
    /<div class="section-workflows-config">\s*<section class="section section-workflows" aria-labelledby="section-workflows">[\s\S]*<section class="section section-config" aria-labelledby="section-config">[\s\S]*<\/div>/
  );
  assert.match(
    html,
    /<div class="section-skills-cli">\s*<section class="section section-skills" aria-labelledby="section-skills">[\s\S]*<section class="section section-cli" aria-labelledby="section-cli">[\s\S]*<\/div>/
  );
  assert.match(html, /<span class="footer-label">权限模式:<\/span>/);
  assert.match(html, /<span class="footer-item"><code>default<\/code> 每次提示<\/span>/);
  assert.match(html, /<span class="footer-label">关键环境变量:<\/span>/);
  assert.match(html, /<span class="footer-item"><code>CLAUDE_CODE_MAX_OUTPUT_TOKENS<\/code> （默认 32K）<\/span>/);
});

test('renderPage 使用真实模板时，正文先于目录输出且 OS 切换有可见标签', () => {
  const upstreamHtml = readFileSync(new URL('../data/upstream/storyfox.html', import.meta.url), 'utf8');
  const template = readFileSync(new URL('../templates/index.template.html', import.meta.url), 'utf8');
  const sectionMap = JSON.parse(readFileSync(new URL('../data/config/section-map.json', import.meta.url), 'utf8'));
  const itemMap = JSON.parse(readFileSync(new URL('../data/config/item-map.json', import.meta.url), 'utf8'));
  const terms = JSON.parse(readFileSync(new URL('../data/config/terms.json', import.meta.url), 'utf8'));
  const upstream = parsePage(upstreamHtml);
  const { localized } = transformUpstream(upstream, { sectionMap, itemMap, terms });

  const html = renderPage(template, localized);
  const mainIndex = html.indexOf('<main id="main-content" class="page-content">');
  const sidebarIndex = html.indexOf('<aside class="page-sidebar">');

  assert.notEqual(mainIndex, -1);
  assert.notEqual(sidebarIndex, -1);
  assert.ok(mainIndex < sidebarIndex);
  assert.match(html, /<button class="os-btn active"[^>]*>[\s\S]*<span class="os-btn-label">Mac<\/span>/);
  assert.match(html, /<button class="os-btn"[^>]*>[\s\S]*<span class="os-btn-label">Win<\/span>/);
  assert.doesNotMatch(html, /onclick=/);
});
