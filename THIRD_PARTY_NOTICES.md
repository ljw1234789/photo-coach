# 第三方资料

仓库代码采用 MIT License。以下照片、模型和依赖遵循各自许可，不被仓库的 MIT License 重新授权。

## 示例照片

`dist/assets/sample.jpg`：Wesley Tingey / Unsplash。

- [原始照片](https://unsplash.com/photos/woman-on-street-LpZvsGynEho)
- [Unsplash License](https://unsplash.com/license)

人工编写的 `sample-review.json` 只演示产品形式，页面明确标为示例；不会计入使用者的档案。

## 本地模型与依赖

模型不随此仓库分发，由使用者通过 Ollama 下载。

- [Ollama](https://github.com/ollama/ollama/blob/main/LICENSE)
- [Qwen3-VL 模型资料与许可](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct)
- Python 包：Requests、Pillow、jsonschema、OpenCV，见 `assistant/requirements.txt`。
- 开发依赖：PGlite、Playwright，见 `package.json` 与锁文件。

公开样片的实验结果保存在 `verification/`；除上述示例，测试原始照片不随仓库分发。
