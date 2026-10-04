#!/bin/zsh
set -e
cd "${0:A:h}"
export PYTORCH_ENABLE_MPS_FALLBACK=1
../../work/tryon-research/.venv/bin/python server.py
