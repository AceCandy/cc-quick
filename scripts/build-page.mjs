import { readFile, writeFile } from 'node:fs/promises';

function escapeHtml(value = '') {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function badgeHtml(item) {
  if (!item.badge) {
    return '';
  }
  return `<span class="badge-new" data-added="${escapeHtml(item.added || '')}">${escapeHtml(item.badge)}</span>`;
}

const template = await readFile('templates/index.template.html', 'utf8');
const localized = JSON.parse(await readFile('data/generated/localized.json', 'utf8'));

const changelogItems = localized.changelog
  .map((item) => `<li>${escapeHtml(item)}</li>`)
  .join('\n        ');

const sectionsHtml = localized.sections
  .map((section) => {
    const groupsHtml = section.groups
      .map((group) => {
        const groupTitle = group.title ? `<div class="sub-header">${escapeHtml(group.title)}</div>` : '';
        const rowsHtml = group.items
          .map((item) => {
            const descHtml = item.desc
              ? ` <span class="desc">${escapeHtml(item.desc)}${badgeHtml(item)}</span>`
              : '';
            return `<div class="row"><span class="key">${escapeHtml(item.key)}</span>${descHtml}</div>`;
          })
          .join('\n            ');
        return `${groupTitle}\n            ${rowsHtml}`;
      })
      .join('\n\n            ');

    return `<section class="section">\n          <div class="section-header">${escapeHtml(section.title)}</div>\n          <div class="section-content">\n            ${groupsHtml}\n          </div>\n        </section>`;
  })
  .join('\n\n      ');

const html = template
  .replace('{{VERSION}}', escapeHtml(localized.version || 'Claude Code'))
  .replace('{{LAST_UPDATED}}', escapeHtml(localized.lastUpdated || ''))
  .replace('{{CHANGELOG_ITEMS}}', changelogItems)
  .replace('{{SECTIONS_HTML}}', sectionsHtml);

await writeFile('index.html', html, 'utf8');
console.log('已生成 index.html');
