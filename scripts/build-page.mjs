import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function escapeHtml(value = '') {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function badgeHtml(item = {}) {
  if (!item.badge) {
    return '';
  }
  return `<span class="badge-new" data-added="${escapeHtml(item.added || '')}">${escapeHtml(item.badge)}</span>`;
}

const CHANGELOG_URL = 'https://code.claude.com/docs/en/changelog';

const KEYCAP_TOKENS = new Set([
  'Ctrl',
  'Shift',
  'Alt',
  'Esc',
  'Tab',
  'Enter',
  'Space',
  '⇧',
  '⌥',
  '↑↓',
  '←→',
  '/',
  '!',
  '@',
  '\\'
]);

function tokenizeChord(chord = '') {
  let remaining = String(chord ?? '').trim();
  if (!remaining) {
    return [];
  }

  if (remaining === 'EscEsc') {
    return ['Esc', 'Esc'];
  }

  if (remaining === '\\Enter') {
    return ['\\', 'Enter'];
  }

  const tokens = [];
  while (remaining) {
    if (remaining.startsWith('\\') && remaining !== '\\') {
      tokens.push('\\');
      remaining = remaining.slice(1);
      continue;
    }

    const prefix = ['Ctrl', 'Shift', 'Alt', 'Esc', '⇧', '⌥'].find(
      (candidate) => remaining.startsWith(candidate) && remaining !== candidate
    );
    if (prefix) {
      tokens.push(prefix);
      remaining = remaining.slice(prefix.length);
      continue;
    }

    if (remaining.startsWith('Space') && remaining !== 'Space') {
      tokens.push('Space');
      remaining = remaining.slice('Space'.length);
      continue;
    }

    tokens.push(remaining);
    remaining = '';
  }

  return tokens.filter(Boolean);
}

function areKeycapTokens(tokens = []) {
  return tokens.every((token) => KEYCAP_TOKENS.has(token) || /^[A-Z]$/.test(token));
}

function parseKeyParts(keyText = '') {
  const value = String(keyText ?? '').trim();
  if (!value) {
    return null;
  }

  if (/^\/\S+/.test(value) || /^--/.test(value) || /[.:~"]/u.test(value) || value.includes('<')) {
    return null;
  }

  if (value === 'Space (hold)') {
    return [
      { type: 'token', value: 'Space' },
      { type: 'text', value: ' (hold)' }
    ];
  }

  if (value.includes(' / ')) {
    const segments = value.split(' / ');
    const parts = [];
    for (const [index, segment] of segments.entries()) {
      const tokens = tokenizeChord(segment);
      if (!tokens.length || !areKeycapTokens(tokens)) {
        return null;
      }
      for (const token of tokens) {
        parts.push({ type: 'token', value: token });
      }
      if (index < segments.length - 1) {
        parts.push({ type: 'text', value: ' / ' });
      }
    }
    return parts;
  }

  const chords = value.split(' ');
  if (chords.length > 1) {
    const parts = [];
    for (const [index, chord] of chords.entries()) {
      const tokens = tokenizeChord(chord);
      if (!tokens.length || !areKeycapTokens(tokens)) {
        return null;
      }
      for (const token of tokens) {
        parts.push({ type: 'token', value: token });
      }
      if (index < chords.length - 1) {
        parts.push({ type: 'text', value: ' ' });
      }
    }
    return parts;
  }

  const tokens = tokenizeChord(value);
  if (!tokens.length || !areKeycapTokens(tokens)) {
    return null;
  }

  return tokens.map((token) => ({ type: 'token', value: token }));
}

function renderKey(keyText = '') {
  const parts = parseKeyParts(keyText);
  if (!parts) {
    return `<span class="key">${escapeHtml(keyText)}</span>`;
  }

  const innerHtml = parts
    .map((part) => {
      if (part.type === 'text') {
        return `<span class="key-joiner">${escapeHtml(part.value)}</span>`;
      }
      return `<span class="keycap">${escapeHtml(part.value)}</span>`;
    })
    .join('');

  return `<span class="key key-chord">${innerHtml}</span>`;
}

function slugify(value = '') {
  const normalized = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'item';
}

function sectionAnchorId(section) {
  return `section-${slugify(section.id || section.title || 'section')}`;
}

function groupAnchorId(section, group, index) {
  return `${sectionAnchorId(section)}-group-${slugify(group.title || `group-${index + 1}`)}`;
}

function renderFooterItem(item) {
  const descHtml = item.desc ? ` ${escapeHtml(item.desc)}` : '';
  return `<span class="footer-item"><code>${escapeHtml(item.code)}</code>${descHtml}</span>`;
}

function renderFooter(localized) {
  return (localized.footer ?? [])
    .map((row) => {
      const items = (row.items ?? []).map((item) => renderFooterItem(item)).join('\n        <span class="footer-sep">·</span>\n        ');
      if (!items) {
        return '';
      }
      return `<div class="footer-row">\n        <span class="footer-label">${escapeHtml(row.label)}:</span>\n        ${items}\n      </div>`;
    })
    .filter(Boolean)
    .join('\n\n      ');
}

function renderVersionInfo(versionText = '') {
  const value = String(versionText ?? '').trim();
  if (!value) {
    return '';
  }

  const match = value.match(/^(.*?)(v\d+(?:\.\d+)+)$/i);
  if (!match) {
    return `<span class="version-label">${escapeHtml(value)}</span>`;
  }

  const label = match[1].trim();
  const version = match[2].trim();
  const labelHtml = label ? `<span class="version-label">${escapeHtml(label)}</span>` : '';
  return `${labelHtml}<span class="version-badge">${escapeHtml(version)}</span>`;
}

function resolveSection(sectionMap, sectionId) {
  const section = sectionMap.get(sectionId);
  if (!section) {
    throw new Error(`layout 引用了不存在的 section: ${sectionId}`);
  }
  return section;
}

function collectOrderedSections(layout, sectionMap) {
  return layout.flatMap((layoutItem) => {
    if (layoutItem.type === 'wrapper') {
      return (layoutItem.children ?? []).map((sectionId) => resolveSection(sectionMap, sectionId));
    }

    if (layoutItem.type === 'section') {
      return [resolveSection(sectionMap, layoutItem.id)];
    }

    throw new Error(`不支持的 layout 类型: ${layoutItem.type}`);
  });
}

function renderSectionSwitcher(orderedSections) {
  const items = orderedSections
    .map((section, index) => {
      const sectionId = sectionAnchorId(section);
      const isActive = index === 0;
      return `<li class="section-switcher-item"><button class="section-switcher-btn${isActive ? ' active' : ''}" type="button" data-section-target="${escapeHtml(sectionId)}" aria-pressed="${isActive ? 'true' : 'false'}">${escapeHtml(section.title)}</button></li>`;
    })
    .join('\n        ');

  return `<nav class="section-switcher" aria-label="速查主题切换"><ul class="section-switcher-list">${items}</ul></nav>`;
}

export function renderSection(section) {
  const groupsHtml = (section.groups ?? [])
    .map((group, index) => {
      const groupTitle = group.title
        ? `<h3 class="group-title" id="${escapeHtml(groupAnchorId(section, group, index))}">${escapeHtml(group.title)}</h3>`
        : '';
      const rowsHtml = (group.items ?? [])
        .map((item) => {
          const descHtml = item.desc ? ` <span class="desc">${escapeHtml(item.desc)}${badgeHtml(item)}</span>` : '';
          return `<div class="row">${renderKey(item.key)}${descHtml}</div>`;
        })
        .join('\n            ');
      return `<section class="section-group">\n              ${groupTitle}\n              <div class="group-rows">\n                ${rowsHtml}\n              </div>\n            </section>`;
    })
    .join('\n\n            ');

  return `<section class="${escapeHtml(section.className || 'section')}" data-section-panel="${escapeHtml(sectionAnchorId(section))}" aria-labelledby="${escapeHtml(sectionAnchorId(section))}">\n          <header class="section-header">\n            <h2 class="section-title" id="${escapeHtml(sectionAnchorId(section))}">${escapeHtml(section.title)}</h2>\n          </header>\n          <div class="section-content">\n            ${groupsHtml}\n          </div>\n        </section>`;
}

function renderLayoutItem(layoutItem, sectionMap) {
  if (layoutItem.type === 'wrapper') {
    const sectionHtml = (layoutItem.children ?? [])
      .map((sectionId) => renderSection(resolveSection(sectionMap, sectionId)))
      .join('\n        ');
    const classAttribute = layoutItem.className ? ` class="${escapeHtml(layoutItem.className)}"` : '';
    return `<div${classAttribute}>\n        ${sectionHtml}\n      </div>`;
  }

  if (layoutItem.type === 'section') {
    return renderSection(resolveSection(sectionMap, layoutItem.id));
  }

  throw new Error(`不支持的 layout 类型: ${layoutItem.type}`);
}

export function renderPage(template, localized) {
  if (!Array.isArray(localized.layout)) {
    throw new Error('localized.layout 必须是数组');
  }

  const sectionMap = new Map((localized.sections ?? []).map((section) => [section.id, section]));
  const orderedSections = collectOrderedSections(localized.layout, sectionMap);
  const changelogItems = (localized.changelog ?? [])
    .map((item) => `<li><a class="changelog-link" href="${CHANGELOG_URL}" target="_blank" rel="noreferrer noopener">${escapeHtml(item)}</a></li>`)
    .join('\n        ');
  const sectionsHtml = localized.layout.map((layoutItem) => renderLayoutItem(layoutItem, sectionMap)).join('\n\n      ');
  const sectionSwitcherHtml = renderSectionSwitcher(orderedSections);
  const footerHtml = renderFooter(localized);

  return template
    .replace('{{VERSION_HTML}}', renderVersionInfo(localized.version || 'Claude Code'))
    .replace('{{LAST_UPDATED}}', escapeHtml(localized.lastUpdated || ''))
    .replace('{{CHANGELOG_ITEMS}}', changelogItems)
    .replace('{{SECTION_SWITCHER_HTML}}', sectionSwitcherHtml)
    .replace('{{SECTIONS_HTML}}', sectionsHtml)
    .replace('{{FOOTER_HTML}}', footerHtml);
}

async function main() {
  const template = await readFile('templates/index.template.html', 'utf8');
  const localized = JSON.parse(await readFile('data/generated/localized.json', 'utf8'));
  const html = renderPage(template, localized);

  await writeFile('index.html', html, 'utf8');
  console.log('已生成 index.html');
}

const currentFile = fileURLToPath(import.meta.url).replaceAll('\\', '/');
const invokedFile = process.argv[1] ? resolve(process.argv[1]).replaceAll('\\', '/') : '';
const isTestRun = process.execArgv.includes('--test') || process.env.NODE_TEST_CONTEXT;
if (!isTestRun && invokedFile && (invokedFile === currentFile || invokedFile.endsWith('/scripts/sync.mjs'))) {
  await main();
}
