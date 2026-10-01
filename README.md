# 온라인 옷장 · 가상 착용 실험

공개 사이트: https://della-su.github.io/

이 단계는 FASHN VTON v1.5를 실제로 실행해 핏과 화면 구성을 평가하는 실험입니다. GitHub Pages에는 정적 HTML/CSS/JS와 **사전 생성한 예시 결과**가 게시됩니다. 사용자 사진으로 새 결과를 만드는 기능은 아래의 로컬 서버에서만 작동합니다. 계정, 여러 기기 동기화, 옷장 저장은 아직 구현하지 않았습니다.

## 로컬 AI 실험 실행

macOS Apple Silicon, Python 3.12 기준입니다. 모델 가중치는 약 2GB이며 이 저장소에 포함하지 않습니다.

```sh
git clone https://github.com/fashn-AI/fashn-vton-1.5.git
cd fashn-vton-1.5
git apply ../mps.patch
python3.12 -m venv ../.venv
../.venv/bin/pip install torch torchvision safetensors huggingface_hub pillow numpy opencv-python tqdm einops onnxruntime matplotlib fashn-human-parser
../.venv/bin/pip install --no-deps -e .
../.venv/bin/python scripts/download_weights.py --weights-dir ./weights
cd ..
PYTORCH_ENABLE_MPS_FALLBACK=1 .venv/bin/python local_tryon_server.py --weights-dir fashn-vton-1.5/weights --port 4319
```

브라우저에서 http://127.0.0.1:4319/ 을 엽니다. 서버는 `127.0.0.1`에만 연결되며, 사진은 생성 요청 중 이 로컬 서버로만 전달합니다. M4 맥에서 20단계 생성에 약 8분이 걸렸습니다. `mps.patch`는 원본 라이브러리의 float64 텐서를 Apple MPS에서 사용할 수 있게 float32로 바꿉니다.

## 출처와 한계

- [FASHN VTON v1.5](https://github.com/fashn-AI/fashn-vton-1.5), Apache 2.0. 예시 인물·옷 이미지는 해당 저장소의 `examples/data`에서 가져왔고 예시 결과는 이 모델을 로컬에서 실행해 생성했습니다.
- 모델이 사용하는 [FASHN Human Parser](https://github.com/fashn-AI/fashn-human-parser)는 별도 라이선스가 있습니다. 외부 서비스로 운영하기 전 의존성 라이선스를 다시 검토해야 합니다.
- 가상 착용 이미지는 사이즈, 소재의 물리적 움직임, 실제 핏을 보증하지 않습니다. 로고와 세부 무늬가 바뀔 수 있습니다.

배포는 `main` 브랜치의 루트가 GitHub Pages에 연결되어 있습니다.
