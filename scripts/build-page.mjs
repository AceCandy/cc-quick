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

function resolveSection(sectionMap, sectionId) {
  const section = sectionMap.get(sectionId);
  if (!section) {
    throw new Error(`layout 引用了不存在的 section: ${sectionId}`);
  }
  return section;
}

export function renderSection(section) {
  const groupsHtml = (section.groups ?? [])
    .map((group) => {
      const groupTitle = group.title ? `<div class="sub-header">${escapeHtml(group.title)}</div>` : '';
      const rowsHtml = (group.items ?? [])
        .map((item) => {
          const descHtml = item.desc ? ` <span class="desc">${escapeHtml(item.desc)}${badgeHtml(item)}</span>` : '';
          return `<div class="row"><span class="key">${escapeHtml(item.key)}</span>${descHtml}</div>`;
        })
        .join('\n            ');
      return `${groupTitle}\n            ${rowsHtml}`;
    })
    .join('\n\n            ');

  return `<section class="${escapeHtml(section.className || 'section')}">\n          <div class="section-header">${escapeHtml(section.title)}</div>\n          <div class="section-content">\n            ${groupsHtml}\n          </div>\n        </section>`;
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
  const changelogItems = (localized.changelog ?? [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('\n        ');
  const sectionsHtml = localized.layout.map((layoutItem) => renderLayoutItem(layoutItem, sectionMap)).join('\n\n      ');

  return template
    .replace('{{VERSION}}', escapeHtml(localized.version || 'Claude Code'))
    .replace('{{LAST_UPDATED}}', escapeHtml(localized.lastUpdated || ''))
    .replace('{{CHANGELOG_ITEMS}}', changelogItems)
    .replace('{{SECTIONS_HTML}}', sectionsHtml);
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
