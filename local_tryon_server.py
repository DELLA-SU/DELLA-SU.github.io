#!/usr/bin/env python3
"""Local-only web server for the FASHN VTON experiment.

Run with the Python environment that has fashn-vton installed. This server binds
to 127.0.0.1. Local inference stays on this computer; the optional cloud route
sends photos to FASHN only after explicit consent in the request.
"""

import argparse
import base64
import binascii
import io
import json
import os
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from PIL import Image, UnidentifiedImageError
from fashn_cloud import FashnError, try_on as cloud_try_on


SITE_DIR = Path(__file__).resolve().parent
MAX_BODY = 26 * 1024 * 1024
MAX_PIXELS = 24_000_000
pipeline = None
pipeline_lock = threading.Lock()
weights_dir = None
device = "mps"
cloud_key = None


def parse_image(value, mode="RGB"):
    if not isinstance(value, str) or not value.startswith("data:image/") or "," not in value:
        raise ValueError("PNG, JPG 또는 WEBP 사진을 선택해 주세요.")
    encoded = value.split(",", 1)[1]
    try:
        raw = base64.b64decode(encoded, validate=True)
        image = Image.open(io.BytesIO(raw))
        if image.format not in {"PNG", "JPEG", "WEBP"}:
            raise ValueError("지원하지 않는 사진 형식이에요.")
        if image.width * image.height > MAX_PIXELS:
            raise ValueError("사진 해상도가 너무 커요. 더 작은 사진을 선택해 주세요.")
        image.load()
        return image.convert(mode)
    except (ValueError, binascii.Error, UnidentifiedImageError, OSError) as exc:
        raise ValueError("사진 파일을 읽을 수 없어요.") from exc


def image_data_uri(image, fmt="JPEG"):
    output = io.BytesIO()
    if fmt == "JPEG":
        image.convert("RGB").save(output, format="JPEG", quality=92)
        mime = "jpeg"
    else:
        image.save(output, format="PNG")
        mime = "png"
    return "data:image/" + mime + ";base64," + base64.b64encode(output.getvalue()).decode("ascii")


def get_pipeline():
    global pipeline
    if weights_dir is None:
        raise ValueError("로컬 오픈소스 AI 가중치가 설정되지 않았어요.")
    if pipeline is None:
        from fashn_vton import TryOnPipeline

        pipeline = TryOnPipeline(weights_dir=str(weights_dir), device=device)
    return pipeline


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SITE_DIR), **kwargs)

    def send_json(self, code, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/api/health":
            self.send_json(200, {"ready": bool(weights_dir and weights_dir.is_dir()), "cloud_ready": bool(cloud_key), "device": device})
        else:
            super().do_GET()

    def do_POST(self):
        if self.path not in {"/api/tryon", "/api/cloud-tryon"}:
            self.send_json(404, {"error": "찾을 수 없어요."})
            return
        if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
            self.send_json(415, {"error": "요청 형식이 올바르지 않아요."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY:
                raise ValueError("사진 크기가 너무 커요.")
            payload = json.loads(self.rfile.read(length))
            if self.path == "/api/cloud-tryon":
                if not cloud_key:
                    self.send_json(503, {"error": "FASHN_API_KEY가 로컬 서버에 설정되지 않았어요."})
                    return
                if payload.get("external_photo_consent") is not True:
                    raise ValueError("외부 AI로 사진을 보내는 데 동의해야 해요.")
                person = image_data_uri(parse_image(payload.get("person_image")))
                garment = image_data_uri(parse_image(payload.get("garment_image")))
                image = cloud_try_on(cloud_key, person, garment)
                self.send_json(200, {"image": image})
                return
            if payload.get("category") not in {"tops", "bottoms", "one-pieces"}:
                raise ValueError("옷 종류를 선택해 주세요.")
            if payload.get("garment_photo_type") not in {"flat-lay", "model"}:
                raise ValueError("옷 사진의 형태를 선택해 주세요.")
            timesteps = payload.get("num_timesteps", 30)
            if timesteps not in {20, 30, 50}:
                raise ValueError("생성 품질 설정이 올바르지 않아요.")
            person = parse_image(payload.get("person_image"))
            garment = parse_image(payload.get("garment_image"))
            with pipeline_lock:
                result = get_pipeline()(
                    person_image=person,
                    garment_image=garment,
                    category=payload["category"],
                    garment_photo_type=payload["garment_photo_type"],
                    num_samples=1,
                    num_timesteps=timesteps,
                    seed=42,
                    segmentation_free=True,
                )
            output = io.BytesIO()
            result.images[0].save(output, format="PNG")
            image_url = "data:image/png;base64," + base64.b64encode(output.getvalue()).decode("ascii")
            self.send_json(200, {"image": image_url})
        except (ValueError, json.JSONDecodeError) as exc:
            self.send_json(400, {"error": str(exc)})
        except FashnError as exc:
            self.send_json(502, {"error": str(exc)})
        except Exception as exc:
            print(f"Try-on failed: {exc}", flush=True)
            self.send_json(500, {"error": "이미지를 만들지 못했어요. 서버 기록을 확인해 주세요."})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run local virtual try-on experiment")
    parser.add_argument("--weights-dir", type=Path, help="Optional local FASHN VTON weights")
    parser.add_argument("--device", default="mps", choices=["mps", "cuda", "cpu"])
    parser.add_argument("--port", default=4319, type=int)
    args = parser.parse_args()
    weights_dir = args.weights_dir.resolve() if args.weights_dir else None
    device = args.device
    cloud_key = os.environ.get("FASHN_API_KEY", "").strip() or None
    if weights_dir is not None and not weights_dir.is_dir():
        parser.error(f"Weights not found: {weights_dir}")
    if weights_dir is None and cloud_key is None:
        parser.error("Set --weights-dir or FASHN_API_KEY")
    os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Local try-on experiment: http://127.0.0.1:{args.port}/", flush=True)
    server.serve_forever()
