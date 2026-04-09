import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';
const DEFAULT_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

function sortObjectByKey(value) {
  return Object.fromEntries(
    Object.entries(value ?? {}).sort(([left], [right]) => left.localeCompare(right, 'en'))
  );
}

function hasMappedDesc(entry = {}, scope = 'section') {
  if (scope === 'footer') {
    return Boolean(entry.footerDesc || entry.desc);
  }
  return Boolean(entry.desc);
}

export function collectAiCandidates({ unmappedItems = [], itemMap = {}, aiItemMap = {} }) {
  const grouped = new Map();
  const conflicts = [];

  for (const item of unmappedItems) {
    if (!item || item.desc == null || item.desc === '') {
      continue;
    }

    const scope = item.section === 'Footer' ? 'footer' : 'section';
    if (hasMappedDesc(itemMap[item.key], scope) || hasMappedDesc(aiItemMap[item.key], scope)) {
      continue;
    }

    const mapKey = `${scope}::${item.key}`;
    const current = grouped.get(mapKey);
    if (!current) {
      grouped.set(mapKey, {
        key: item.key,
        scope,
        section: item.section,
        group: item.group,
        desc: item.desc
      });
      continue;
    }

    if (current.desc !== item.desc) {
      const existing = conflicts.find((entry) => entry.key === item.key && entry.scope === scope);
      if (existing) {
        if (!existing.descs.includes(item.desc)) {
          existing.descs.push(item.desc);
        }
      } else {
        conflicts.push({
          key: item.key,
          scope,
          descs: [current.desc, item.desc]
        });
      }
    }
  }

  const candidates = Array.from(grouped.values())
    .sort((left, right) => `${left.scope}:${left.key}`.localeCompare(`${right.scope}:${right.key}`, 'en'));

  return { candidates, conflicts };
}

