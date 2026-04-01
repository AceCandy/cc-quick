# Upstream Layout Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `npm run sync` 在上游模块分组变化时，自动同步本地页面的分组结构和分组下字段，而不是只同步平铺 section 文本。

**Architecture:** 保持现有 `fetch -> parse -> transform -> build` 链路不变，只把 `parse-upstream`、`transform-content`、`build-page` 的数据结构从平铺 `sections[]` 升级为 `layout[] + sections[]`。翻译仍走现有 `section-map.json`、`item-map.json`、`terms.json`，结构信息原样透传，最终由构建器按 layout 重建页面分组。

**Tech Stack:** Node.js ESM、`node:test`、`node:assert/strict`、`cheerio`

---

## File Structure

- Modify: `scripts/parse-upstream.mjs`
  - 增加可测试的纯解析函数，输出 `layout[] + sections[]`
- Modify: `scripts/transform-content.mjs`
  - 保留 `layout`，继续做 section/group/item 翻译
- Modify: `scripts/build-page.mjs`
  - 按 `layout` 而不是平铺 `sections` 生成 HTML
- Create: `scripts/parse-upstream.test.mjs`
  - 验证 wrapper 顺序、section 归属、group/item 解析
- Create: `scripts/transform-content.test.mjs`
  - 验证 `layout` 透传、标题映射、原文回退
- Create: `scripts/build-page.test.mjs`
  - 验证 wrapper 渲染、section 顺序、缺失 section 显式报错

### Task 1: Parse Upstream Layout

**Files:**
- Modify: `scripts/parse-upstream.mjs`
- Test: `scripts/parse-upstream.test.mjs`

- [ ] **Step 1: Write the failing parser tests**

在 `scripts/parse-upstream.test.mjs` 新增最小 fixture HTML，覆盖：
- `main-grid` 下有两个 wrapper
- wrapper 下各有两个 section
- 至少一个 section 包含 `sub-header`、`row`、`badge-new`

测试要断言：
- `layout[0].className === 'section-keyboard-mcp'`
- `layout[0].children === ['keyboard', 'mcp']`
- section `id`、`className`、`title` 被正确解析
- `groups[0].items[0]` 保留 `key / desc / badge / added`

建议测试骨架：

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { parsePage } from './parse-upstream.mjs';

