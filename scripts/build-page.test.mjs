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

  assert.match(
    html,
    /<section class="section section-special" data-section-panel="section-special" aria-labelledby="section-special">/
  );
  assert.match(html, /<h2 class="section-title" id="section-special">A &amp; &quot;B&quot;<\/h2>/);
  assert.match(html, /<h3 class="group-title" id="section-special-group-group-1">Group &lt;1&gt;<\/h3>/);
  assert.match(html, /<div class="group-rows">[\s\S]*<span class="key">Ctrl &lt;1&gt;<\/span>[\s\S]*<\/div>/);
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

test('renderSection 对可识别快捷键渲染 keycap，对命令保持纯文本 key', () => {
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
          },
          {
            key: 'CtrlX CtrlE',
            desc: '在编辑器中打开（别名）',
            badge: null,
            added: null
          },
          {
            key: 'Q / Esc',
            desc: '退出 transcript',
            badge: null,
            added: null
          },
          {
            key: '/clear',
            desc: '清空对话',
            badge: null,
            added: null
          }
        ]
      }
    ]
  });

  assert.match(
    html,
    /<span class="key key-chord"><span class="keycap">Ctrl<\/span><span class="keycap">C<\/span><\/span>/
  );
  assert.match(
    html,
    /<span class="key key-chord"><span class="keycap">Ctrl<\/span><span class="keycap">X<\/span><span class="key-joiner"> <\/span><span class="keycap">Ctrl<\/span><span class="keycap">E<\/span><\/span>/
  );
  assert.match(
    html,
    /<span class="key key-chord"><span class="keycap">Q<\/span><span class="key-joiner"> \/ <\/span><span class="keycap">Esc<\/span><\/span>/
  );
  assert.match(html, /<span class="key">\/clear<\/span>/);
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
  const betaIndex = html.indexOf(
    '<section class="section section-beta" data-section-panel="section-beta" aria-labelledby="section-beta">'
  );
  const alphaIndex = html.indexOf(
    '<section class="section section-alpha" data-section-panel="section-alpha" aria-labelledby="section-alpha">'
  );
  const soloIndex = html.indexOf(
    '<section class="section section-solo" data-section-panel="section-solo" aria-labelledby="section-solo">'
  );

  assert.notEqual(wrapperIndex, -1);
  assert.notEqual(betaIndex, -1);
  assert.notEqual(alphaIndex, -1);
  assert.notEqual(soloIndex, -1);
  assert.ok(wrapperIndex < betaIndex);
  assert.ok(betaIndex < alphaIndex);
  assert.ok(alphaIndex < soloIndex);
  assert.match(
    html,
    /<div class="section-alpha-beta">\s*<section class="section section-beta" data-section-panel="section-beta" aria-labelledby="section-beta">[\s\S]*<section class="section section-alpha" data-section-panel="section-alpha" aria-labelledby="section-alpha">[\s\S]*<\/section>\s*<\/div>\s*<section class="section section-solo" data-section-panel="section-solo" aria-labelledby="section-solo">/
  );
});