export function parseJsonFromModelText(text = '') {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) {
    throw new Error('模型未返回可解析的 JSON：收到空输出');
  }

  const unfenced = trimmed
    .replace(/^```json\s*/iu, '')
    .replace(/^```\s*/u, '')
    .replace(/\s*```$/u, '')
    .trim();

  if (!unfenced) {
    throw new Error('模型未返回可解析的 JSON：去除代码块后为空');
  }

  try {
    return JSON.parse(unfenced);
  } catch (error) {
    const preview = unfenced.slice(0, 240);
    throw new Error(`模型未返回可解析的 JSON：${error.message}\n原始片段: ${preview}`);
  }
}

export function mergeAiItemMap(currentMap = {}, nextMap = {}) {
  return sortObjectByKey({
    ...currentMap,
    ...nextMap
  });
}

function extractOutputText(response = {}) {
  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim();
  }

  return (response.output ?? [])
    .flatMap((entry) => entry.content ?? [])
    .map((item) => item.text ?? item.output_text ?? '')
    .join('\n')
    .trim();
}

function chunkItems(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function buildPrompt(batch) {
  return [
    '你是一个给中文开发者速查页做翻译映射的助手。',
    '任务：把每条 desc 翻译成简体中文，要求简洁、准确、技术语义稳定。',
    '规则：',
    '1. 只翻译说明文字，不翻译 key。',
    '2. 结果必须是纯 JSON 对象，不能带 markdown、解释或额外字段。',
    '3. 正文条目使用 {"desc":"..."}，Footer 条目使用 {"footerDesc":"..."}。',
    '4. 保留 CLI 参数、环境变量、模型名、数字、括号语义和常见技术词，不要过度意译。',
    '',
    '输入：',
    JSON.stringify(batch, null, 2),
    '',
    '请直接输出 JSON 对象。'
  ].join('\n');
}

export function buildTranslationRequestBody({ model, batch }) {
  return {
    model,
    text: {
      format: {
        type: 'json_object'
      }
    },
    input: buildPrompt(batch)
  };
}

export function shouldFallbackToChatCompletions(response = {}) {
  return response?.status === 'completed'
    && Array.isArray(response.output)
    && response.output.length === 0;
}

export function buildChatCompletionRequestBody({ model, batch, jsonMode = true }) {
  const body = {
    model,
    messages: [
      {
        role: 'user',
        content: buildPrompt(batch)
      }
    ]
  };

  if (jsonMode) {
    body.response_format = {
      type: 'json_object'
    };
  }

  return body;
}

export function extractChatCompletionText(response = {}) {
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }
        return item?.text ?? '';
      })
      .join('\n')
      .trim();
  }

  return '';
}

export function shouldRetryChatWithoutJsonMode(response = {}) {
  const choice = response?.choices?.[0];
  return choice?.message?.role === 'assistant'
    && choice?.finish_reason === 'stop'
    && !extractChatCompletionText(response);
}

async function requestChatCompletion({ apiKey, baseUrl, model, batch, jsonMode }) {
  const requestBody = buildChatCompletionRequestBody({ model, batch, jsonMode });
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error(`OpenAI Chat Completions 请求失败: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function requestChatCompletionFallback({ apiKey, baseUrl, model, batch }) {
  let payload = await requestChatCompletion({
    apiKey,
    baseUrl,
    model,
    batch,
    jsonMode: true
  });

  if (shouldRetryChatWithoutJsonMode(payload)) {
    payload = await requestChatCompletion({
      apiKey,
      baseUrl,
      model,
      batch,
      jsonMode: false
    });
  }

  const outputText = extractChatCompletionText(payload);
  try {
    return parseJsonFromModelText(outputText);
  } catch (error) {
    const payloadPreview = JSON.stringify(payload).slice(0, 1200);
    throw new Error(`${error.message}\nChat 响应片段: ${payloadPreview}`);
  }
}

async function requestBatchTranslations({ apiKey, baseUrl, model, batch }) {
  const requestBody = buildTranslationRequestBody({ model, batch });

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/responses`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error(`OpenAI 请求失败: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  if (shouldFallbackToChatCompletions(payload)) {
    return requestChatCompletionFallback({ apiKey, baseUrl, model, batch });
  }

  const outputText = extractOutputText(payload);
  try {
    return parseJsonFromModelText(outputText);
  } catch (error) {
    const payloadPreview = JSON.stringify(payload).slice(0, 1200);
    throw new Error(`${error.message}\n响应片段: ${payloadPreview}`);
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('缺少 OPENAI_API_KEY，无法生成 AI 翻译映射');
  }

  const unmappedItems = await readJson('data/parsed/unmapped-items.json');
  const itemMap = await readJson('data/config/item-map.json');
  const aiItemMap = await readJson('data/config/item-map.ai.json');
  const { candidates, conflicts } = collectAiCandidates({ unmappedItems, itemMap, aiItemMap });

  if (conflicts.length > 0) {
    console.warn(`检测到 ${conflicts.length} 个同 key 多描述条目，已按首次出现优先生成 AI 映射`);
  }

  if (candidates.length === 0) {
    console.log('没有需要生成的 AI 翻译候选');
    return;
  }

  const mergedSuggestions = {};
  for (const batch of chunkItems(candidates, 40)) {
    const translated = await requestBatchTranslations({
      apiKey,
      baseUrl: DEFAULT_BASE_URL,
      model: DEFAULT_MODEL,
      batch
    });

    Object.assign(mergedSuggestions, translated);
  }

  const nextAiItemMap = mergeAiItemMap(aiItemMap, mergedSuggestions);
  await writeFile('data/config/item-map.ai.json', `${JSON.stringify(nextAiItemMap, null, 2)}\n`, 'utf8');
  console.log(`已写入 AI 翻译映射 ${Object.keys(mergedSuggestions).length} 条`);
}

const currentFile = fileURLToPath(import.meta.url).replaceAll('\\', '/');
const invokedFile = process.argv[1] ? resolve(process.argv[1]).replaceAll('\\', '/') : '';
const isTestRun = process.execArgv.includes('--test') || process.env.NODE_TEST_CONTEXT;
if (!isTestRun && invokedFile && invokedFile === currentFile) {
  await main();
}
