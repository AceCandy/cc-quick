# cc-quick

> 一个面向中文开发者的 Claude Code 速查页项目。  
> 页面部署在 GitHub Pages，内容通过 GitHub Actions 定时同步上游站点，并用本地词表做中文映射。

## 项目简介

`cc-quick` 是一个静态站点项目，用来生成和发布 **Claude Code 中文速查表**。

它的目标不是手工长期维护一份大而全的中文文档，而是：

- 自动抓取上游内容
- 自动更新页面
- 优先复用本地词表完成中文化
- 在遇到新条目时尽量不中断发布

当前上游参考来源：

- 速查页来源：[cc.storyfox.cz](https://cc.storyfox.cz/)
- 变更日志来源：[code.claude.com/docs/en/changelog](https://code.claude.com/docs/en/changelog)

## 这个项目解决什么问题

原始速查页更新很快，但中文版本往往需要人工跟进。  
这个项目通过“**抓取 + 解析 + 词表映射 + 静态生成**”的方式，把同步成本尽量压低。

这样做的好处是：

- 页面可以部署在 `github.io`
- 内容能定时自动更新
- 大部分翻译规则集中在词表文件里维护
- 上游新增内容时，不必每次都手动改页面结构

## 工作流程

```text
GitHub Actions 定时触发
        ↓
抓取上游页面与 changelog
        ↓
解析为结构化 JSON
        ↓
按词表做中文映射
        ↓
重新生成 index.html
        ↓
自动提交并触发 GitHub Pages 发布
```

### 词表策略

当前项目采用“**词表优先，未命中保留原文**”的策略。

也就是说：

- 已命中的术语、区块标题、条目描述会转成中文
- 未命中的新增内容不会导致同步失败
- 未命中的内容会保留英文，并输出到未命中清单

这个策略的目的是：

- 保证自动同步稳定运行
- 不因为上游新增 1 个条目就让整站停更
- 后续你只需要补词表，而不是反复改同步代码

## 目录结构

```text
.
├── .github/workflows/sync.yml
├── data/config/
│   ├── item-map.json
│   ├── section-map.json
│   └── terms.json
├── scripts/
│   ├── fetch-upstream.mjs
│   ├── parse-upstream.mjs
│   ├── transform-content.mjs
│   ├── build-page.mjs
│   └── sync.mjs
├── templates/
│   └── index.template.html
├── index.html
├── styles.css
├── script.js
├── package.json
└── README.md
```

### 关键文件说明

- `data/config/item-map.json`  
  具体条目的精准映射，优先级最高

- `data/config/terms.json`  
  通用术语和描述替换规则

- `data/config/section-map.json`  
  区块标题映射

- `scripts/fetch-upstream.mjs`  
  抓取上游页面和 changelog

- `scripts/parse-upstream.mjs`  
  把 HTML 解析成结构化数据

- `scripts/transform-content.mjs`  
  根据词表将内容转换为本地化数据

- `scripts/build-page.mjs`  
  根据模板生成最终 `index.html`

- `.github/workflows/sync.yml`  
  定时同步与自动提交工作流

## 本地开发

### 安装依赖

```bash
npm install
```

### 手动执行完整同步

```bash
npm run sync
```

### 分步执行

```bash
npm run sync:fetch
npm run sync:parse
npm run sync:transform
npm run sync:build
```

## GitHub Pages 部署

### 1. 推送仓库到 GitHub

将当前仓库推送到你的 GitHub 仓库。

### 2. 启用 GitHub Pages

在仓库设置中启用 Pages：

- 打开 `Settings`
- 进入 `Pages`
- 选择从默认分支发布

### 3. 保持 GitHub Actions 可运行

只要 `.github/workflows/sync.yml` 启用，仓库就会按定时任务执行同步。

当前工作流配置：

- 每天定时运行一次
- 支持手动触发 `workflow_dispatch`
- 检测到页面变化时自动提交并推送

## 如何维护词表

如果后续上游新增了命令、参数或描述，一般不需要改脚本。  
优先只改这些文件：

- `data/config/item-map.json`
- `data/config/terms.json`
- `data/config/section-map.json`

### 推荐优先级

1. 先补 `item-map.json`
2. 再补 `terms.json`
3. 最后补 `section-map.json`

原因：

- `item-map.json` 最精准
- `terms.json` 适合批量覆盖描述文本
- `section-map.json` 变化最少

## 自动同步的边界

这个项目追求的是“**大多数时候自动更新**”，不是“永远零维护”。

以下情况通常不需要人工干预：

- 上游新增少量命令或参数
- 上游改了部分短描述
- 上游 changelog 正常更新

以下情况可能需要人工处理：

- 上游 DOM 结构大改
- 页面区块结构发生明显变化
- 新增大量无法靠现有词表覆盖的内容

## 已忽略的文件

当前仓库已经通过 `.gitignore` 过滤以下内容：

- `node_modules/`
- `.DS_Store`
- `.env*`
- `data/upstream/`
- `data/parsed/`
- `data/generated/`

也就是说，仓库里只保留：

- 页面源码
- 构建脚本
- 模板
- 工作流
- 词表配置

不会把依赖目录和抓取缓存提交到仓库。

## 已知限制

- 自动同步优先保证“可用”，不保证所有新增内容立即有高质量中文翻译
- 未命中词表的内容会暂时保留原文
- 如果 GitHub Actions 没有推送权限或仓库认证配置异常，自动提交会失败
- 如果上游站点不可访问，工作流会失败，但不会自动生成错误页面覆盖现有页面

## License

本项目使用仓库内 `LICENSE`。
