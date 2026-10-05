"""Local virtual try-on server for the wardrobe prototype.

Runs only on this Mac. Garment photos are held in memory for inference and are
never written to the website directory or sent to a hosted API.
"""

from __future__ import annotations

import base64
import binascii
import io
import json
import os
import threading
import traceback
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

from PIL import Image, UnidentifiedImageError


SITE_DIR = Path(__file__).resolve().parent
ROOT_DIR = SITE_DIR.parents[1]
MODEL_DIR = ROOT_DIR / "work" / "tryon-research" / "fashn-vton-1.5" / "weights"
PERSON_IMAGE = SITE_DIR / "assets" / "base-character.png"
PORT = int(os.environ.get("WARDROBE_PORT", "4319"))
MAX_BODY_BYTES = 18 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
ALLOWED_ORIGINS = {
    f"http://127.0.0.1:{PORT}",
    f"http://localhost:{PORT}",
    "https://della-su.github.io",
}
pipeline = None
pipeline_lock = threading.Lock()


def read_image(data_url: str) -> Image.Image:
    if not isinstance(data_url, str) or "," not in data_url:
        raise ValueError("옷 사진을 읽을 수 없어요.")
    header, encoded = data_url.split(",", 1)
    if header not in ("data:image/jpeg;base64", "data:image/png;base64", "data:image/webp;base64"):
        raise ValueError("JPG, PNG, WEBP 사진만 사용할 수 있어요.")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except binascii.Error as exc:
        raise ValueError("옷 사진 파일이 손상됐어요.") from exc
    if len(raw) > 12 * 1024 * 1024:
        raise ValueError("12MB 이하의 사진을 사용해 주세요.")
    try:
        image = Image.open(io.BytesIO(raw))
        if image.width * image.height > MAX_IMAGE_PIXELS:
            raise ValueError("사진 해상도가 너무 높아요. 더 작은 사진을 사용해 주세요.")
        image.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError("옷 사진을 읽을 수 없어요.") from exc
    if image.mode == "RGBA":
        background = Image.new("RGB", image.size, "white")
        background.paste(image, mask=image.getchannel("A"))
        return background
    return image.convert("RGB")


def get_pipeline():
    global pipeline
    if pipeline is None:
        import torch
        from fashn_vton import TryOnPipeline

        device = "mps" if torch.backends.mps.is_available() else "cpu"
        pipeline = TryOnPipeline(weights_dir=str(MODEL_DIR), device=device)
    return pipeline


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SITE_DIR), **kwargs)

    def end_headers(self):
        origin = self.headers.get("Origin")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status: int, payload: dict):
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self):
        if urlsplit(self.path).path != "/api/try-on" or self.headers.get("Origin") not in ALLOWED_ORIGINS:
            self.send_error(403)
            return
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        if urlsplit(self.path).path == "/api/status":
            available = all(path.exists() for path in (
                MODEL_DIR / "model.safetensors",
                MODEL_DIR / "dwpose" / "yolox_l.onnx",
                MODEL_DIR / "dwpose" / "dw-ll_ucoco_384.onnx",
                PERSON_IMAGE,
            ))
            self.send_json(200, {"available": available, "ready": pipeline is not None})
            return
        super().do_GET()

    def do_POST(self):
        if urlsplit(self.path).path != "/api/try-on":
            self.send_error(404)
            return
        origin = self.headers.get("Origin")
        if origin and origin not in ALLOWED_ORIGINS:
            self.send_json(403, {"error": "허용되지 않은 페이지에서 보낸 요청이에요."})
            return
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            self.send_json(415, {"error": "사진 요청 형식이 잘못됐어요."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > MAX_BODY_BYTES:
                raise ValueError("사진 용량이 너무 커요. 12MB 이하로 줄여 주세요.")
            request = json.loads(self.rfile.read(length))
            category = request.get("category")
            if category not in ("tops", "bottoms", "one-pieces"):
                raise ValueError("현재 이 종류의 옷은 입혀볼 수 없어요.")
            garment_photo_type = request.get("garment_photo_type", "flat-lay")
            if garment_photo_type not in ("flat-lay", "model"):
                raise ValueError("옷 사진의 촬영 방식을 다시 선택해 주세요.")
            seed = request.get("seed", 42)
            if type(seed) is not int or not 0 <= seed <= 2**32 - 1:
                raise ValueError("AI 피팅 설정이 잘못됐어요.")
            garment = read_image(request.get("garment"))
            person = Image.open(PERSON_IMAGE).convert("RGB")
            with pipeline_lock:
                result = get_pipeline()(
                    person_image=person,
                    garment_image=garment,
                    category=category,
                    garment_photo_type=garment_photo_type,
                    num_timesteps=30,
                    seed=seed,
                ).images[0]
            output = io.BytesIO()
            result.save(output, format="PNG")
            raw = output.getvalue()
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
        except ValueError as exc:
            self.send_json(400, {"error": str(exc)})
        except Exception:
            traceback.print_exc()
            self.send_json(500, {"error": "AI 피팅 중 오류가 났어요. 다시 시도해 주세요."})


if __name__ == "__main__":
    print(f"온라인 옷장: http://127.0.0.1:{PORT}/", flush=True)
    print("옷 사진은 이 Mac 안에서만 처리됩니다. 종료하려면 Ctrl+C를 누르세요.", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
