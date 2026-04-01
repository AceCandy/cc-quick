import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function applyTerms(text, terms) {
  let result = text;
  const entries = Object.entries(terms ?? {}).sort((a, b) => b[0].length - a[0].length);
  for (const [source, target] of entries) {
    result = result.replaceAll(source, target);
  }
  return result;
}

function localizeDesc({ itemKey, desc, itemMap, terms, unmappedItems, scope, group, preferFooterDesc = false }) {
  const mapped = itemMap[itemKey];
  const mappedDesc = preferFooterDesc ? mapped?.footerDesc ?? mapped?.desc : mapped?.desc;
  if (mappedDesc) {
    return mappedDesc;
  }

  const localizedDesc = desc ? applyTerms(desc, terms) : desc;
  unmappedItems.push({
    section: scope,
    group,
    key: itemKey,
    desc
  });
  return localizedDesc;
}

export function transformUpstream(upstream, maps) {
  const { sectionMap = {}, itemMap = {}, terms = {} } = maps ?? {};
  const unmappedItems = [];
  const sections = (upstream.sections ?? []).map((section) => ({
    id: section.id,
    className: section.className,
    title: sectionMap[section.title] || section.title,
    groups: (section.groups ?? []).map((group) => ({
      title: group.title,
      items: (group.items ?? []).map((item) => ({
        key: item.key,
        desc: localizeDesc({
          itemKey: item.key,
          desc: item.desc,
          itemMap,
          terms,
          unmappedItems,
          scope: section.title,
          group: group.title,
          preferFooterDesc: false
        }),
        badge: item.badge,
        added: item.added
      }))
    }))
  }));
  const footer = (upstream.footer ?? []).map((row) => ({
    label: sectionMap[row.label] || row.label,
    items: (row.items ?? []).map((item) => ({
      code: item.code,
      desc: localizeDesc({
        itemKey: item.code,
        desc: item.desc,
        itemMap,
        terms,
        unmappedItems,
        scope: 'Footer',
        group: row.label,
        preferFooterDesc: true
      })
    }))
  }));

  const localized = {
    version: upstream.version,
    lastUpdated: upstream.lastUpdated,
    changelog: upstream.changelog,
    layout: upstream.layout,
    sections,
    footer
  };

  return { localized, unmappedItems };
}

async function main() {
  const upstream = JSON.parse(await readFile('data/parsed/upstream.json', 'utf8'));
  const sectionMap = JSON.parse(await readFile('data/config/section-map.json', 'utf8'));
  const itemMap = JSON.parse(await readFile('data/config/item-map.json', 'utf8'));
  const terms = JSON.parse(await readFile('data/config/terms.json', 'utf8'));
  const { localized, unmappedItems } = transformUpstream(upstream, { sectionMap, itemMap, terms });

  await mkdir('data/generated', { recursive: true });
  await writeFile('data/generated/localized.json', JSON.stringify(localized, null, 2), 'utf8');
  await writeFile('data/parsed/unmapped-items.json', JSON.stringify(unmappedItems, null, 2), 'utf8');
  console.log(`已转换内容，未命中条目 ${unmappedItems.length} 个`);
}

const currentFile = fileURLToPath(import.meta.url).replaceAll('\\', '/');
const invokedFile = process.argv[1] ? resolve(process.argv[1]).replaceAll('\\', '/') : '';
const isTestRun = process.execArgv.includes('--test') || process.env.NODE_TEST_CONTEXT;
if (!isTestRun && invokedFile && (invokedFile === currentFile || invokedFile.endsWith('/scripts/sync.mjs'))) {
  await main();
}
