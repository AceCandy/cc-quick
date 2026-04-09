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
    ],
    footer: [
      {
        label: 'Permission Modes',
        items: [
          {
            code: 'default',
            desc: 'prompts'
          },
          {
            code: 'acceptEdits',
            desc: 'auto-accept edits'
          }
        ]
      },
      {
        label: 'Key Env Vars',
        items: [
          {
            code: 'CLAUDE_STREAM_IDLE_TIMEOUT_MS',
            desc: '(def 90s)'
          },
          {
            code: 'ANTHROPIC_API_KEY',
            desc: ''
          }
        ]
      }
    ]
  };

  const maps = {
    sectionMap: {
      'Known Section': '已知章节',
      'Permission Modes': '权限模式',
      'Key Env Vars': '关键环境变量'
    },
    groupTitleMap: {
      'Group One': '分组一'
    },
    changelogMap: {
      'entry-1': '条目一'
    },
    itemMap: {
      'item-map-hit': {
        desc: 'Item map wins over keyboard terms'
      },
      default: {
        footerDesc: '每次提示'
      }
    },
    terms: {
      keyboard: '键盘',
      'keyboard shortcuts': '键盘快捷键',
      'auto-accept edits': '自动接受编辑',
      '(def 90s)': '（默认 90 秒）'
    }
  };

  const { localized, unmappedItems } = transformUpstream(upstream, maps);

  assert.deepEqual(localized.layout, upstream.layout);
  assert.equal(localized.lastUpdated, '最近更新：2026年4月1日');
  assert.deepEqual(localized.changelog, ['条目一']);
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
  assert.equal(localized.sections[0].groups[0].title, '分组一');
  assert.equal(localized.sections[1].groups[0].title, 'Group Two');
  assert.deepEqual(localized.footer, [
    {
      label: '权限模式',
      items: [
        {
          code: 'default',
          desc: '每次提示'
        },
        {
          code: 'acceptEdits',
          desc: '自动接受编辑'
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
  ]);
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
    },
    {
      section: 'Footer',
      group: 'Permission Modes',
      key: 'acceptEdits',
      desc: 'auto-accept edits'
    },
    {
      section: 'Footer',
      group: 'Key Env Vars',
      key: 'CLAUDE_STREAM_IDLE_TIMEOUT_MS',
      desc: '(def 90s)'
    },
    {
      section: 'Footer',
      group: 'Key Env Vars',
      key: 'ANTHROPIC_API_KEY',
      desc: ''
    }
  ]);
});

test('transformUpstream 会将 upstream 的英文更新时间格式化为中文日期', () => {
  const upstream = {
    version: '1.0.0',
    lastUpdated: 'Last updated: April 4, 2026',
    changelog: [],
    layout: [],
    footer: [],
    sections: []
  };

  const { localized } = transformUpstream(upstream, {
    sectionMap: {},
    itemMap: {},
    terms: {}
  });

  assert.equal(localized.lastUpdated, '最近更新：2026年4月4日');
});

test('transformUpstream 将空 desc 的 item 保留原值并记录到 unmappedItems', () => {
  const upstream = {
    version: '1.0.0',
    lastUpdated: '2026-04-01',
    changelog: [],
    layout: [],
    footer: [],
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

test('transformUpstream 优先使用手动映射，其次 AI 映射，再回退 terms', () => {
  const upstream = {
    version: '1.0.0',
    lastUpdated: '2026-04-01',
    changelog: [],
    layout: [],
    sections: [
      {
        id: 'section-ai',
        className: 'section section-ai',
        title: 'AI Section',
        groups: [
          {
            title: 'Group',
            items: [
              {
                key: 'manual-key',
                desc: 'manual source',
                badge: null,
                added: null
              },
              {
                key: 'ai-key',
                desc: 'ai source',
                badge: null,
                added: null
              },
              {
                key: 'terms-key',
                desc: 'keyboard shortcuts only',
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
        label: 'Permission Modes',
        items: [
          {
            code: 'acceptEdits',
            desc: 'auto-accept edits'
          }
        ]
      }
    ]
  };

  const { localized, unmappedItems } = transformUpstream(upstream, {
    sectionMap: {
      'Permission Modes': '权限模式'
    },
    itemMap: {
      'manual-key': {
        desc: '手动映射'
      }
    },
    aiItemMap: {
      'ai-key': {
        desc: 'AI 映射'
      },
      acceptEdits: {
        footerDesc: 'AI 页脚映射'
      }
    },
    terms: {
      'keyboard shortcuts': '键盘快捷键',
      'auto-accept edits': '自动接受编辑'
    }
  });

  assert.deepEqual(localized.sections[0].groups[0].items, [
    {
      key: 'manual-key',
      desc: '手动映射',
      badge: null,
      added: null
    },
    {
      key: 'ai-key',
      desc: 'AI 映射',
      badge: null,
      added: null
    },
    {
      key: 'terms-key',
      desc: '键盘快捷键 only',
      badge: null,
      added: null
    }
  ]);
  assert.deepEqual(localized.footer, [
    {
      label: '权限模式',
      items: [
        {
          code: 'acceptEdits',
          desc: 'AI 页脚映射'
        }
      ]
    }
  ]);
  assert.deepEqual(unmappedItems, [
    {
      section: 'AI Section',
      group: 'Group',
      key: 'terms-key',
      desc: 'keyboard shortcuts only'
    }
  ]);
});

test('transformUpstream 的 changelog 优先使用手动映射，其次 AI 映射，再回退原文', () => {
  const upstream = {
    version: '1.0.0',
    lastUpdated: '2026-04-01',
    changelog: ['manual-entry', 'ai-entry', 'raw-entry'],
    layout: [],
    sections: [],
    footer: []
  };

  const { localized } = transformUpstream(upstream, {
    changelogMap: {
      'manual-entry': '手动 changelog'
    },
    changelogAiMap: {
      'ai-entry': 'AI changelog'
    }
  });

  assert.deepEqual(localized.changelog, [
    '手动 changelog',
    'AI changelog',
    'raw-entry'
  ]);
});
