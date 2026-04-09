import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChatCompletionRequestBody,
  buildTranslationRequestBody,
  collectAiCandidates,
  collectAiChangelogCandidates,
  extractChatCompletionText,
  mergeAiItemMap,
  parseJsonFromModelText,
  shouldRetryChatWithoutJsonMode,
  shouldFallbackToChatCompletions
} from './fill-ai-item-map.mjs';

test('collectAiCandidates 跳过已有手动或 AI 映射，并按正文与页脚去重', () => {
  const unmappedItems = [
    {
      section: 'Keyboard',
      group: 'General Controls',
      key: 'CtrlX CtrlK',
      desc: 'Kill background agents'
    },
    {
      section: 'Keyboard',
      group: 'General Controls',
      key: 'CtrlX CtrlK',
      desc: 'Kill background agents'
    },
    {
      section: 'Footer',
      group: 'Permission Modes',
      key: 'acceptEdits',
      desc: 'auto-accept edits'
    },
    {
      section: 'Footer',
      group: 'Permission Modes',
      key: 'default',
      desc: 'prompts'
    },
    {
      section: 'Config',
      group: 'Special',
      key: 'manual-key',
      desc: 'Already covered manually'
    },
    {
      section: 'Config',
      group: 'Special',
      key: 'ai-key',
      desc: 'Already covered by ai map'
    },
    {
      section: 'Config',
      group: 'Special',
      key: 'empty-desc',
      desc: ''
    }
  ];

  const { candidates, conflicts } = collectAiCandidates({
    unmappedItems,
    itemMap: {
      'manual-key': {
        desc: '手动'
      },
      default: {
        footerDesc: '每次提示'
      }
    },
    aiItemMap: {
      'ai-key': {
        desc: 'AI 已有'
      }
    }
  });

  assert.deepEqual(candidates, [
    {
      key: 'acceptEdits',
      scope: 'footer',
      section: 'Footer',
      group: 'Permission Modes',
      desc: 'auto-accept edits'
    },
    {
      key: 'CtrlX CtrlK',
      scope: 'section',
      section: 'Keyboard',
      group: 'General Controls',
      desc: 'Kill background agents'
    }
  ]);
  assert.deepEqual(conflicts, []);
});

test('collectAiCandidates 遇到同 key 同 scope 不同描述时保留首次出现并记录告警', () => {
  const { candidates, conflicts } = collectAiCandidates({
    unmappedItems: [
      {
        section: 'Slash',
        group: 'Session',
        key: '/foo',
        desc: 'First desc'
      },
      {
        section: 'Slash',
        group: 'Special',
        key: '/foo',
        desc: 'Second desc'
      }
    ],
    itemMap: {},
    aiItemMap: {}
  });

  assert.deepEqual(candidates, [
    {
      key: '/foo',
      scope: 'section',
      section: 'Slash',
      group: 'Session',
      desc: 'First desc'
    }
  ]);
  assert.deepEqual(conflicts, [
    {
      key: '/foo',
      scope: 'section',
      descs: ['First desc', 'Second desc']
    }
  ]);
});

test('collectAiChangelogCandidates 跳过已有手动或 AI 映射，并按原文去重', () => {
  const candidates = collectAiChangelogCandidates({
    changelog: [
      'Manual entry',
      'AI entry',
      'Fresh entry',
      'Fresh entry'
    ],
    changelogMap: {
      'Manual entry': '手动条目'
    },
    changelogAiMap: {
      'AI entry': 'AI 条目'
    }
  });

  assert.deepEqual(candidates, ['Fresh entry']);
});

test('parseJsonFromModelText 支持 markdown fenced json', () => {
  const parsed = parseJsonFromModelText('```json\n{\"CtrlX CtrlK\":{\"desc\":\"终止后台 agents\"}}\n```');
  assert.deepEqual(parsed, {
    'CtrlX CtrlK': {
      desc: '终止后台 agents'
    }
  });
});

test('parseJsonFromModelText 遇到空响应时抛出可读错误', () => {
  assert.throws(
    () => parseJsonFromModelText(''),
    /模型未返回可解析的 JSON/
  );
});

test('buildTranslationRequestBody 显式要求 JSON object 输出', () => {
  const body = buildTranslationRequestBody({
    model: 'gpt-5-mini',
    batch: [
      {
        key: 'CtrlX CtrlK',
        scope: 'section',
        section: 'Keyboard',
        group: 'General Controls',
        desc: 'Kill background agents'
      }
    ]
  });

  assert.equal(body.model, 'gpt-5-mini');
  assert.equal(body.text?.format?.type, 'json_object');
  assert.match(body.input, /请直接输出 JSON 对象/);
});

test('shouldFallbackToChatCompletions 在 Responses completed 但 output 为空时返回 true', () => {
  assert.equal(
    shouldFallbackToChatCompletions({
      status: 'completed',
      output: []
    }),
    true
  );
  assert.equal(
    shouldFallbackToChatCompletions({
      status: 'completed',
      output: [{ type: 'message' }]
    }),
    false
  );
});

test('buildChatCompletionRequestBody 使用 messages + response_format json_object', () => {
  const body = buildChatCompletionRequestBody({
    model: 'gpt-5.4-mini-2026-03-17',
    batch: [
      {
        key: 'acceptEdits',
        scope: 'footer',
        section: 'Footer',
        group: 'Permission Modes',
        desc: 'auto-accept edits'
      }
    ]
  });

  assert.equal(body.model, 'gpt-5.4-mini-2026-03-17');
  assert.equal(body.response_format?.type, 'json_object');
  assert.equal(body.messages?.[0]?.role, 'user');
  assert.match(body.messages?.[0]?.content, /请直接输出 JSON 对象/);
});

test('extractChatCompletionText 提取 choices[0].message.content', () => {
  const text = extractChatCompletionText({
    choices: [
      {
        message: {
          content: '{"acceptEdits":{"footerDesc":"自动接受编辑"}}'
        }
      }
    ]
  });

  assert.equal(text, '{"acceptEdits":{"footerDesc":"自动接受编辑"}}');
});

test('shouldRetryChatWithoutJsonMode 在 assistant message 为空时返回 true', () => {
  assert.equal(
    shouldRetryChatWithoutJsonMode({
      choices: [
        {
          message: {
            role: 'assistant'
          },
          finish_reason: 'stop'
        }
      ]
    }),
    true
  );
  assert.equal(
    shouldRetryChatWithoutJsonMode({
      choices: [
        {
          message: {
            role: 'assistant',
            content: '{"ok":true}'
          },
          finish_reason: 'stop'
        }
      ]
    }),
    false
  );
});

test('buildChatCompletionRequestBody 在禁用 json mode 时不带 response_format', () => {
  const body = buildChatCompletionRequestBody({
    model: 'gpt-5.4',
    jsonMode: false,
    batch: [
      {
        key: 'CtrlX CtrlK',
        scope: 'section',
        section: 'Keyboard',
        group: 'General Controls',
        desc: 'Kill background agents'
      }
    ]
  });

  assert.equal(body.model, 'gpt-5.4');
  assert.equal('response_format' in body, false);
  assert.equal(body.messages?.[0]?.role, 'user');
});

test('mergeAiItemMap 合并并按 key 排序输出', () => {
  const merged = mergeAiItemMap(
    {
      zeta: {
        desc: '最后一个'
      }
    },
    {
      alpha: {
        desc: '第一个'
      }
    }
  );

  assert.deepEqual(Object.keys(merged), ['alpha', 'zeta']);
  assert.deepEqual(merged.alpha, { desc: '第一个' });
  assert.deepEqual(merged.zeta, { desc: '最后一个' });
});
