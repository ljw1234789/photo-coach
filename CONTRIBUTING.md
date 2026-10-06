# 参与开发

欢迎通过 Issue 提供问题复现、摄影建议和功能反馈，通过 Pull Request 提交修改。

请不要在公开 Issue、日志或 PR 中放个人照片、完整登录链接、账号密码、会话令牌或私密密钥。复现素材可使用自己允许公开的图片或合成图片；说明拍摄意图和你认为点评哪里不准确。

## 开发环境

Node.js 22+、pnpm 10、Python 3.11+。本地推理还需要 Ollama。

```sh
pnpm install --frozen-lockfile
python3 -m venv .venv
.venv/bin/python -m pip install -r assistant/requirements.txt
source .venv/bin/activate
pnpm dev
```

修改助手或 SQL 后，重新生成下载包：

```sh
.venv/bin/python scripts/package_assistant.py
```

提交前运行：

```sh
pnpm check
pnpm test:db
pnpm test:worker
pnpm test:ui
.venv/bin/python scripts/package_assistant.py --check
```

第一次运行浏览器测试可执行 `pnpm exec playwright install chromium`。在安装了 Chrome 的 Mac 上会优先使用现有 Chrome。测试自动启动临时服务器，并以 `/photo-coach/` 子路径验证 GitHub Pages 兼容性。

数据库测试使用实际 PostgreSQL 引擎 PGlite，浏览器流程使用模拟 Supabase。它们不替代真实 Supabase 项目的联调，也不替代摄影质量评估。
