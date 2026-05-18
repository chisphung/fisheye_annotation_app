import os

BASE_DIR = "/home/locth/omni2rect_DEIM/Fisheye_dataset_fisheye"
IMAGE_DIR = os.path.join(BASE_DIR, "images")

LABEL_SOURCES = {
    "vehicle": os.path.join(BASE_DIR, "vehicle_labels"),
    "tracked": os.path.join(BASE_DIR, "labels_tracked"),
    "merged": os.path.join(BASE_DIR, "merged_labels"),
    "tracked_v2": os.path.join(BASE_DIR, "labels_tracked_v2"),
}

# Editable labels are saved to a separate directory (non-destructive)
EDIT_SOURCE = "tracked_v2"
EDIT_DIR = os.path.join(BASE_DIR, "labels_tracked_v2_edited")

SEGMENT_GAP = 100
