import os
import re
import json
import glob
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from io import BytesIO
from PIL import Image

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATASETS = {
    "normal": "/home/otw/chisphung/home/jncf/Fisheye_dataset_normal",
    "fisheye": "/home/otw/chisphung/home/jncf/Fisheye_dataset_fisheye"
}

def parse_filename(filename):
    """Returns (normal_id, fisheye_id) based on synced filename format."""
    parts = filename.replace('.jpg', '').replace('.png', '').split('_')
    normal_id, fisheye_id = None, None
    for i, p in enumerate(parts):
        if p == 'normal' and i + 1 < len(parts) and parts[i+1].isdigit():
            normal_id = parts[i+1]
        elif p == 'fisheye' and i + 1 < len(parts) and parts[i+1].isdigit():
            fisheye_id = parts[i+1]
    return normal_id, fisheye_id

@app.get("/api/meta/tracks")
def get_all_tracks(ds: str = "normal", split: str = "train"):
    if ds not in DATASETS:
        raise HTTPException(status_code=400, detail="Invalid dataset")
    meta_dir_tracked = os.path.join(DATASETS[ds], "labels_tracked", "metadata")
    meta_dir_finalized = os.path.join(DATASETS[ds], "labels_finalized", "metadata")
    if not os.path.exists(meta_dir_tracked):
        return []
    
    files = glob.glob(os.path.join(meta_dir_tracked, f"{split}_*.json"))
    all_tracks = []
    for f in files:
        basename = os.path.basename(f)
        final_path = os.path.join(meta_dir_finalized, basename)
        read_path = final_path if os.path.exists(final_path) else f
        
        with open(read_path, "r") as jf:
            data = json.load(jf)
            for track in data.get("tracks", []):
                # Include sub_sequence name into track to quickly locate it later
                all_tracks.append({
                    **track,
                    "sub_sequence": data["sub_sequence"],
                    "dataset": ds,
                    "split": split
                })
    # Sort by track ID
    all_tracks.sort(key=lambda t: t["track_id"])
    return all_tracks

@app.get("/api/crop/{ds}/{split}/{img_name}/{track_id}")
def get_crop(ds: str, split: str, img_name: str, track_id: int):
    ds_path = DATASETS.get(ds)
    if not ds_path:
        raise HTTPException(status_code=400, detail="Invalid dataset")
    
    # Needs to read label from labels_tracked to find OBB => AABB
    lbl_name = img_name.rsplit('.', 1)[0] + '.txt'
    lbl_path = os.path.join(ds_path, "labels_tracked", split, lbl_name)
    img_path = os.path.join(ds_path, "images", split, img_name)
    
    if not os.path.exists(img_path) or not os.path.exists(lbl_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    obb_coords = None
    with open(lbl_path, "r") as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) >= 10:
                if int(parts[9]) == track_id:
                    obb_coords = [float(p) for p in parts[1:9]]
                    break
    
    if not obb_coords:
         # Track ID not found in this frame natively, just return the full image or a placeholder
         img = Image.open(img_path)
         img.thumbnail((300, 300))
         buf = BytesIO()
         img.save(buf, format="JPEG")
         buf.seek(0)
         return StreamingResponse(buf, media_type="image/jpeg")

    img = Image.open(img_path).convert('RGB')
    w, h = img.size
    
    xs = [obb_coords[0], obb_coords[2], obb_coords[4], obb_coords[6]]
    ys = [obb_coords[1], obb_coords[3], obb_coords[5], obb_coords[7]]
    x1 = max(0, int(min(xs) * w))
    x2 = min(w, int(max(xs) * w))
    y1 = max(0, int(min(ys) * h))
    y2 = min(h, int(max(ys) * h))
    
    # Add a little padding to crop
    pad = 10
    x1 = max(0, x1 - pad)
    x2 = min(w, x2 + pad)
    y1 = max(0, y1 - pad)
    y2 = min(h, y2 + pad)
    
    crop = img.crop((x1, y1, x2, y2))
    
    buf = BytesIO()
    crop.save(buf, format="JPEG", quality=90)
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/jpeg")

