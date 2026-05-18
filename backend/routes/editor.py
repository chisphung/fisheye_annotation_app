import os
import shutil
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from ..config import LABEL_SOURCES, EDIT_SOURCE, EDIT_DIR
from ..utils.labels import parse_labels, write_labels

router = APIRouter(prefix="/api/editor")

_edit_dir_initialized = False


def ensure_edit_dir(split: str):
    """Copy source labels to edit dir on first use (non-destructive)."""
    global _edit_dir_initialized
    edit_split = os.path.join(EDIT_DIR, split)
    if not _edit_dir_initialized:
        src_dir = os.path.join(LABEL_SOURCES[EDIT_SOURCE], split)
        if os.path.exists(src_dir) and not os.path.exists(edit_split):
            shutil.copytree(src_dir, edit_split)
        _edit_dir_initialized = True
    os.makedirs(edit_split, exist_ok=True)
    return edit_split


class BoxData(BaseModel):
    cls: int = 0
    type: str = "obb"
    coords: List[float]  # 8 floats for OBB
    track_id: Optional[str] = None


class SaveRequest(BaseModel):
    split: str
    frame_name: str
    boxes: List[BoxData]


class ReassignRequest(BaseModel):
    split: str
    frame_name: str
    box_index: int  # Index of the box in the frame's label file
    new_track_id: str


class DeleteRequest(BaseModel):
    split: str
    frame_name: str
    box_index: int


@router.post("/save")
def save_labels(req: SaveRequest):
    """Save all labels for a frame to the edit directory."""
    edit_split = ensure_edit_dir(req.split)
    lbl_name = req.frame_name.rsplit('.', 1)[0] + '.txt'
    path = os.path.join(edit_split, lbl_name)

    boxes = []
    for b in req.boxes:
        boxes.append({
            "class": b.cls,
            "type": b.type,
            "coords": b.coords,
            "track_id": b.track_id,
        })
    write_labels(path, boxes)
    return {"status": "ok", "path": path, "num_boxes": len(boxes)}


@router.post("/reassign")
def reassign_track(req: ReassignRequest):
    """Change the track_id of a specific box in a frame."""
    edit_split = ensure_edit_dir(req.split)
    lbl_name = req.frame_name.rsplit('.', 1)[0] + '.txt'
    path = os.path.join(edit_split, lbl_name)

    boxes = parse_labels(path)
    if req.box_index < 0 or req.box_index >= len(boxes):
        raise HTTPException(400, "Box index out of range")

    boxes[req.box_index]["track_id"] = req.new_track_id
    write_labels(path, boxes)
    return {"status": "ok"}


@router.post("/delete")
def delete_box(req: DeleteRequest):
    """Delete a specific box from a frame."""
    edit_split = ensure_edit_dir(req.split)
    lbl_name = req.frame_name.rsplit('.', 1)[0] + '.txt'
    path = os.path.join(edit_split, lbl_name)

    boxes = parse_labels(path)
    if req.box_index < 0 or req.box_index >= len(boxes):
        raise HTTPException(400, "Box index out of range")

    boxes.pop(req.box_index)
    write_labels(path, boxes)
    return {"status": "ok"}


@router.get("/labels/{split}/{img_name}")
def get_edit_labels(split: str, img_name: str):
    """Get labels from the edit directory (falls back to source)."""
    lbl_name = img_name.rsplit('.', 1)[0] + '.txt'
    edit_path = os.path.join(EDIT_DIR, split, lbl_name)
    if os.path.exists(edit_path):
        return {"img_name": img_name, "source": "edited", "boxes": parse_labels(edit_path)}
    # Fallback to source
    src_path = os.path.join(LABEL_SOURCES[EDIT_SOURCE], split, lbl_name)
    return {"img_name": img_name, "source": EDIT_SOURCE, "boxes": parse_labels(src_path)}
