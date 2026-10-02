#!/usr/bin/env python3
"""Generate an untextured body mesh from one full-body photo with SAM 3D Body MLX."""

import argparse
from pathlib import Path

import numpy as np
import trimesh
from PIL import Image
from mlx_vlm.models.sam3d_body.generate import SAM3DPredictor
from mlx_vlm.models.sam3d_body.overlay import load_faces
from mlx_vlm.utils import load_model


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--weights-dir", required=True, type=Path)
    args = parser.parse_args()

    original = Image.open(args.image).convert("RGBA")
    alpha_bounds = original.getchannel("A").getbbox()
    bounds = alpha_bounds if alpha_bounds else (0, 0, original.width, original.height)
    background = Image.new("RGBA", original.size, "white")
    background.alpha_composite(original)
    image = np.asarray(background.convert("RGB"))

    model = load_model(args.weights_dir, strict=False)
    predictor = SAM3DPredictor(model, model.config)
    result = predictor.predict(image, bbox=list(bounds))
    # The predictor uses a camera coordinate system; glTF viewers use Y-up.
    vertices = result["pred_vertices"] @ np.diag([1, -1, -1])
    faces = load_faces(str(args.weights_dir))
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=False)
    mesh.visual.vertex_colors = [194, 175, 207, 255]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    mesh.export(args.output)
    print(f"Saved {len(vertices)} vertices and {len(faces)} faces to {args.output}", flush=True)


if __name__ == "__main__":
    main()