@app.get("/api/image/{ds}/{split}/{img_name}")
def get_image(ds: str, split: str, img_name: str):
    path = os.path.join(DATASETS[ds], "images", split, img_name)
    if os.path.exists(path):
        return FileResponse(path)
    raise HTTPException(404, "Image not found")

@app.get("/api/frame_info/{ds}/{split}/{img_name}")
def get_frame_info(ds: str, split: str, img_name: str):
    """Returns bounding boxes and their track IDs for a full frame view"""
    ds_path = DATASETS[ds]
    lbl_name = img_name.rsplit('.', 1)[0] + '.txt'
    lbl_path = os.path.join(ds_path, "labels_tracked", split, lbl_name)
    boxes = []
    
    # Check if we already have finalized labels
    finalized_path = os.path.join(ds_path, "labels_finalized", split, lbl_name)
    source_path = finalized_path if os.path.exists(finalized_path) else lbl_path
    
    if os.path.exists(source_path):
        with open(source_path, "r") as f:
            for line in f:
                parts = line.strip().split()
                if len(parts) >= 10:
                    boxes.append({
                        "class": int(parts[0]),
                        "obb": [float(p) for p in parts[1:9]],
                        "track_id": parts[9], # might be string if finalized containing plate!
                        "is_finalized": len(parts) >= 10 and not parts[9].isdigit() # very loose proxy!
                    })
    
    return {"img_name": img_name, "boxes": boxes}

class AnnotationPayload(BaseModel):
    ds: str
    split: str
    track_id: str  # Can be string since tracks IDs might be string keys from JSON
    frames: list[str]  # List of frame filenames to apply OCR text to
    label_text: str

@app.post("/api/annotate")
def annotate_track(payload: AnnotationPayload):
    ds_path = DATASETS.get(payload.ds)
    if not ds_path:
        raise HTTPException(400, "Invalid ds")
        
    finalized_dir = os.path.join(ds_path, "labels_finalized", payload.split)
    os.makedirs(finalized_dir, exist_ok=True)
    
    written = 0
    for frame in payload.frames:
        lbl_name = frame.rsplit('.', 1)[0] + '.txt'
        src_tracked = os.path.join(ds_path, "labels_tracked", payload.split, lbl_name)
        dest_final = os.path.join(finalized_dir, lbl_name)
        
        # We always read from finalized first, if missing fallback to tracked
        read_path = dest_final if os.path.exists(dest_final) else src_tracked
        if not os.path.exists(read_path):
            continue
            
        out_lines = []
        with open(read_path, "r") as f:
            for line in f:
                parts = line.strip().split()
                if len(parts) >= 10:
                    # If this line belongs to the annotated track...
                    # wait, track_id right now in labels_tracked is integer. 
                    # If it's finalized, parts[9] is the TEXT we appended? 
                    # Wait! If we overwrite parts[9] with TEXT, we LOSE the track_id! 
                    # That's bad because if we want to sync later, we won't know the track_id.
                    # Best format: `class x1 .. y4 track_id PLATE_TEXT`
                    # So parts[9] = track_id, parts[10] = plate_text
                    
                    t_id_str = str(payload.track_id)
                    if parts[9] == t_id_str:
                        # Update plate text
                        out_lines.append(f"{' '.join(parts[:10])} {payload.label_text}\n")
                    else:
                        out_lines.append(line)
                else:
                    out_lines.append(line)
        
        with open(dest_final, "w") as f:
            f.writelines(out_lines)
            written += 1
            
    return {"status": "success", "frames_updated": written}

