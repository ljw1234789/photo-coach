# 取景 · 个人摄影教练

看懂照片里的问题，用一次次练习找到自己的拍摄方式。

一个适合手机和电脑的中文网页工具：**上传照片 → 看懂问题 → 按建议练习 → 提交重拍 → 回看进步**。以人像和日常随拍为主，兼顾风景、建筑。不用一个总分评价摄影水平。

**[打开网页](https://ljw1234789.github.io/photo-coach/)** · [下载 Mac 助手](dist/downloads/photo-coach-assistant.zip) · [建库 SQL](supabase/schema.sql) · [首次连接指南](https://ljw1234789.github.io/photo-coach/downloads/使用说明.html)

网页只提供前端。每位使用者需要自己的 **Supabase 项目**和一台运行本地助手的 **Mac**；开箱可查看明确标记的人工功能示例，真实照片不会收到模拟点评。公共网页不预置维护者的云端配置，也不提供公共 AI 服务。

## 能做什么

| 功能 | 用法 |
| --- | --- |
| 照片诊断 | 解释最值得改的 0～3 个问题，同时保留优点，不强行挑错 |
| 图上讲解 | 在近似问题区域标注，点击数字查看具体建议 |
| 参考图学习 | 上传喜欢的照片，拆解拍法，与自己的作品一起分析 |
| 专项练习 | 保存一项练习，提交关联重拍，查看前后改变 |
| 成长档案 | 保留照片、点评和练习；常见问题用具体记录支持，不给摄影总分 |

每条问题回答：哪里有问题、为什么、下次怎么拍、这张怎样补救、如何练习。可以展开参数建议。无法判断的地方明确说明，没有 EXIF 不编造参数。标为“点评不准确”的结果不计入成长趋势。

## 第一次使用

### 1. 建立你自己的云端档案

1. 在 [Supabase](https://supabase.com/dashboard) 创建一个**新的空项目**。
2. 打开 SQL Editor，粘贴 [supabase/schema.sql](supabase/schema.sql) 的全部内容，运行一次。它创建数据表、私有图片桶、账号隔离策略与任务队列。
3. 找到 Project URL 和 Publishable key / anon key。在网页“连接与设置”填写这两项。**不要填写 Secret key 或 service_role key。**
4. 在 Authentication → URL Configuration，将网页完整地址加入 Site URL 与 Redirect URLs。本站地址为 `https://ljw1234789.github.io/photo-coach/`；自己部署则填写自己的地址。
5. 在取景网页中创建邮箱账号、按邮件验证，再登录。

同一项目中的每个账号也有独立访问策略；默认建议每个人使用自己的项目。项目的费用与限额以 Supabase 当前方案为准。

### 2. 在你的 Mac 上启动分析

1. 安装 [Python 3.11 或更新版本](https://www.python.org/downloads/macos/) 和 [Ollama](https://ollama.com/download/mac)。
2. 在网页“连接与设置”下载 Mac 助手 ZIP，解压后打开 `启动助手.command`。
3. 脚本建立独立 Python 环境，并下载 `qwen3-vl:4b-instruct`。首次模型下载约 3.3GB，随后复用已有模型。
4. 按终端提示输入**与你的网页相同**的项目地址、公开密钥、邮箱和密码。输入密码不显示字符，密码不会保存。
5. 保持助手终端和 Mac 在线，然后上传 JPEG / PNG 照片。

若 `.command` 无法直接打开，在终端输入 `zsh `，将文件拖进去，再按回车。已有模型后不再重复下载。

AI 只连本机回环地址。启动脚本运行独立 Ollama 进程并设置 `OLLAMA_NO_CLOUD=1`，不依赖云端模型，不需要给 Mac 开公网端口。

### 3. 手机回看与练习

在电脑网页点击“复制手机连接链接”，用手机打开并登录同一账号。照片、点评和练习通过 Supabase 同步。电脑离线时，新照片显示“等待电脑分析”；有网络时仍可查看已有记录。

## 自己部署到 GitHub Pages

1. Fork 本仓库。
2. 在自己的仓库打开 Settings → Pages，将 Source 设为 **GitHub Actions**。
3. 打开 Actions → **Publish GitHub Pages** → Run workflow，选择 `main`。
4. 部署完成后使用 GitHub 返回的地址；将它加入你自己的 Supabase 认证回调地址。

工作流仅发布 `dist/` 中的静态网页。项目无需编译，所有图片、脚本和下载链接使用相对路径，支持 GitHub Pages 的仓库子路径。发布网页不需要把 Supabase 密钥写进 GitHub Secrets 或源代码。

参考：[GitHub Pages 工作流文档](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## 本地打开网页

下载仓库 ZIP 并解压，用 Python 启动静态服务：

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

打开 `http://127.0.0.1:4173/`。也可安装 Node.js 22+ 后运行 `node scripts/serve.mjs`。请通过 HTTP 服务访问，直接双击 HTML 的 `file://` 模式不适合 ES 模块。

## 数据与默认边界

- 支持 JPEG / PNG，最大 20MB、5000 万像素；RAW / HEIC 请先导出 JPEG。
- 原片保存在私人云端桶。网页上传原片，助手只在分析时按 EXIF 方向校正并缩小到最长边 1280px，且只向模型提供非定位 EXIF。需要去除原片定位信息时，请在上传前自行移除。
- 浏览器本地保存连接设置和登录会话；实际照片、点评与练习在 Supabase。助手的可刷新登录凭据保存在本机 `~/.config/photo-coach/worker.json`，文件权限为 `0600`，不保存密码。
- 页面中的全套示例是人工编写的功能演示，不是上传照片的真实 AI 结果。
- 分析任务使用提交 ID、租约和心跳，支持中断重试，避免重复记录。删除先使任务失效，再通过持久清理队列删除云端图片；网络恢复后继续清理。
- 删除原片会级联删除对应练习和后续重拍；关联中的参考图不能直接删除。平台备份留存取决于你自己的 Supabase 项目设置。
- 可导出 JSON 档案；原片在照片详情单独下载。
- 成长趋势按相同照片类型的问题标签统计，至少出现三次才展示，不计低置信度或标为不准确的点评。
- 图上标注是近似区域。审美与模型建议需要结合拍摄意图校准；16GB M5 的少量公开样片测试不能保证所有设备或题材的效果。

## 验证与开发

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。GitHub Actions 自动检查语法、数据库隔离、队列与删除一致性、本地助手、下载包同步，以及浏览器操作与手机布局。

数据库测试在 PGlite 的实际 PostgreSQL 上运行；浏览器使用模拟 Supabase 响应。真实云端联调仍需要配置一个 Supabase 项目。公开样片的本机推理结果见 [verification/](verification/README.md)。

单张本地分析也可以不创建云端项目，在 `assistant/` 中安装依赖后运行：

```sh
python3 worker.py --image /path/to/photo.jpg --output review.json
```

此时需先启动本机 Ollama 并下载 `qwen3-vl:4b-instruct`。`--reference` 和 `--before` 可加入参考图与原片。

## 许可

代码采用 [MIT License](LICENSE)，允许使用、修改和分发。示例照片、模型和依赖遵循各自许可，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
