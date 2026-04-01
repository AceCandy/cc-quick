# Upstream Layout Sync Design

**日期**：2026-04-01  
**仓库**：`cc-quick`  
**主题**：让页面分组与分组下字段随上游 `cc.storyfox.cz` 自动同步

---

## 1. 背景与问题

当前同步链路已经能抓到上游 section、group、item 文本，但没有保留上游的模块编排信息。

现状证据：

- `scripts/parse-upstream.mjs` 只遍历 `.section`，没有读取 `main-grid` 下的 wrapper 容器。
- `scripts/transform-content.mjs` 只处理 section 标题和字段文案映射，不处理布局。
- `scripts/build-page.mjs` 直接把 `localized.sections` 平铺输出。
- `data/upstream/storyfox.html` 中实际存在 `section-keyboard-mcp`、`section-slash-memory`、`section-workflows-config`、`section-skills-cli` 这类 wrapper。

这会导致两个结果：

1. 上游 section 标题、字段变化时，本地页面大概率能跟上。
2. 上游模块分组或 section 归属变化时，本地页面不会跟上，最终页面结构与原版漂移。

---

## 2. 目标

本次设计只解决“结构同步”，不解决“视觉还原”。

明确目标：

- 页面分组顺序与上游一致。
- 每个分组下包含哪些 section，与上游一致。
- 每个 section 下的 group 和 item 字段，与上游一致。
- 继续复用现有中文词表体系：`section-map.json`、`item-map.json`、`terms.json`。
- Actions 跑 `npm run sync` 后，若上游模块分组变化，生成页也随之变化。

---

## 3. 非目标

本轮明确不做：

- 不做原站 CSS / 响应式布局复刻。
- 不做像素级视觉一致性。
- 不做 section/group 的人工重排。
- 不做为了“看起来更像原站”而硬编码模块位置。

---

## 4. 现有链路

当前自动化入口不变：

- `package.json` 中 `npm run sync`
- `scripts/sync.mjs`
- `.github/workflows/sync.yml`

当前链路为：

```text
fetch-upstream
  -> parse-upstream
  -> transform-content
  -> build-page
```

本次设计只改变后三段的数据结构，不改 workflow 入口和基本执行顺序。

---

## 5. 设计原则

### 5.1 结构与文案分离

布局信息和翻译信息分开存。

- 布局信息：wrapper 顺序、wrapper 下有哪些 section、section class
- 文案信息：section 标题、group 标题、item key / desc / badge

这样可以保证：

- 上游结构变了，页面结构自动跟
- 中文词表缺失时，不会影响结构同步

### 5.2 低侵入

尽量沿用当前文件职责，不引入新的运行依赖，不改变 workflow 行为。

### 5.3 失败可降级但不静默丢结构

如果遇到新 wrapper / 新 section：

- 页面仍然生成
- 标题可以先保留原文
- 结构不能被吞掉

---

## 6. 目标数据结构

### 6.1 `data/parsed/upstream.json`

从“只有平铺 sections”升级为“layout + sections”。

建议结构：

```json
{
  "version": "Claude Code v2.1.88",
  "lastUpdated": "Last updated: March 31, 2026",
  "changelog": [],
  "layout": [
    {
      "type": "wrapper",
      "className": "section-keyboard-mcp",
      "children": ["keyboard", "mcp"]
    },
    {
      "type": "wrapper",
      "className": "section-slash-memory",
      "children": ["slash", "memory"]
    }
  ],
  "sections": [
    {
      "id": "keyboard",
      "className": "section-keyboard",
      "title": "⌨️ Keyboard Shortcuts",
      "groups": []
    }
  ]
}
```

字段说明：

- `layout`：只表达编排关系
- `sections`：只表达 section 的内容
- `id`：供 `layout.children` 引用，避免靠标题字符串关联
- `className`：保留上游 section / wrapper 的 class，为后续样式对齐保留空间

### 6.2 `data/generated/localized.json`

保留与 `upstream.json` 一致的 layout 骨架，仅翻译文案字段。

建议结构：

```json
{
  "version": "...",
  "lastUpdated": "...",
  "changelog": [],
  "layout": [...],
  "sections": [
    {
      "id": "keyboard",
      "className": "section-keyboard",
      "title": "⌨️ 键盘快捷键",
      "groups": [...]
    }
  ]
}
```

---

## 7. `parse-upstream` 设计

### 7.1 新职责

`scripts/parse-upstream.mjs` 除了提取 section 内容，还要解析 `main-grid` 下的编排结构。

### 7.2 解析规则

