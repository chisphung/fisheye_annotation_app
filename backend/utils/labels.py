import os


def parse_labels(path):
    """Parse a label file. Returns list of box dicts."""
    boxes = []
    if not os.path.exists(path):
        return boxes
    with open(path, "r") as f:
        for line in f:
            parts = line.strip().split()
            if not parts:
                continue
            if len(parts) >= 9:  # OBB: class x1..x8 [track_id]
                boxes.append({
                    "class": int(parts[0]),
                    "type": "obb",
                    "coords": [float(p) for p in parts[1:9]],
                    "track_id": parts[9] if len(parts) >= 10 else None
                })
            elif len(parts) >= 5:  # YOLO: class xc yc w h
                boxes.append({
                    "class": int(parts[0]),
                    "type": "yolo",
                    "x_center": float(parts[1]),
                    "y_center": float(parts[2]),
                    "width": float(parts[3]),
                    "height": float(parts[4]),
                    "track_id": None
                })
    return boxes


def write_labels(path, boxes):
    """Write list of box dicts to a label file."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        for box in boxes:
            if box["type"] == "obb":
                coords = " ".join(f'{c:.6f}' for c in box["coords"])
                tid = f' {box["track_id"]}' if box.get("track_id") else ""
                f.write(f'{box["class"]} {coords}{tid}\n')
            elif box["type"] == "yolo":
                f.write(f'{box["class"]} {box["x_center"]:.6f} {box["y_center"]:.6f} '
                        f'{box["width"]:.6f} {box["height"]:.6f}\n')
