import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTerms, transformUpstream } from './transform-content.mjs';

test('applyTerms 优先替换更长的词条', () => {
  const result = applyTerms('keyboard shortcuts are useful', {
    keyboard: '键盘',
    'keyboard shortcuts': '键盘快捷键'
  });

  assert.equal(result, '键盘快捷键 are useful');
});

test('transformUpstream 保留 layout 并按规则翻译 section 与 item', () => {
  const upstream = {
    version: '1.0.0',
    lastUpdated: '2026-04-01',
    changelog: ['entry-1'],
    layout: [
      {
        type: 'wrapper',
        id: 'feature-group',
        className: 'section-group section-group-feature',
        children: ['known-section', 'unknown-section']
      }
    ],
    sections: [
      {
        id: 'known-section',
        className: 'section section-known',
        title: 'Known Section',
        groups: [
          {
            title: 'Group One',
            items: [
              {
                key: 'item-map-hit',
                desc: 'This desc uses keyboard terms',
                badge: 'NEW',
                added: '2026-03-31'
              },
              {
                key: 'terms-hit',
                desc: 'Enable keyboard shortcuts now',
                badge: null,
                added: null
              },
              {
                key: 'terms-only-unmapped',
                desc: 'Use keyboard shortcuts carefully',
                badge: null,
                added: null
              }
            ]
          }
        ]
      },
      {
        id: 'unknown-section',
        className: 'section section-unknown',
        title: 'Mystery Section',
        groups: [
          {
            title: 'Group Two',
            items: [
              {
                key: 'unmapped-hit',
                desc: 'Leave this text alone',
                badge: null,
                added: null
              }
            ]
          }
        ]
      }
    ]
  };

  const maps = {
    sectionMap: {
      'Known Section': '已知章节'
    },
    itemMap: {
      'item-map-hit': {
        desc: 'Item map wins over keyboard terms'
      }
    },
    terms: {
      keyboard: '键盘',
      'keyboard shortcuts': '键盘快捷键'
    }
  };

  const { localized, unmappedItems } = transformUpstream(upstream, maps);

  assert.deepEqual(localized.layout, upstream.layout);
  assert.deepEqual(
    localized.sections.map(({ id, className, title }) => ({ id, className, title })),
    [
      {
        id: 'known-section',
        className: 'section section-known',
        title: '已知章节'
      },
      {
        id: 'unknown-section',
        className: 'section section-unknown',
        title: 'Mystery Section'
      }
    ]
  );
  assert.deepEqual(localized.sections[0].groups[0].items[0], {
    key: 'item-map-hit',
    desc: 'Item map wins over keyboard terms',
    badge: 'NEW',
    added: '2026-03-31'
  });
  assert.deepEqual(localized.sections[0].groups[0].items[1], {
    key: 'terms-hit',
    desc: 'Enable 键盘快捷键 now',
    badge: null,
    added: null
  });
  assert.deepEqual(localized.sections[0].groups[0].items[2], {
    key: 'terms-only-unmapped',
    desc: 'Use 键盘快捷键 carefully',
    badge: null,
    added: null
  });
  assert.deepEqual(localized.sections[1].groups[0].items[0], {
    key: 'unmapped-hit',
    desc: 'Leave this text alone',
    badge: null,
    added: null
  });
  assert.deepEqual(unmappedItems, [
    {
      section: 'Known Section',
      group: 'Group One',
      key: 'terms-hit',
      desc: 'Enable keyboard shortcuts now'
    },
    {
      section: 'Known Section',
      group: 'Group One',
      key: 'terms-only-unmapped',
      desc: 'Use keyboard shortcuts carefully'
    },
    {
      section: 'Mystery Section',
      group: 'Group Two',
      key: 'unmapped-hit',
      desc: 'Leave this text alone'
    }
  ]);
});

test('transformUpstream 将空 desc 的 item 保留原值并记录到 unmappedItems', () => {
  const upstream = {
    version: '1.0.0',
    lastUpdated: '2026-04-01',
    changelog: [],
    layout: [],
    sections: [
      {
        id: 'empty-values',
        className: 'section section-empty-values',
        title: 'Empty Values',
        groups: [
          {
            title: 'Empty Group',
            items: [
              {
                key: 'empty-string',
                desc: '',
                badge: null,
                added: null
              },
              {
                key: 'null-desc',
                desc: null,
                badge: null,
                added: null
              }
            ]
          }
        ]
      }
    ]
  };

  const { localized, unmappedItems } = transformUpstream(upstream, {
    sectionMap: {},
    itemMap: {},
    terms: {
      empty: '空'
    }
  });

  assert.deepEqual(localized.sections[0].groups[0].items, [
    {
      key: 'empty-string',
      desc: '',
      badge: null,
      added: null
    },
    {
      key: 'null-desc',
      desc: null,
      badge: null,
      added: null
    }
  ]);
  assert.deepEqual(unmappedItems, [
    {
      section: 'Empty Values',
      group: 'Empty Group',
      key: 'empty-string',
      desc: ''
    },
    {
      section: 'Empty Values',
      group: 'Empty Group',
      key: 'null-desc',
      desc: null
    }
  ]);
});