test('renderPage 输出 section 切换契约与 changelog 触发按钮', () => {
  const template = readFileSync(new URL('../templates/index.template.html', import.meta.url), 'utf8');
  const localized = {
    version: 'Claude Code v1.0.0',
    lastUpdated: '2026-04-01',
    changelog: ['2026-04-01 新增 section 切换契约'],
    layout: [
      {
        type: 'wrapper',
        id: 'keyboard-mcp',
        className: 'section-keyboard-mcp',
        children: ['keyboard', 'mcp']
      },
      {
        type: 'section',
        id: 'solo'
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
      },
      {
        id: 'mcp',
        className: 'section section-mcp',
        title: 'MCP',
        groups: [
          {
            title: 'General Controls',
            items: [
              {
                key: 'CtrlM',
                desc: '打开 MCP 面板',
                badge: null,
                added: null
              }
            ]
          }
        ]
      },
      {
        id: 'solo',
        className: 'section section-solo',
        title: '单项',
        groups: [
          {
            title: 'General Controls',
            items: [
              {
                key: 'CtrlS',
                desc: '打开单项',
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
  const switcherButtons = [...html.matchAll(
    /<button class="section-switcher-btn( active)?" type="button" data-section-target="([^"]+)" aria-pressed="(true|false)">([^<]+)<\/button>/g
  )];

  assert.match(html, /<a class="skip-link" href="#main-content">跳到正文<\/a>/);
  assert.doesNotMatch(html, /id="densityToggle"/);
  assert.match(
    html,
    /<span class="version-info"><span class="version-label">Claude Code<\/span><span class="version-badge">v1\.0\.0<\/span><\/span>/
  );
  assert.match(html, /<button class="changelog-trigger"[^>]*aria-controls="changelogPanel"[^>]*>/);
  assert.match(html, /<button class="changelog-trigger"[^>]*aria-expanded="false"[^>]*>/);
  assert.match(
    html,
    /<a class="github-star-link" href="https:\/\/github\.com\/AceCandy\/cc-quick" target="_blank" rel="noreferrer noopener" aria-label="在 GitHub 上为 cc-quick 点 Star">/
  );
  assert.match(
    html,
    /<div class="header-heading">[\s\S]*<h1>Claude Code 中文速查表<\/h1>[\s\S]*<div class="header-heading-actions">[\s\S]*<span>GitHub Star<\/span>[\s\S]*id="siteVisitCount"[\s\S]*<\/div>/
  );
  assert.match(
    html,
    /<header class="header">[\s\S]*<div class="changelog-panel" id="changelogPanel" hidden>[\s\S]*<\/div>[\s\S]*<\/header>/
  );
  assert.match(
    html,
    /<li><a class="changelog-link" href="https:\/\/code\.claude\.com\/docs\/en\/changelog" target="_blank" rel="noreferrer noopener">2026-04-01 新增 section 切换契约<\/a><\/li>/
  );
  assert.match(html, /<nav class="section-switcher" aria-label="速查主题切换">/);
  assert.equal(switcherButtons.length, 3);
  assert.deepEqual(
    switcherButtons.map((match) => match[2]),
    ['section-keyboard', 'section-mcp', 'section-solo']
  );
  assert.deepEqual(
    switcherButtons.map((match) => match[4]),
    ['键盘快捷键', 'MCP', '单项']
  );
  assert.equal(switcherButtons[0][3], 'true');
  assert.equal(switcherButtons[1][3], 'false');
  assert.equal(switcherButtons[2][3], 'false');
  assert.match(html, /data-section-panel="section-keyboard"/);
  assert.match(html, /data-section-panel="section-mcp"/);
  assert.match(html, /data-section-panel="section-solo"/);
  assert.match(html, /id="section-keyboard-group-general-controls"/);
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

test('模板底部包含本站访问量占位与 CounterAPI 浏览器脚本', () => {
  const template = readFileSync(new URL('../templates/index.template.html', import.meta.url), 'utf8');

  assert.match(template, /<div class="header-counter" aria-live="polite">/);
  assert.doesNotMatch(template, /footer-counter/);
  assert.match(template, /id="siteVisitCount"/);
  assert.match(template, /data-counter-namespace="cc-quick"/);
  assert.match(template, /data-counter-name="site-visits"/);
  assert.match(
    template,
    /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/counterapi@2\.1\.2\/dist\/counter\.browser\.min\.js" defer><\/script>/
  );
  assert.match(template, /<script src="\.\/script\.js" defer><\/script>/);
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

  assert.match(html, /<nav class="section-switcher" aria-label="速查主题切换">/);
  assert.match(html, /data-section-target="section-keyboard"/);
  assert.match(html, /data-section-panel="section-keyboard"/);
  assert.match(
    html,
    /<div class="section-keyboard-mcp">\s*<section class="section section-keyboard" data-section-panel="section-keyboard" aria-labelledby="section-keyboard">[\s\S]*<section class="section section-mcp" data-section-panel="section-mcp" aria-labelledby="section-mcp">[\s\S]*<\/div>/
  );
  assert.match(
    html,
    /<div class="section-slash-memory">\s*<section class="section section-slash" data-section-panel="section-slash" aria-labelledby="section-slash">[\s\S]*<section class="section section-memory" data-section-panel="section-memory" aria-labelledby="section-memory">[\s\S]*<\/div>/
  );
  assert.match(
    html,
    /<div class="section-workflows-config">\s*<section class="section section-workflows" data-section-panel="section-workflows" aria-labelledby="section-workflows">[\s\S]*<section class="section section-config" data-section-panel="section-config" aria-labelledby="section-config">[\s\S]*<\/div>/
  );
  assert.match(
    html,
    /<div class="section-skills-cli">\s*<section class="section section-skills" data-section-panel="section-skills" aria-labelledby="section-skills">[\s\S]*<section class="section section-cli" data-section-panel="section-cli" aria-labelledby="section-cli">[\s\S]*<\/div>/
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
