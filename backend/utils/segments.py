import re
from collections import defaultdict


def parse_frame_info(filename):
    """Extract prefix and frame index from filename."""
    name = filename.replace('.jpg', '').replace('.png', '').replace('.txt', '')
    m = re.match(r'(.+_fisheye)_(\d+)_normal_(\d+)', name)
    if m:
        return m.group(1), int(m.group(2))
    return None, None


def build_segments(filenames, max_gap=100):
    """Group filenames into segments by prefix, split at frame gaps > max_gap."""
    groups = defaultdict(list)
    for f in filenames:
        prefix, idx = parse_frame_info(f)
        if prefix is not None:
            groups[prefix].append((idx, f))

    segments = []
    for prefix, frames in groups.items():
        frames.sort()
        current = [frames[0]]
        for i in range(1, len(frames)):
            if frames[i][0] - frames[i-1][0] > max_gap:
                segments.append({'prefix': prefix, 'frames': current})
                current = []
            current.append(frames[i])
        if current:
            segments.append({'prefix': prefix, 'frames': current})

    # Sort segments by first frame index for consistency
    segments.sort(key=lambda s: (s['prefix'], s['frames'][0][0]))
    return segments
