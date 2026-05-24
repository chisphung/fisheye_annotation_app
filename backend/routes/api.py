import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from ..config import IMAGE_DIR, LABEL_SOURCES, SEGMENT_GAP, EDIT_SOURCE, EDIT_DIR
from ..utils.labels import parse_labels
from ..utils.segments import build_segments, parse_frame_info

router = APIRouter(prefix="/api")


@router.get("/shots")
def get_shots(split: str = "train"):
    """Get all shots (grouped by prefix) for a split."""
    img_split_dir = os.path.join(IMAGE_DIR, split)
    if not os.path.exists(img_split_dir):
        return []

    files = sorted(os.listdir(img_split_dir))
    shots = {}

    for f in files:
        if not (f.endswith('.jpg') or f.endswith('.png')):
            continue
        prefix, _ = parse_frame_info(f)
        if prefix:
            if prefix not in shots:
                shots[prefix] = []
            shots[prefix].append(f)

    return [
        {"shot_id": prefix, "num_frames": len(frames), "frames": frames}
        for prefix, frames in shots.items()
    ]


@router.get("/segments")
def get_segments(split: str = "train", shot_id: str = ""):
    """Get segments within a shot (split by frame index gaps)."""
    img_split_dir = os.path.join(IMAGE_DIR, split)
    if not os.path.exists(img_split_dir):
        return []

    files = sorted(os.listdir(img_split_dir))
    # Filter to shot
    shot_files = [f for f in files if f.startswith(shot_id) and (f.endswith('.jpg') or f.endswith('.png'))]
    if not shot_files:
        return []

    segments = build_segments(shot_files, SEGMENT_GAP)
    result = []
    for i, seg in enumerate(segments):
        frame_names = [fn for _, fn in seg['frames']]
        result.append({
            "segment_idx": i,
            "prefix": seg['prefix'],
            "num_frames": len(seg['frames']),
            "frames": frame_names,
            "first_frame": frame_names[0],
            "last_frame": frame_names[-1]
        })
    return result


@router.get("/tracks")
def get_tracks(split: str = "train", source: str = "tracked_v2", frames: str = ""):
    """Get unique track IDs and their frame counts for given frames."""
    if source not in LABEL_SOURCES:
        raise HTTPException(400, "Invalid source")

    frame_list = frames.split(",") if frames else []
    track_info = {}  # track_id -> { frames: [], first_seen, last_seen }

    for fname in frame_list:
        lbl_name = fname.rsplit('.', 1)[0] + '.txt'
        if source == EDIT_SOURCE:
            path = os.path.join(EDIT_DIR, split, lbl_name)
            if not os.path.exists(path):
                path = os.path.join(LABEL_SOURCES[source], split, lbl_name)
        else:
            path = os.path.join(LABEL_SOURCES[source], split, lbl_name)
        boxes = parse_labels(path)
        for box in boxes:
            tid = box.get("track_id")
            if tid is None:
                continue
            if tid not in track_info:
                track_info[tid] = {"track_id": tid, "num_frames": 0, "frames": []}
            track_info[tid]["num_frames"] += 1
            track_info[tid]["frames"].append(fname)

    tracks = []
    for t in track_info.values():
        try:
            tid_val = int(t["track_id"])
        except ValueError:
            tid_val = float('inf')  # Fallback for non-integer IDs
        tracks.append((tid_val, t))
    
    tracks.sort(key=lambda x: x[0])
    return [t[1] for t in tracks]


@router.get("/image/{split}/{img_name}")
def get_image(split: str, img_name: str):
    path = os.path.join(IMAGE_DIR, split, img_name)
    if os.path.exists(path):
        return FileResponse(path)
    raise HTTPException(404, "Image not found")


@router.get("/labels/{split}/{img_name}")
def get_labels(split: str, img_name: str, source: str = "vehicle"):
    if source not in LABEL_SOURCES:
        raise HTTPException(400, "Invalid source")
    lbl_name = img_name.rsplit('.', 1)[0] + '.txt'
    path = os.path.join(LABEL_SOURCES[source], split, lbl_name)
    return {"img_name": img_name, "source": source, "boxes": parse_labels(path)}


@router.get("/labels_multi/{split}/{img_name}")
def get_labels_multi(split: str, img_name: str, sources: str):
    source_list = sources.split(",")
    result = {}
    for src in source_list:
        if src in LABEL_SOURCES:
            lbl_name = img_name.rsplit('.', 1)[0] + '.txt'
            path = os.path.join(LABEL_SOURCES[src], split, lbl_name)
            result[src] = parse_labels(path)
    return {"img_name": img_name, "results": result}
