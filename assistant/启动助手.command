#!/bin/zsh
set -e
cd "${0:A:h}"
coach_python=""
for coach_candidate in "${PHOTO_COACH_PYTHON:-}" "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3" "$(command -v python3.13 || true)" "$(command -v python3.12 || true)" "$(command -v python3.11 || true)" "$(command -v python3 || true)"; do
  if [[ -x "$coach_candidate" ]] && "$coach_candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)' 2>/dev/null; then
    coach_python="$coach_candidate"
    break
  fi
done
if [[ -z "$coach_python" ]]; then
  echo "请安装 Python 3.11 或更新版本后重试。"
  open https://www.python.org/downloads/macos/
  read -r "REPLY?按回车关闭。"
  exit 1
fi
if [[ ! -d .venv ]]; then
  "$coach_python" -m venv .venv
fi
if ! .venv/bin/python -c "import requests, PIL, jsonschema, cv2" 2>/dev/null; then
  .venv/bin/python -m pip install -r requirements.txt
fi
# Prefer an installed Ollama. The development install uses a dedicated user directory.
OLLAMA_BIN="$(command -v ollama || true)"
if [[ -z "$OLLAMA_BIN" && -x "$HOME/.local/share/photo-coach/ollama/ollama" ]]; then
  OLLAMA_BIN="$HOME/.local/share/photo-coach/ollama/ollama"
fi
if [[ -z "$OLLAMA_BIN" ]]; then
  echo "请先从 https://ollama.com/download/mac 安装 Ollama，然后再次打开此文件。"
  open https://ollama.com/download/mac
  read -r "REPLY?按回车关闭。"
  exit 1
fi
# A dedicated process and port ensure cloud routing is disabled, even if another app uses Ollama.
export OLLAMA_NO_CLOUD=1
coach_port="$("$coach_python" -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')"
export OLLAMA_HOST="127.0.0.1:$coach_port"
export OLLAMA_NUM_PARALLEL=1
export OLLAMA_MAX_LOADED_MODELS=1
export OLLAMA_CONTEXT_LENGTH=8192
mkdir -p "$HOME/.local/share/photo-coach"
"$OLLAMA_BIN" serve > "$HOME/.local/share/photo-coach/ollama.log" 2>&1 &
coach_pid=$!
trap 'kill "$coach_pid" 2>/dev/null || true' EXIT
for coach_i in {1..30}; do
  if ! kill -0 "$coach_pid" 2>/dev/null; then
    echo "模型服务未能启动，请查看 ~/.local/share/photo-coach/ollama.log。"
    exit 1
  fi
  if curl --silent --fail "http://127.0.0.1:$coach_port/api/tags" >/dev/null; then break; fi
  sleep 1
done
if ! "$OLLAMA_BIN" show qwen3-vl:4b-instruct >/dev/null 2>&1; then
  if ! "$OLLAMA_BIN" pull qwen3-vl:4b-instruct; then
    echo "尝试通过官方模型仓库下载并校验模型。"
    .venv/bin/python download_model.py
  fi
fi
if [[ ! -f "$HOME/.config/photo-coach/worker.json" ]]; then
  .venv/bin/python worker.py --configure
fi
.venv/bin/python worker.py --endpoint "http://127.0.0.1:$coach_port"