@app.get("/api/sync_pair")
def get_sync_pair(ds: str, split: str, img_name: str):
    if ds not in DATASETS:
        raise HTTPException(status_code=400, detail="Invalid dataset")
        
    other_ds = "fisheye" if ds == "normal" else "normal"
    img_dir = os.path.join(DATASETS[ds], "images", split)
    
    if not os.path.exists(img_dir):
        raise HTTPException(status_code=404, detail="Split directory not found")
        
    # Get all sorted images to find prev and next
    images = sorted(os.listdir(img_dir))
    if img_name not in images:
        raise HTTPException(status_code=404, detail="Image not found")
        
    idx = images.index(img_name)
    prev_img = images[idx - 1] if idx > 0 else None
    next_img = images[idx + 1] if idx < len(images) - 1 else None
    
    # Check counterpart
    counterpart = None
    other_img_dir = os.path.join(DATASETS[other_ds], "images", split)
    
    if os.path.exists(os.path.join(other_img_dir, img_name)):
        counterpart = img_name
    else:
        # Fallback: maybe the filename has different prefix but same IDs
        n_id, f_id = parse_filename(img_name)
        if n_id and f_id and os.path.exists(other_img_dir):
            for filename in os.listdir(other_img_dir):
                cn_id, cf_id = parse_filename(filename)
                if cn_id == n_id and cf_id == f_id:
                    counterpart = filename
                    break

    return {
        "prev": prev_img,
        "next": next_img,
        "counterpart": counterpart,
        "other_ds": other_ds
    }

class TrajectoryPayload(BaseModel):
    ds: str
    split: str
    track_id: str
    frames: list[str]

@app.post("/api/track_trajectory")
def get_track_trajectory(payload: TrajectoryPayload):
    ds_path = DATASETS.get(payload.ds)
    if not ds_path:
        raise HTTPException(status_code=400, detail="Invalid dataset")
        
    trajectory = []
    
    for frame in payload.frames:
        lbl_name = frame.rsplit('.', 1)[0] + '.txt'
        final_path = os.path.join(ds_path, "labels_finalized", payload.split, lbl_name)
        src_path = os.path.join(ds_path, "labels_tracked", payload.split, lbl_name)
        
        read_path = final_path if os.path.exists(final_path) else src_path
        if not os.path.exists(read_path):
            continue
            
        with open(read_path, "r") as f:
            for line in f:
                parts = line.strip().split()
                if len(parts) >= 10 and parts[9] == payload.track_id:
                    obb = [float(p) for p in parts[1:9]]
                    xs = [obb[0], obb[2], obb[4], obb[6]]
                    ys = [obb[1], obb[3], obb[5], obb[7]]
                    cx = sum(xs) / 4.0
                    cy = sum(ys) / 4.0
                    trajectory.append({
                        "frame": frame,
                        "cx": cx,
                        "cy": cy,
                        "obb": obb
                    })
                    break
                    
    return {"trajectory": trajectory}

class UntrackPayload(BaseModel):
    ds: str
    split: str
    track_id: str
    frame: str

@app.post("/api/untrack_frame")
def untrack_frame(payload: UntrackPayload):
    ds_path = DATASETS.get(payload.ds)
    if not ds_path:
        raise HTTPException(status_code=400, detail="Invalid dataset")
        
    finalized_dir = os.path.join(ds_path, "labels_finalized", payload.split)
    os.makedirs(finalized_dir, exist_ok=True)
    
    lbl_name = payload.frame.rsplit('.', 1)[0] + '.txt'
    src_tracked = os.path.join(ds_path, "labels_tracked", payload.split, lbl_name)
    dest_final = os.path.join(finalized_dir, lbl_name)
    
    read_path = dest_final if os.path.exists(dest_final) else src_tracked
    if not os.path.exists(read_path):
        raise HTTPException(status_code=404, detail="Frame label not found")
        
    out_lines = []
    with open(read_path, "r") as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) >= 10 and parts[9] == payload.track_id:
                # Set track_id to -1 to detach it from the track securely
                parts[9] = "-1"
                out_lines.append(" ".join(parts) + "\n")
            else:
                out_lines.append(line)
                
    with open(dest_final, "w") as f:
        f.writelines(out_lines)
        
    return {"status": "success"}

# Caching Feature Endpoints
class CacheFramePayload(BaseModel):
    ds: str
    split: str
    track_id: str
    frame: str

