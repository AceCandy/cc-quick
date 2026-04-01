import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

export function normalizeText(text = '') {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function requireElement($root, selector, label) {
  const element = $root.find(selector).first();
  if (!element.length) {
    throw new Error(`缺少必需节点: ${label}`);
  }
  return element;
}

function requireText($root, selector, label) {
  const element = requireElement($root, selector, label);
  const text = normalizeText(element.text());
  if (!text) {
    throw new Error(`缺少必需文本: ${label}`);
  }
  return text;
}

function slugifyText(text = '') {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

function parseSectionId(className, title) {
  const classList = normalizeText(className).split(' ').filter(Boolean);
  const sectionClass = classList.find((name) => name !== 'section' && name.startsWith('section-'));
  if (sectionClass) {
    return sectionClass.slice('section-'.length);
  }
  return slugifyText(title);
}

function parseSection($, sectionEl) {
  const section = $(sectionEl);
  const className = normalizeText(section.attr('class') || '');
  const headerEl = section.children('.section-header').first();
  if (!headerEl.length) {
    throw new Error(`section 缺少 section-header: ${className || '<anonymous>'}`);
  }
  const sectionContent = section.children('.section-content').first();
  if (!sectionContent.length) {
    throw new Error(`section 缺少 section-content: ${className || '<anonymous>'}`);
  }
  const title = normalizeText(headerEl.text());
  const id = parseSectionId(className, title);
  const groups = [];
  let currentGroup = null;

  sectionContent.children().each((_, child) => {
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
      return;
    }

    const nodeLabel = normalizeText(node.attr('class') || node.prop('tagName') || node[0]?.tagName || 'unknown');
    throw new Error(`section-content 包含不受支持的子节点: ${nodeLabel}`);
  });

  return { id, className, title, groups };
}

export function parsePage(html) {
  const $ = cheerio.load(html);
  const version = requireText($.root(), '.version-info', 'version-info');
  const lastUpdated = requireText($.root(), '.last-updated', 'last-updated');
  const changelogList = requireElement($.root(), '.changelog-list', 'changelog-list');
  const changelog = [];
  const layout = [];

  changelogList.children('li').each((_, element) => {
    changelog.push(normalizeText($(element).text()));
  });

  const sections = [];
  const mainGrid = requireElement($.root(), '.main-grid', 'main-grid');

  // 先按 main-grid 的直接子节点还原上游骨架：wrapper 负责分组，section 负责内容。
  mainGrid.children().each((_, child) => {
    const node = $(child);

    if (node.is('section')) {
      const section = parseSection($, child);
      sections.push(section);
      layout.push({
        type: 'section',
        id: section.id,
        className: section.className,
        title: section.title
      });
      return;
    }

    const childSections = node.children('section.section');
    if (!childSections.length) {
      const nodeLabel = normalizeText(node.attr('class') || node.prop('tagName') || node[0]?.tagName || 'unknown');
      throw new Error(`main-grid 包含不受支持的子节点: ${nodeLabel}`);
    }
    const unsupportedChildren = node
      .children()
      .toArray()
      .filter((element) => !$(element).is('section.section'));
    if (unsupportedChildren.length) {
      const nodeLabel = normalizeText(node.attr('class') || node.prop('tagName') || node[0]?.tagName || 'unknown');
      const childLabel = unsupportedChildren
        .map((element) => normalizeText($(element).attr('class') || element.tagName || 'unknown'))
        .join(', ');
      throw new Error(`wrapper 包含不受支持的子节点: ${nodeLabel} -> ${childLabel}`);
    }

    const className = normalizeText(node.attr('class') || '');
    const wrapperChildren = [];
    childSections.each((_, sectionEl) => {
      const section = parseSection($, sectionEl);
      sections.push(section);
      wrapperChildren.push(section.id);
    });
    layout.push({
      type: 'wrapper',
      id: parseSectionId(className, '') || null,
      className: className || null,
      children: wrapperChildren
    });
  });

  return { version, lastUpdated, changelog, layout, sections };
}

async function main() {
  const storyfoxHtml = await readFile('data/upstream/storyfox.html', 'utf8');
  const parsed = parsePage(storyfoxHtml);

  await mkdir('data/parsed', { recursive: true });
  await writeFile('data/parsed/upstream.json', JSON.stringify(parsed, null, 2), 'utf8');
  console.log('已解析上游页面');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
