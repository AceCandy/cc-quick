import { readFile, writeFile, mkdir } from 'node:fs/promises';
import * as cheerio from 'cheerio';

function normalizeText(text = '') {
  return text.replace(/\s+/g, ' ').trim();
}

function parsePage(html) {
  const $ = cheerio.load(html);
  const version = normalizeText($('.version-info').first().text());
  const lastUpdated = normalizeText($('.last-updated').first().text());
  const changelog = [];

  $('.changelog-list li').each((_, element) => {
    changelog.push(normalizeText($(element).text()));
  });

  const sections = [];
  $('.section').each((_, sectionEl) => {
    const sectionTitle = normalizeText($(sectionEl).find('.section-header').first().text());
    const groups = [];
    let currentGroup = null;

    $(sectionEl).find('.section-content').children().each((__, child) => {
      const node = $(child);
      if (node.hasClass('sub-header')) {
        currentGroup = {
          title: normalizeText(node.text()),
          items: []
        };
        groups.push(currentGroup);
        return;
      }

      if (node.hasClass('row')) {
        if (!currentGroup) {
          currentGroup = { title: '', items: [] };
          groups.push(currentGroup);
        }

        const key = normalizeText(node.find('.key').first().text());
        const descEl = node.find('.desc').first();
        const badgeEl = descEl.find('.badge-new').first();
        const badge = badgeEl.length ? normalizeText(badgeEl.text()) : null;
        const added = badgeEl.length ? badgeEl.attr('data-added') || null : null;
        if (badgeEl.length) {
          badgeEl.remove();
        }
        const desc = normalizeText(descEl.text());
        currentGroup.items.push({ key, desc, badge, added });
      }
    });

    sections.push({ title: sectionTitle, groups });
  });

  return { version, lastUpdated, changelog, sections };
}

const storyfoxHtml = await readFile('data/upstream/storyfox.html', 'utf8');
const parsed = parsePage(storyfoxHtml);

await mkdir('data/parsed', { recursive: true });
await writeFile('data/parsed/upstream.json', JSON.stringify(parsed, null, 2), 'utf8');
console.log('已解析上游页面');