def update_metadata_for_track(ds_path, split, track_id, modify_fn):
    """Helper to find the json containing the track_id, run modify_fn on the track, and save it finalized."""
    meta_dir_tracked = os.path.join(ds_path, "labels_tracked", "metadata")
    meta_dir_finalized = os.path.join(ds_path, "labels_finalized", "metadata")
    os.makedirs(meta_dir_finalized, exist_ok=True)
    
    files = glob.glob(os.path.join(meta_dir_tracked, f"{split}_*.json"))
    for f in files:
        basename = os.path.basename(f)
        final_path = os.path.join(meta_dir_finalized, basename)
        read_path = final_path if os.path.exists(final_path) else f
        
        with open(read_path, "r") as jf:
            data = json.load(jf)
            
        found = False
        for track in data.get("tracks", []):
            if str(track["track_id"]) == str(track_id):
                modify_fn(track)
                found = True
                break
                
        if found:
            with open(final_path, "w") as jf:
                json.dump(data, jf, indent=2)
            return True
            
    return False

@app.post("/api/cache_frame")
def cache_frame(payload: CacheFramePayload):
    ds_path = DATASETS.get(payload.ds)
    if not ds_path: raise HTTPException(status_code=400)
    
    # Update label text file to CACHE
    finalized_dir = os.path.join(ds_path, "labels_finalized", payload.split)
    os.makedirs(finalized_dir, exist_ok=True)
    lbl_name = payload.frame.rsplit('.', 1)[0] + '.txt'
    src_tracked = os.path.join(ds_path, "labels_tracked", payload.split, lbl_name)
    dest_final = os.path.join(finalized_dir, lbl_name)
    read_path = dest_final if os.path.exists(dest_final) else src_tracked
    
    if os.path.exists(read_path):
        out_lines = []
        with open(read_path, "r") as f:
            for line in f:
                parts = line.strip().split()
                if len(parts) >= 10 and parts[9] == str(payload.track_id):
                    parts[9] = f"CACHE" # Or just CACHE
                    out_lines.append(" ".join(parts) + "\n")
                else:
                    out_lines.append(line)
        with open(dest_final, "w") as f:
            f.writelines(out_lines)
            
    # Update Metadata to remove it from track bounds
    def remove_frame(track):
        if payload.frame in track["frames"]:
            track["frames"].remove(payload.frame)
            track["num_frames"] = len(track["frames"])
    
    update_metadata_for_track(ds_path, payload.split, payload.track_id, remove_frame)
    return {"status": "success"}

class AssignCachePayload(BaseModel):
    ds: str
    split: str
    target_track_id: str
    frame: str

@app.post("/api/assign_cached_frame")
def assign_cached_frame(payload: AssignCachePayload):
    ds_path = DATASETS.get(payload.ds)
    if not ds_path: raise HTTPException(status_code=400)
    
    # Update label text file from CACHE to target_track_id
    finalized_dir = os.path.join(ds_path, "labels_finalized", payload.split)
    os.makedirs(finalized_dir, exist_ok=True)
    lbl_name = payload.frame.rsplit('.', 1)[0] + '.txt'
    src_tracked = os.path.join(ds_path, "labels_tracked", payload.split, lbl_name)
    dest_final = os.path.join(finalized_dir, lbl_name)
    read_path = dest_final if os.path.exists(dest_final) else src_tracked
    
    if os.path.exists(read_path):
        out_lines = []
        with open(read_path, "r") as f:
            for line in f:
                parts = line.strip().split()
                if len(parts) >= 10 and parts[9] == "CACHE":
                    parts[9] = str(payload.target_track_id)
                    out_lines.append(" ".join(parts) + "\n")
                else:
                    out_lines.append(line)
        with open(dest_final, "w") as f:
            f.writelines(out_lines)
            
    # Update Metadata to insert frame into target track
    def add_frame(track):
        if payload.frame not in track["frames"]:
            track["frames"].append(payload.frame)
            track["frames"] = sorted(track["frames"]) # Keep chronologically sorted
            track["num_frames"] = len(track["frames"])
            
    update_metadata_for_track(ds_path, payload.split, payload.target_track_id, add_frame)
    return {"status": "success"}

