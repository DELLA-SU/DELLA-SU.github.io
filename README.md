# 내일의 옷장

공개 주소: https://della-su.github.io/

Fetch Wardrobe의 사용 흐름을 참고해 만든 온라인 옷장 시제품입니다. 기본 화면에는 새로 제작한 실사형 한국인 예시 모델을 보여줍니다. 검정 민소매 상의, 검정 반바지, 맨발 차림입니다. Fetch의 로고, 인형 이미지, 앱 자산과 이전 3D 이미지는 사용하지 않습니다.

## 현재 작동하는 흐름

1. 첫 방문 때 키, 몸무게, 옷장 이름, 정면 전신 사진을 입력합니다. 얼굴 사진도 넣으면 이어서 실사 아바타 생성 화면을 열 수 있습니다. 측면·뒷면 사진은 별도로 표시하며 AI가 그 시점을 생성하지는 않습니다. 전신 사진을 고르기 전에는 예시 모델이 나타납니다. SNS 캡처의 검은 상·하단 UI가 감지되면 사진에서 제외합니다.
2. 옷 사진을 여러 장 올리고 상의·하의·원피스·신발·소품으로 분류합니다.
3. 옷을 눌러 선택하거나 사진 옆 화살표로 옷을 바꿉니다. PC에서는 옷 카드를 사진으로 끌어 놓을 수도 있습니다. 선택한 옷은 옆 목록에 나타납니다. 전신 사진에 실제로 합성하려면 AI 서버가 필요합니다.
4. 코디에 이름을 붙여 앨범에 저장하고, 달력의 날짜에 배치합니다.
5. 코디 이미지를 공유하거나 다운로드할 수 있습니다.
6. 설정에서 인형을 수정하고 데이터 백업을 JSON으로 내보내거나 가져올 수 있습니다.

옷장 데이터는 현재 브라우저의 IndexedDB에 저장됩니다. 다른 기기와 자동 동기화되지 않습니다. 다른 기기로 옮길 때는 백업 파일을 사용하세요. 자동 동기화에는 로그인 및 서버 저장소가 필요합니다.

실사 합성은 로컬 오픈소스 FASHN VTON 또는 별도 설정한 FASHN API를 통해 시험할 수 있습니다. GitHub Pages 공개 사이트에는 AI 추론 서버가 없어서 새 실사 아바타나 코디를 생성할 수 없습니다. AI 결과도 옷의 실제 핏, 치수, 주름, 로고 위치를 정확하게 보장하지 않습니다. 키와 몸무게는 현재 프로필 정보로만 저장되며 사진이나 예시 모델의 비율을 자동으로 바꾸지 않습니다.

## 얼굴·전신 사진 기반 실사 아바타 실험

[Zara 공식 AI 기능 안내](https://static.zara.net/static/pdfs/AT/assistant_terms/Assistant-terms-and-conditions-en_AT-01122025.pdf)에 나오는 순서에 맞춰 얼굴 사진과 전신 사진을 등록하고, 실사 아바타를 생성한 다음 옷 사진을 선택해 가상 착용 이미지를 만드는 흐름을 추가했습니다. [Photta의 해설](https://www.photta.app/ko/blog/how-zara-virtual-try-on-works)은 Zara가 3D 아바타를 회전시킨다고 설명하지만, Zara 공식 안내는 AI가 생성한 이미지라고 설명합니다. Zara의 내부 모델과 실제 3D 구현 방식은 공개되지 않았습니다. 사용한 모델은 Zara의 비공개 내부 모델이 아니라 FASHN의 [Model Create](https://docs.fashn.ai/api-reference/model-create)와 [Try-On Max](https://docs.fashn.ai/api-reference/tryon-max)입니다. Model Create에 얼굴 사진을 `face_reference`, 전신 사진을 `image_reference`로 전달합니다. 검정 민소매·반바지·맨발의 정면 전신 이미지를 생성해 사용자가 확인 후 저장할 수 있습니다. 이후 Try-On Max에 저장된 아바타와 옷 사진을 전달합니다. **현재 결과는 2D 생성 이미지이며 회전 가능한 3D 인형이 아닙니다.** 전신 사진은 생성 결과의 자세와 윤곽을 참고하게 하지만 실제 체형을 정확히 복제하지는 않습니다.

이 실험은 유료 FASHN API 키를 서버의 `FASHN_API_KEY` 환경 변수에 설정한 경우에만 작동합니다. 서버 코드는 [`local_tryon_server.py`](local_tryon_server.py)와 [`fashn_cloud.py`](fashn_cloud.py)에 있습니다. API 키를 공개 HTML, JavaScript 또는 Git에 넣지 마세요. 서버는 127.0.0.1에만 바인딩되며, AI 생성 버튼의 전송 동의 확인 후에만 얼굴·전신·옷 이미지를 FASHN으로 보냅니다. 입력 이미지는 데이터 URI로 보내고 결과도 데이터 URI로 돌려받도록 설정했습니다. FASHN의 [보관 정책](https://docs.fashn.ai/api-overview/data-retention-privacy)에 따르면 요청 기록은 남고, 데이터 URI 입력의 처리용 사본은 작업 완료 후 삭제 대상입니다. 사용자의 실제 사진으로 이 경로를 아직 실행하거나 Zara 수준의 품질을 확인하지 않았습니다.

실행 예시: Pillow가 설치된 Python 환경에서 API 키를 환경 변수로 설정한 뒤 `python local_tryon_server.py --port 4319`를 실행하고 `http://127.0.0.1:4319/`로 접속합니다. API 키가 없으면 기존 오픈소스 로컬 실험만 사용할 수 있습니다.

## 개발 및 배포

별도 빌드 없이 index.html, wardrobe.css, wardrobe.js로 작동합니다. main 브랜치 루트를 GitHub Pages로 배포합니다. 로컬 확인은 저장소 루트에서 python3 -m http.server 4319를 실행한 뒤 http://127.0.0.1:4319/ 을 엽니다.

## 이전 로컬 AI 실험

이 저장소에는 [FASHN VTON v1.5](https://github.com/fashn-AI/fashn-vton-1.5)를 이용한 전신 사진 가상 착용, [SAM 3D Body](https://github.com/facebookresearch/sam-3d-body)의 Apple Silicon 변환 모델을 이용한 몸 메시 실험 코드가 남아 있습니다. 현재 공개 화면에서는 실행되지 않습니다. GitHub Pages는 정적 호스팅이어서 AI 추론을 실행할 수 없습니다.

설치 과정과 실험 결과는 [LOCAL_AI_RESEARCH.md](LOCAL_AI_RESEARCH.md)에 보관했습니다.

이전 실험에서 확인한 한계:

- 가상 착용 AI는 픽셀을 생성하므로 로고나 글자를 바꿀 수 있습니다.
- 사진 두 장만으로 옷의 실제 cm 치수나 신축성을 알 수 없습니다.
- 한 장의 사진으로 만든 3D 몸 메시는 실제 얼굴과 질감을 충실히 재현하지 못했습니다.

기존 샘플 옷·인물 사진의 출처는 FASHN VTON 저장소의 examples/data입니다. AI 모델의 가중치는 Git 저장소에 포함하지 않습니다.