1. 进入 `.main-grid`
2. 按 DOM 顺序遍历它的直接子节点
3. 识别两类节点：
   - wrapper：例如 `div.section-keyboard-mcp`
   - standalone section：如果未来上游直接把某个 `.section` 放在 `main-grid` 下，也要兼容
4. 对每个 section 提取：
   - `id`
   - `className`
   - `title`
   - `groups`

### 7.3 `id` 生成策略

优先级：

1. 从 section class 推导  
   例如 `section-keyboard` -> `keyboard`
2. 如果 class 不满足规则，再从标题 slug 推导

要求：

- 稳定
- 可序列化
- 不依赖中文翻译

---

## 8. `transform-content` 设计

### 8.1 保留 layout，不参与翻译

`layout` 原样透传到 `localized.json`。

### 8.2 section 标题映射

继续沿用：

- `data/config/section-map.json`

规则：

- 命中则翻译
- 未命中保留原文，不阻断构建

### 8.3 group / item 处理

继续沿用现有策略：

1. `item-map.json`
2. `terms.json`
3. 保留原文

未命中条目继续写入：

- `data/parsed/unmapped-items.json`

---

## 9. `build-page` 设计

### 9.1 当前问题

当前 `scripts/build-page.mjs` 直接 `localized.sections.map(...)`，天然会把 section 拍平。

### 9.2 新渲染方式

改为两层输出：

1. 按 `layout` 顺序渲染 wrapper / standalone
2. wrapper 内再按 `children` 渲染 section

最终 HTML 结构示意：

```html
<main class="main-grid">
  <div class="section-keyboard-mcp">
    <section class="section section-keyboard">...</section>
    <section class="section section-mcp">...</section>
  </div>

  <div class="section-slash-memory">
    <section class="section section-slash">...</section>
    <section class="section section-memory">...</section>
  </div>
</main>
```

这能保证：

- section 分组与上游一致
- section 内容仍走现有本地翻译链路
- 后续如要补样式，只需要在模板 / CSS 层增量补齐 wrapper class

---

## 10. 容错策略

### 10.1 新 wrapper

如果上游出现未知 wrapper class：

- 仍输出该 wrapper
- 仍渲染其 children
- 不因未知 class 报错

### 10.2 新 section

如果出现新 section：

- 结构保留
- 标题保留原文
- item 文案走原有未命中策略

### 10.3 section 与 layout 不一致

如果 layout 引用了不存在的 section id：

- 构建阶段显式报错
- 不做静默忽略

这类错误属于结构数据不一致，必须暴露出来。

---

## 11. 测试策略

### 11.1 `parse-upstream` 测试

新增最小 HTML fixture，验证：

- wrapper 顺序正确
- wrapper 下 section 归属正确
- section 的 group / item 仍能解析

### 11.2 `transform-content` 测试

新增 fixture，验证：

- `layout` 原样保留
- section 标题正确映射
- item 文案仍按 `item-map -> terms -> 原文` 处理

### 11.3 `build-page` 测试

新增 fixture，验证：

- wrapper 容器被正确输出
- section 顺序与 layout 一致
- 未知 section 不会被静默吞掉

### 11.4 端到端 smoke test

跑一次：

```bash
npm run sync
```

验证：

- `data/parsed/upstream.json` 有 `layout`
- `data/generated/localized.json` 有 `layout`
- `index.html` 按 layout 渲染分组

---

## 12. 实施顺序

### 阶段一：解析结构

修改：

- `scripts/parse-upstream.mjs`

完成标志：

- `upstream.json` 包含 `layout`

### 阶段二：保留结构并翻译文案

修改：

- `scripts/transform-content.mjs`

完成标志：

- `localized.json` 保留 `layout`

### 阶段三：按结构渲染页面

修改：

- `scripts/build-page.mjs`
- 视需要微调 `templates/index.template.html`
- 如确有必要，再最小改动 `styles.css`

完成标志：

- `index.html` 的分组和分组下字段与上游一致

---

## 13. 风险与控制

风险 1：上游 class 命名变化  
控制：`id` 生成支持 class 优先、标题 slug 兜底

风险 2：词表缺失导致中文不完整  
控制：保留原文，不阻断结构同步

风险 3：构建阶段吞掉布局错误  
控制：layout 引用缺失 section 时直接报错

---

## 14. 结论

推荐方案是：**把上游布局骨架数据化，并在本地仅翻译文案，不重写结构。**

这样可以在不处理视觉还原的前提下，先把用户最在意的同步能力做对：

- 分组跟上游
- 分组下字段跟上游
- Actions 自动同步时，页面结构也会跟着变