@app.get("/api/meta/shots")
def get_all_shots(ds: str = "normal", split: str = "train"):
    if ds not in DATASETS:
        raise HTTPException(status_code=400, detail="Invalid dataset")
    img_dir = os.path.join(DATASETS[ds], "images", split)
    if not os.path.exists(img_dir):
        return []
    
    files = sorted(os.listdir(img_dir))
    
    if ds == 'fisheye':
        pattern = re.compile(r'(.*)_fisheye_(\d+)_normal_(\d+)')
    else:
        pattern = re.compile(r'(.*)_normal_(\d+)_fisheye_(\d+)')
        
    shots_map = {}
    for f in files:
        if not f.endswith('.jpg') and not f.endswith('.png'):
            continue
        match = pattern.search(f)
        if match:
            prefix = match.group(1)
            fid = int(match.group(2))
            if prefix not in shots_map:
                shots_map[prefix] = []
            shots_map[prefix].append((fid, f))
            
    all_shots = []
    for prefix, frame_list in shots_map.items():
        frame_list.sort(key=lambda x: x[0])
        
        current_subshot = []
        subshot_idx = 0
        
        for i in range(len(frame_list)):
            fid, fname = frame_list[i]
            if i > 0:
                prev_fid = frame_list[i-1][0]
                if fid - prev_fid > 100:
                    if current_subshot:
                        all_shots.append({
                            "shot_id": f"{prefix}_part{subshot_idx}",
                            "num_frames": len(current_subshot),
                            "first_frame": current_subshot[0],
                            "frames": current_subshot
                        })
                        subshot_idx += 1
                        current_subshot = []
                        
            current_subshot.append(fname)
            
        if current_subshot:
            all_shots.append({
                "shot_id": f"{prefix}_part{subshot_idx}",
                "num_frames": len(current_subshot),
                "first_frame": current_subshot[0],
                "frames": current_subshot
            })
            
    return all_shots


class ShotAnnotationsPayload(BaseModel):
    ds: str
    split: str
    frames: list[str]

@app.post("/api/shot_annotations")
def get_shot_annotations(payload: ShotAnnotationsPayload):
    ds_path = DATASETS.get(payload.ds)
    if not ds_path: raise HTTPException(status_code=400)
    
    result = {}
    for frame in payload.frames:
        lbl_name = frame.rsplit('.', 1)[0] + '.txt'
        final_path = os.path.join(ds_path, "labels_finalized", payload.split, lbl_name)
        src_path = os.path.join(ds_path, "labels_tracked", payload.split, lbl_name)
        
        read_path = final_path if os.path.exists(final_path) else src_path
        boxes = []
        if os.path.exists(read_path):
            with open(read_path, "r") as f:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) >= 10:
                        boxes.append({
                            "class": int(parts[0]),
                            "obb": [float(p) for p in parts[1:9]],
                            "track_id": parts[9],
                            "plate_text": parts[10] if len(parts) >= 11 else ""
                        })
        result[frame] = boxes
    return result


class AnnotateBoxPayload(BaseModel):
    ds: str
    split: str
    frame: str
    old_track_id: str
    new_track_id: str
    plate_text: str

@app.post("/api/annotate_box")
def annotate_box(payload: AnnotateBoxPayload):
    ds_path = DATASETS.get(payload.ds)
    if not ds_path: raise HTTPException(status_code=400)
    
    finalized_dir = os.path.join(ds_path, "labels_finalized", payload.split)
    os.makedirs(finalized_dir, exist_ok=True)
    
    lbl_name = payload.frame.rsplit('.', 1)[0] + '.txt'
    src_tracked = os.path.join(ds_path, "labels_tracked", payload.split, lbl_name)
    dest_final = os.path.join(finalized_dir, lbl_name)
    
    read_path = dest_final if os.path.exists(dest_final) else src_tracked
    if not os.path.exists(read_path):
        return {"status": "error", "message": "Frame label not found"}
        
    out_lines = []
    updated = False
    with open(read_path, "r") as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) >= 10 and parts[9] == payload.old_track_id:
                parts[9] = payload.new_track_id
                if len(parts) >= 11:
                    parts[10] = payload.plate_text
                else:
                    parts.append(payload.plate_text)
                out_lines.append(" ".join(parts) + "\n")
                updated = True
            else:
                out_lines.append(line)
                
    if updated:
        with open(dest_final, "w") as f:
            f.writelines(out_lines)
            
    return {"status": "success", "updated": updated}

