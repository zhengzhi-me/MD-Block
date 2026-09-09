# MD Block

在 Figma 画布中编辑、展示和共享 Markdown 文档的开源 Widget。

[![Figma Community](https://img.shields.io/badge/Figma_Community-安装_MD_Block-F24E1E?logo=figma&logoColor=white)](https://www.figma.com/community/widget/1671425799803301634)
[![Version](https://img.shields.io/badge/version-0.2.3-2563EB)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/license-MIT-171717)](./LICENSE)

## 在线使用

直接从 Figma Community 安装：

**[打开 MD Block Widget](https://www.figma.com/community/widget/1671425799803301634)**

## 功能特性

- 在弹窗编辑器中编写 Markdown，并将内容直接渲染到 Figma 画布。
- 支持标题、正文、引用、列表、任务列表、代码块、分隔线、表格、链接和图片。
- 支持 Markdown 文件导入，以及 Markdown 与图片附件导出。
- 自动生成文档目录，并支持目录折叠与标题定位。
- 支持将选中的画板、组或图层插入为链接。
- 点击画布中的 Figma 节点链接，可直接切换页面、选中并定位目标节点。
- 同一 Figma 文件只需绑定一次文件链接，文件内的 MD Block 可共同复用。
- 支持个人草稿和团队文件，不依赖 Figma 私有 API 或外部网络服务。
- 保留旧版 Widget 的标题、Markdown、图片和链接配置，支持向后兼容升级。

## 使用方法

1. 在 Figma Community 安装并运行 MD Block。
2. 点击画布中的 Block，打开 Markdown 编辑窗口。
3. 编辑内容后保存，Markdown 会同步渲染到画布。
4. 插入画板链接时，先在画布中选择目标画板、组或图层，再点击编辑器顶部的“插入画板”。
5. 首次插入时按提示绑定当前 Figma 文件链接；同一文件后续无需重复绑定。

绑定入口也可以通过右键“插入画板”按钮打开。Widget 被复制到另一个 Figma 文件后，需要为新文件重新绑定一次链接。

## 本地开发

### 环境要求

- Node.js 18 或更高版本
- npm
- Figma Desktop

### 安装与构建

```bash
git clone https://github.com/zhengzhi-me/MD-Block.git
cd MD-Block
npm install
npm run typecheck
npm run build
```

构建结果位于 `dist/`：

- `dist/widget.js`：Widget 主线程代码
- `dist/index.html`：Markdown 编辑器界面

### 在 Figma 中加载

1. 打开 Figma Desktop 和一个 Figma Design 文件。
2. 从开发菜单选择导入 Widget 的 `manifest.json`。
3. 选择仓库根目录中的 `manifest.json`。
4. 在开发版 Widgets 列表中运行 MD Block。

开发监听模式：

```bash
cd MD-Block
npm run dev
```

## 项目结构

```text
src/
├── shared/          # Widget 与编辑器共享的消息类型
├── ui/              # Markdown 编辑弹窗（React + Milkdown）
└── widget/          # Figma Widget 画布渲染与主线程逻辑
docs/需求/            # 版本需求文档
dist/                # 可由 manifest.json 直接加载的构建产物
manifest.json        # Figma Widget 配置
CHANGELOG.md         # 版本记录、兼容性与验证状态
```

## 数据与隐私

- Markdown、标题和图片附件存储在 Figma Widget 的同步状态中。
- 当前文件 Key 存储在 Figma 文档的 Widget 私有插件数据中，仅用于生成当前文件的节点链接。
- Widget 不向外部服务器发送文档内容，`manifest.json` 中的网络访问配置为 `none`。
- 协作者是否能查看或定位节点，仍取决于对应 Figma 文件权限。

## 版本记录

当前公开版本为 **V0.2.2**，仓库开发版本为 **V0.2.3（待发布）**。完整功能变化、数据兼容和验证结果请查看 [CHANGELOG.md](./CHANGELOG.md)。

## 参与贡献

欢迎提交 Issue 或 Pull Request。提交前请确保以下命令通过：

```bash
npm run typecheck
npm run build
```

## License

[MIT](./LICENSE) © 2026 Zhengzhi
