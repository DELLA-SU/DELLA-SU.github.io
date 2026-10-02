# 온라인 옷장 · 기술 실험실

공개 사이트: https://della-su.github.io/

현재는 두 가지를 시험합니다. [FASHN VTON v1.5](https://github.com/fashn-AI/fashn-vton-1.5)로 전신 사진에 옷을 가상으로 입히고, [SAM 3D Body](https://github.com/facebookresearch/sam-3d-body)의 [Apple Silicon용 MLX 변환 모델](https://huggingface.co/mlx-community/sam-3d-body-dinov3-bf16)로 정면 전신 사진에서 회전 가능한 몸 메시를 만듭니다. GitHub Pages는 정적 사이트이므로 공개 페이지에는 샘플 결과만 있습니다. 본인 사진으로 새 결과를 만드는 버튼은 아래 로컬 서버에서만 작동합니다. 얼굴 사진 업로드 칸은 현재 브라우저 미리보기만 제공하며 생성 요청에 포함하지 않습니다.

## 로컬 AI 실험

macOS Apple Silicon, Python 3.12 기준입니다. FASHN 모델 가중치는 약 2GB, 3D 모델은 약 2.8GB이며 Git 저장소에 넣지 않습니다.

가상 착용 모델:

```sh
git clone https://github.com/fashn-AI/fashn-vton-1.5.git
cd fashn-vton-1.5
git apply ../mps.patch
python3.12 -m venv ../.venv
../.venv/bin/pip install torch torchvision safetensors huggingface_hub pillow numpy opencv-python tqdm einops onnxruntime matplotlib fashn-human-parser
../.venv/bin/pip install --no-deps -e .
../.venv/bin/python scripts/download_weights.py --weights-dir ./weights
cd ..
```

3D 몸 모델:

```sh
python3.12 -m venv .venv-avatar
.venv-avatar/bin/pip install mlx-vlm==0.7.4 trimesh==5.1.0
.venv-avatar/bin/python -c "from huggingface_hub import snapshot_download; snapshot_download('mlx-community/sam-3d-body-dinov3-bf16', local_dir='sam-3d-body-mlx-weights')"
```

서버 실행:

```sh
PYTORCH_ENABLE_MPS_FALLBACK=1 .venv/bin/python local_tryon_server.py \
  --weights-dir fashn-vton-1.5/weights \
  --avatar-python .venv-avatar/bin/python \
  --avatar-weights-dir sam-3d-body-mlx-weights \
  --port 4319
```

http://127.0.0.1:4319/ 을 열면 됩니다. 서버는 `127.0.0.1`에만 연결됩니다. 전신 사진과 옷 사진은 생성 요청 중 이 로컬 서버로 전송되고 임시 파일은 요청 후 삭제됩니다. 얼굴 사진은 서버로 전송하지 않습니다. M4 맥에서 가상 착용 20단계는 약 8분, 샘플 3D 몸 메시 생성은 약 5초였습니다. `mps.patch`는 원본 라이브러리의 float64 텐서를 MPS용 float32로 바꿉니다. 3D 품질과 속도는 사진 및 기기에 따라 다릅니다.

## 얼굴 사진은 몇 장 필요한가

[Avat3r 논문 부록 Figure 15](https://tobias-kirschstein.github.io/avat3r/static/Avat3r_paper.pdf)는 **1장, 4장, 7장**으로 학습한 얼굴 3D 모델을 비교합니다. 그 실험에서는 1장일 때 품질이 눈에 띄게 낮고, 4장을 넘겨도 큰 개선이 없었습니다. 따라서 이 프로젝트의 **첫 얼굴 캡처 실험은 4장**으로 잡습니다: 정면, 왼쪽 45도, 오른쪽 45도, 측면. 머리카락 뒷모양까지 필요하다면 뒤쪽 사진을 추가하는 것이 합리적이지만, 이 각도 조합과 5번째 사진의 효과는 아직 자체 검증 전입니다. 위 논문은 4장 입력을 쓰는 별도의 얼굴 모델에 관한 결과로, 현재 사이트에 연결한 몸 모델의 얼굴 재현 성능을 뜻하지 않습니다. Avat3r 공식 구현은 [GitHub에 공개 코드가 아직 없는 상태](https://github.com/tobias-kirschstein/avat3r)라 이 맥에서 동일한 1장/4장/7장 실행을 재현하지 못했습니다.

직접 실행한 실험은 기존 캐릭터 정면 전신 이미지 1장 → 3D 몸 메시입니다. 몸 윤곽과 회전 보기는 구현됐지만 생성된 얼굴은 원본을 닮지 않았고 머리카락·피부 질감도 없습니다. 본인 얼굴 사진을 이용한 정량적인 닮음 평가는 사진을 받은 뒤 진행할 수 있습니다.

## 정확도와 사용 범위

- 가상 착용 AI는 픽셀을 생성하므로 로고와 글자를 바꿀 수 있습니다. 결과의 로고·무늬 보정 도구는 원본 옷 사진의 선택 영역을 복사해 위치와 크기를 수동으로 맞춥니다. 주름을 따라 완벽하게 변형하거나 원본과 완전히 같게 보장하지는 않습니다.
- 두 사진만으로 옷의 실제 cm 크기나 신축성을 알 수 없습니다. 실측 비교 칸은 몸 둘레와 옷 단면을 직접 입력해 둘레 차이를 계산하며, 물리적인 착용감을 판정하지 않습니다.
- 3D 몸 메시는 정면 한 장에서 추정한 **무색·무질감 형상**입니다. 실제 신체 치수, 얼굴 닮음, 자연스러운 옷 착용을 보장하지 않습니다.
- 아직 계정, 여러 기기 동기화, 옷장 저장은 구현하지 않았습니다.

## 출처

- FASHN VTON v1.5: Apache 2.0. 예시 인물·옷 이미지는 해당 저장소의 `examples/data`에서 가져왔고 착용 예시 결과는 로컬 실행으로 생성했습니다. [FASHN Human Parser](https://github.com/fashn-AI/fashn-human-parser)는 별도 라이선스입니다.
- SAM 3D Body MLX 변환 모델: [모델 카드](https://huggingface.co/mlx-community/sam-3d-body-dinov3-bf16), [SAM License](sam-3d-body-LICENSE.txt). 샘플 3D 메시를 만들 때 사용했고 모델 가중치는 배포하지 않습니다.
- 3D 뷰어: [Google model-viewer](https://github.com/google/model-viewer), Apache 2.0. 배포 코드에 고정된 4.3.1 파일과 [라이선스](model-viewer-LICENSE.txt)를 포함합니다.

배포는 `main` 브랜치 루트의 GitHub Pages를 사용합니다.
