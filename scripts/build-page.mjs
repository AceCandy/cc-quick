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

function renderNavSection(section) {
  const sectionId = sectionAnchorId(section);
  const groups = (section.groups ?? [])
    .filter((group) => group.title)
    .map((group, index) => {
      const groupId = groupAnchorId(section, group, index);
      return `<li class="page-nav-subitem"><a class="page-nav-sublink" href="#${escapeHtml(groupId)}">${escapeHtml(group.title)}</a></li>`;
    })
    .join('');
  const groupsHtml = groups ? `<ul class="page-nav-sublist">${groups}</ul>` : '';

  return `<li class="page-nav-item"><a class="page-nav-link" href="#${escapeHtml(sectionId)}">${escapeHtml(section.title)}</a>${groupsHtml}</li>`;
}

function renderNav(orderedSections) {
  const items = orderedSections.map((section) => renderNavSection(section)).join('');
  return `<nav class="page-nav" aria-label="页面目录"><ul class="page-nav-list">${items}</ul></nav>`;
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
          return `<div class="row"><span class="key">${escapeHtml(item.key)}</span>${descHtml}</div>`;
        })
        .join('\n            ');
      return `<section class="section-group">\n              ${groupTitle}\n              ${rowsHtml}\n            </section>`;
    })
    .join('\n\n            ');

  return `<section class="${escapeHtml(section.className || 'section')}" aria-labelledby="${escapeHtml(sectionAnchorId(section))}">\n          <header class="section-header">\n            <h2 class="section-title" id="${escapeHtml(sectionAnchorId(section))}">${escapeHtml(section.title)}</h2>\n          </header>\n          <div class="section-content">\n            ${groupsHtml}\n          </div>\n        </section>`;
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
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('\n        ');
  const sectionsHtml = localized.layout.map((layoutItem) => renderLayoutItem(layoutItem, sectionMap)).join('\n\n      ');
  const navHtml = renderNav(orderedSections);
  const footerHtml = renderFooter(localized);

  return template
    .replace('{{VERSION}}', escapeHtml(localized.version || 'Claude Code'))
    .replace('{{LAST_UPDATED}}', escapeHtml(localized.lastUpdated || ''))
    .replace('{{CHANGELOG_ITEMS}}', changelogItems)
    .replace('{{NAV_HTML}}', navHtml)
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