test('parsePage 保留 wrapper 顺序和 section 归属', () => {
  const parsed = parsePage(fixtureHtml);
  assert.deepEqual(parsed.layout[0], {
    type: 'wrapper',
    className: 'section-keyboard-mcp',
    children: ['keyboard', 'mcp']
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/parse-upstream.test.mjs`

Expected:
- FAIL
- 失败原因应是 `parsePage` 未导出，或返回结构里没有 `layout` / `id` / `className`

- [ ] **Step 3: Implement minimal parser changes**

在 `scripts/parse-upstream.mjs` 做最小修改：
- 导出 `normalizeText`
- 导出 `parsePage`
- 新增从 `section class` 推导稳定 `id` 的 helper
- 只遍历 `.main-grid` 的直接子节点，识别 wrapper 与 standalone section
- 为每个 section 保留 `id`、`className`、`title`、`groups`
- 让最终写出的 `data/parsed/upstream.json` 包含 `layout`

目标输出结构示例：

```js
return {
  version,
  lastUpdated,
  changelog,
  layout,
  sections
};
```

- [ ] **Step 4: Run parser test to verify it passes**

Run: `node --test scripts/parse-upstream.test.mjs`

Expected:
- PASS
- 无额外失败项

- [ ] **Step 5: Commit parser task**

```bash
git add scripts/parse-upstream.mjs scripts/parse-upstream.test.mjs
git commit -m "test: cover upstream layout parsing"
```

### Task 2: Preserve Layout Through Localization

**Files:**
- Modify: `scripts/transform-content.mjs`
- Test: `scripts/transform-content.test.mjs`

- [ ] **Step 1: Write the failing transform tests**

在 `scripts/transform-content.test.mjs` 构造最小 `upstream` fixture，覆盖：
- `layout` 有 wrapper
- `sections` 含已知 section 和未知 section
- item 同时覆盖 `item-map` 命中、`terms` 命中、完全未命中

测试要断言：
- `localized.layout` 与输入完全一致
- 命中 `section-map` 的标题被翻译
- 未命中的 section 标题保留原文
- 未命中的 item 仍进入 `unmappedItems`

建议测试骨架：

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { transformUpstream } from './transform-content.mjs';

test('transformUpstream 保留 layout 并翻译 section 标题', () => {
  const { localized, unmappedItems } = transformUpstream(input, maps);
  assert.deepEqual(localized.layout, input.layout);
  assert.equal(localized.sections[0].title, '⌨️ 键盘快捷键');
  assert.equal(localized.sections[1].title, '🆕 New Section');
  assert.equal(unmappedItems.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/transform-content.test.mjs`

Expected:
- FAIL
- 失败原因应是 `transformUpstream` 未导出，或 `layout` 未保留

- [ ] **Step 3: Implement minimal transform changes**

在 `scripts/transform-content.mjs` 做最小修改：
- 提取并导出 `applyTerms`
- 提取并导出 `transformUpstream(upstream, maps)`
- 让 `localized` 带上 `layout`
- section 对象保留 `id` 和 `className`
- `layout` 不参与翻译，只透传

目标输出示例：

```js
const localized = {
  version: upstream.version,
  lastUpdated: upstream.lastUpdated,
  changelog: upstream.changelog,
  layout: upstream.layout,
  sections: ...
};
```

- [ ] **Step 4: Run transform tests to verify they pass**

Run: `node --test scripts/transform-content.test.mjs`

Expected:
- PASS

- [ ] **Step 5: Run parser + transform tests together**

Run: `node --test scripts/parse-upstream.test.mjs scripts/transform-content.test.mjs`

Expected:
- 全部 PASS

- [ ] **Step 6: Commit transform task**

```bash
git add scripts/transform-content.mjs scripts/transform-content.test.mjs
git commit -m "test: preserve layout in localized output"
```

### Task 3: Render HTML From Layout

**Files:**
- Modify: `scripts/build-page.mjs`
- Test: `scripts/build-page.test.mjs`
- Modify: `templates/index.template.html` (only if current placeholder layout is insufficient)
- Modify: `styles.css` (only if wrapper class names require minimal compatibility styling)

- [ ] **Step 1: Write the failing build tests**

在 `scripts/build-page.test.mjs` 准备一份最小 `localized` fixture，覆盖：
- 两个 wrapper
- wrapper 下多个 section
- 一个 section 缺失于 `sections` 映射

测试要断言：
- 输出 HTML 中存在 `section-keyboard-mcp`
- wrapper 内 section 顺序与 `layout.children` 一致
- 若 `layout` 引用不存在的 section id，抛出显式错误

建议测试骨架：

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { renderPage } from './build-page.mjs';

test('renderPage 按 layout 渲染 wrapper 和 section', () => {
  const html = renderPage(template, localized);
  assert.match(html, /section-keyboard-mcp/);
  assert.match(html, /section section-keyboard/);
});

test('renderPage 在 layout 引用缺失 section 时抛错', () => {
  assert.throws(() => renderPage(template, brokenLocalized), /missing section/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test scripts/build-page.test.mjs`

Expected:
- FAIL
- 失败原因应是当前构建器没有 `renderPage`，或依然是平铺 sections

- [ ] **Step 3: Implement minimal build changes**

在 `scripts/build-page.mjs` 做最小修改：
- 导出 `escapeHtml`
- 导出 `badgeHtml`
- 提取并导出 `renderSection(section)`
- 提取并导出 `renderPage(template, localized)`
- `renderPage` 先把 `sections` 转为 `Map<section.id, section>`
- 按 `layout` 顺序渲染 wrapper / standalone
- `layout.children` 命中不到 section 时直接抛错

关键实现方向：

```js
const sectionsById = new Map(localized.sections.map((section) => [section.id, section]));
```

```js
if (!section) {
  throw new Error(`missing section for layout child: ${childId}`);
}
```

- [ ] **Step 4: Run build tests to verify they pass**

Run: `node --test scripts/build-page.test.mjs`

Expected:
- PASS

- [ ] **Step 5: Run parser + transform + build tests together**

Run: `node --test scripts/parse-upstream.test.mjs scripts/transform-content.test.mjs scripts/build-page.test.mjs`

Expected:
- 全部 PASS

- [ ] **Step 6: Commit build task**

```bash
git add scripts/build-page.mjs scripts/build-page.test.mjs templates/index.template.html styles.css
git commit -m "feat: render grouped layout from upstream"
```

### Task 4: End-to-End Sync Verification

**Files:**
- Modify: `data/parsed/upstream.json` (generated)
- Modify: `data/generated/localized.json` (generated)
- Modify: `index.html` (generated)

- [ ] **Step 1: Run the full sync pipeline**

Run: `npm run sync`

Expected:
- 输出依次包含：
  - `已抓取上游页面`
  - `已解析上游页面`
  - `已转换内容，未命中条目 N 个`
  - `已生成 index.html`

- [ ] **Step 2: Verify generated JSON contains layout**

Run: `rg -n '"layout"|section-keyboard-mcp|children' data/parsed/upstream.json data/generated/localized.json`

Expected:
- 两个文件都能看到 `layout`
- `upstream.json` 至少能看到 `section-keyboard-mcp`

- [ ] **Step 3: Verify generated HTML contains grouped wrappers**

Run: `rg -n "section-keyboard-mcp|section-slash-memory|section-workflows-config|section-skills-cli" index.html`

Expected:
- `index.html` 至少命中这些 wrapper 中的实际上游组合

- [ ] **Step 4: Run the focused regression suite**

Run: `node --test scripts/parse-upstream.test.mjs scripts/transform-content.test.mjs scripts/build-page.test.mjs scripts/fetch-upstream.test.mjs script.test.mjs`

Expected:
- 全部 PASS

- [ ] **Step 5: Inspect diff before final commit**

Run: `git diff -- scripts/parse-upstream.mjs scripts/transform-content.mjs scripts/build-page.mjs index.html`

Expected:
- 只包含 layout 同步相关改动
- 没有无关文件漂移

- [ ] **Step 6: Commit final integrated result**

```bash
git add scripts/parse-upstream.mjs scripts/parse-upstream.test.mjs scripts/transform-content.mjs scripts/transform-content.test.mjs scripts/build-page.mjs scripts/build-page.test.mjs data/parsed/upstream.json data/generated/localized.json index.html
git commit -m "feat: sync upstream section layout"
```

### Task 5: Final Verification Before Push

**Files:**
- Modify: `.github/workflows/sync.yml` (only if the test/build file paths require trigger updates)

- [ ] **Step 1: Confirm workflow trigger scope is still sufficient**

检查 `.github/workflows/sync.yml` 的 `paths` 是否覆盖：
- `scripts/**`
- `templates/**`
- `package.json`
- `package-lock.json`

若实现没有改 workflow 行为，则不新增其它触发项。

- [ ] **Step 2: Run final acceptance commands**

Run:

```bash
node --test scripts/parse-upstream.test.mjs scripts/transform-content.test.mjs scripts/build-page.test.mjs scripts/fetch-upstream.test.mjs script.test.mjs
npm run sync
```

Expected:
- 所有测试 PASS
- sync 链路成功生成最新文件

- [ ] **Step 3: Push once user asks for execution result**

```bash
git push
```

Expected:
- 远端 `Sync cc.storyfox.cz` workflow 被触发

