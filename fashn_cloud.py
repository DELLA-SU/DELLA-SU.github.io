"""Optional FASHN API adapter. Personal images are sent only by explicit UI action.

The API key is read by the local server from FASHN_API_KEY; never expose it in JS.
"""

import json
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


API_ROOT = "https://api.fashn.ai/v1"


class FashnError(Exception):
    pass


def _request(method, path, key, payload=None):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(
        API_ROOT + path,
        data=data,
        method=method,
        headers={
            "Authorization": "Bearer " + key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=35) as response:
            return json.load(response)
    except HTTPError as exc:
        try:
            detail = json.load(exc)
            message = detail.get("message") or str(detail.get("error"))
        except (ValueError, AttributeError):
            message = f"HTTP {exc.code}"
        raise FashnError(f"FASHN 요청 실패: {message}") from exc
    except (URLError, TimeoutError) as exc:
        raise FashnError("FASHN 서버에 연결하지 못했어요.") from exc


def generate(key, model_name, inputs, timeout=240):
    """Submit one image job and return its base64 data URI."""
    started = _request("POST", "/run", key, {
        "model_name": model_name,
        "inputs": {**inputs, "return_base64": True, "num_images": 1},
    })
    job_id = started.get("id")
    if not isinstance(job_id, str) or not job_id:
        raise FashnError("FASHN 작업 ID를 받지 못했어요.")
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        time.sleep(3)
        status = _request("GET", "/status/" + job_id, key)
        if status.get("status") == "failed":
            error = status.get("error") or {}
            raise FashnError("FASHN 생성 실패: " + str(error.get("message") or error))
        if status.get("status") == "completed":
            output = status.get("output")
            if isinstance(output, dict):
                output = output.get("images")
            image = output[0] if isinstance(output, list) and output else None
            if not isinstance(image, str) or not image.startswith("data:image/"):
                raise FashnError("FASHN 이미지 응답 형식이 올바르지 않아요.")
            return image
    raise FashnError("이미지 생성 대기 시간이 초과됐어요.")


def create_avatar(key, face_image, body_image):
    # The body image guides composition and silhouette; this is a 2D image,
    # not a measurement-accurate 3D scan.
    return generate(key, "model-create", {
        "prompt": (
            "Photorealistic full-body front-facing fashion portrait of the same adult person "
            "as the references. Preserve facial identity, hairstyle, skin tone, natural body "
            "proportions and the full-body reference silhouette as closely as possible. "
            "Standing straight, arms relaxed and separated from torso, legs visible to feet. "
            "Wear a simple plain black sleeveless cropped tank top and plain black fitted "
            "shorts, barefoot. Neutral clean studio background. No logos, no accessories."
        ),
        "image_reference": body_image,
        "face_reference": face_image,
        "face_reference_mode": "match_reference",
        "aspect_ratio": "9:16",
        "resolution": "2k",
        "generation_mode": "balanced",
        "output_format": "png",
    })


def try_on(key, avatar_image, garment_image):
    return generate(key, "tryon-max", {
        "model_image": avatar_image,
        "product_image": garment_image,
        "resolution": "2k",
        "generation_mode": "balanced",
        "output_format": "png",
    })
