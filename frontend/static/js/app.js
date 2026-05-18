// app.js — Main controller

class App {
    constructor() {
        this.split = 'train';
        this.shots = [];
        this.currentShot = null;
        this.segments = [];
        this.currentSegment = null;
        this.currentFrameIdx = 0;
        this.isPlaying = false;
        this.playbackInterval = null;
        this.speed = 100;
        this.showTrajectories = true;

        // Labels cache: { frameName: boxes[] }
        this.segmentLabels = {};
        this.initialLabels = {};  // Snapshot for cancel/restore
        this.history = [];        // Undo stack
        this.trackColors = {};
        this.hasUnsaved = false;

        // Modules
        this.canvas = document.getElementById('main-canvas');
        this.viewer = new Viewer(this.canvas);
        this.trackPanel = new TrackPanel(
            document.getElementById('track-list'),
            document.getElementById('btn-show-all')
        );
        this.editor = new Editor(this.canvas, this.viewer);

        // DOM
        this.shotList = document.getElementById('shot-list');
        this.segmentList = document.getElementById('segment-list');
        this.splitSelect = document.getElementById('split-select');
        this.speedSelect = document.getElementById('speed-select');
        this.trajToggle = document.getElementById('trajectory-toggle');
        this.frameRange = document.getElementById('frame-range');
        this.currentIdxEl = document.getElementById('current-idx');
        this.totalFramesEl = document.getElementById('total-frames');
        this.frameNameEl = document.getElementById('current-frame-name');
        this.statsEl = document.getElementById('stats-display');
        this.playBtn = document.getElementById('play-btn');
        this.playIcon = document.getElementById('play-icon');
        this.pauseIcon = document.getElementById('pause-icon');
        this.unsavedBadge = document.getElementById('unsaved-badge');
        this.saveBtn = document.getElementById('btn-save');
        this.cancelBtn = document.getElementById('btn-cancel');
        this.undoBtn = document.getElementById('btn-undo');
        this.newTrackBtn = document.getElementById('btn-new-track');

        this.trackPanel.setColorFn(tid => this.getTrackColor(tid));
        this.trackPanel.onFocus = () => this.redraw();
        this.editor.onModified = () => {
            this.hasUnsaved = true;
            this.unsavedBadge.style.display = '';
        };

        this.init();
    }

    init() {
        this.splitSelect.addEventListener('change', e => { this.split = e.target.value; this.loadShots(); });
        this.trajToggle.addEventListener('change', e => { this.showTrajectories = e.target.checked; this.redraw(); });
        this.speedSelect.addEventListener('change', e => {
            this.speed = parseInt(e.target.value);
            if (this.isPlaying) { this.pause(); this.play(); }
        });
        this.playBtn.addEventListener('click', () => { this.isPlaying ? this.pause() : this.play(); });
        document.getElementById('prev-btn').addEventListener('click', () => { this.pause(); this.prevFrame(); });
        document.getElementById('next-btn').addEventListener('click', () => { this.pause(); this.nextFrame(); });
        this.frameRange.addEventListener('input', e => { this.pause(); this.currentFrameIdx = parseInt(e.target.value); this.loadFrame(); });
        this.canvas.addEventListener('click', e => this.handleCanvasClick(e));
        this.canvas.addEventListener('wheel', e => this.handleWheel(e), { passive: false });
        this.canvas.addEventListener('mousedown', e => this.handleMouseDown(e));
        this.canvas.addEventListener('contextmenu', e => e.preventDefault());
        window.addEventListener('mousemove', e => this.handleMouseMove(e));
        window.addEventListener('mouseup', e => this.handleMouseUp(e));

        this.saveBtn.addEventListener('click', () => { this.hasUnsaved = false; this.unsavedBadge.style.display = 'none'; });
        this.cancelBtn.addEventListener('click', () => this.restoreLabels());
        this.undoBtn.addEventListener('click', () => this.undo());
        this.newTrackBtn.addEventListener('click', () => { this.trackPanel.addNewTrack(); this.redraw(); });
        window.addEventListener('resize', () => { this.viewer.computeLayout(); this.redraw(); });
        window.addEventListener('keydown', e => {
            if (e.ctrlKey && e.key === 'z') {
                e.preventDefault();
                this.undo();
            }
        });

        this.isPanning = false;
        this.lastMousePos = { x: 0, y: 0 };

        this.loadShots();
    }

    handleWheel(e) {
        e.preventDefault();
        const delta = -e.deltaY;
        const factor = delta > 0 ? 1.1 : 0.9;
        const newZoom = this.viewer.zoom * factor;

        if (newZoom < 0.1 || newZoom > 20) return;

        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        this.viewer.pan.x = mx - (mx - this.viewer.pan.x) * factor;
        this.viewer.pan.y = my - (my - this.viewer.pan.y) * factor;
        this.viewer.zoom = newZoom;
        this.redraw();
    }

    handleMouseDown(e) {
        // Pan with middle click (button 1) or right click (button 2)
        if (e.button === 1 || e.button === 2) {
            this.isPanning = true;
            this.lastMousePos = { x: e.clientX, y: e.clientY };
            this.canvas.style.cursor = 'grabbing';
            e.preventDefault();
        }
    }

    handleMouseMove(e) {
        if (this.isPanning) {
            const dx = e.clientX - this.lastMousePos.x;
            const dy = e.clientY - this.lastMousePos.y;
            this.viewer.pan.x += dx;
            this.viewer.pan.y += dy;
            this.lastMousePos = { x: e.clientX, y: e.clientY };
            this.redraw();
        }
    }

    handleMouseUp(e) {
        if (this.isPanning) {
            this.isPanning = false;
            this.canvas.style.cursor = this.editor.tool === 'draw' ? 'crosshair' : 'default';
        }
    }

    getTrackColor(tid) {
        if (!tid) return '#888';
        if (this.trackColors[tid]) return this.trackColors[tid];
        const hue = (parseInt(tid) * 137.5) % 360;
        this.trackColors[tid] = `hsl(${hue}, 85%, 60%)`;
        return this.trackColors[tid];
    }

    // ===== Shots =====
    async loadShots() {
        const res = await fetch(`/api/shots?split=${this.split}`);
        this.shots = await res.json();
        this.shotList.innerHTML = '';
        this.shots.forEach(s => {
            const el = document.createElement('div');
            el.className = 'shot-item';
            el.innerHTML = `<span class="shot-id">${s.shot_id}</span><span class="shot-meta">${s.num_frames}f</span>`;
            el.onclick = () => this.selectShot(s);
            this.shotList.appendChild(el);
        });
        if (this.shots.length > 0) this.selectShot(this.shots[0]);
    }

    async selectShot(shot) {
        this.pause();
        this.viewer.resetZoom();
        this.currentShot = shot;
        document.querySelectorAll('.shot-item').forEach(el => {
            el.classList.toggle('active', el.querySelector('.shot-id').textContent === shot.shot_id);
        });
        await this.loadSegments();
    }

    // ===== Segments =====
    async loadSegments() {
        const res = await fetch(`/api/segments?split=${this.split}&shot_id=${this.currentShot.shot_id}`);
        this.segments = await res.json();
        this.segmentList.innerHTML = '';
        this.segments.forEach((seg, i) => {
            const el = document.createElement('div');
            el.className = 'segment-item';
            el.innerHTML = `<span class="seg-label">Seg ${i}</span><span class="seg-meta">${seg.num_frames}f</span>`;
            el.onclick = () => this.selectSegment(seg, i);
            this.segmentList.appendChild(el);
        });
        if (this.segments.length > 0) this.selectSegment(this.segments[0], 0);
    }

    async selectSegment(seg, idx) {
        this.pause();
        this.viewer.resetZoom();
        this.currentSegment = seg;
        this.currentFrameIdx = 0;
        this.segmentLabels = {};
        this.history = [];
        this.trackColors = {};

        document.querySelectorAll('.segment-item').forEach((el, i) => el.classList.toggle('active', i === idx));

        this.frameRange.max = seg.num_frames - 1;
        this.totalFramesEl.textContent = seg.num_frames;
        this.statsEl.textContent = `Seg ${idx} | ${seg.num_frames} frames`;

        await this.loadAllLabels();
        await this.trackPanel.load(this.split, seg.frames, 'tracked_v2');
        this.loadFrame();
    }

    async loadAllLabels() {
        const frames = this.currentSegment.frames;
        const promises = frames.map(f =>
            fetch(`/api/editor/labels/${this.split}/${f}`).then(r => r.json())
        );
        const results = await Promise.all(promises);
        results.forEach(r => { this.segmentLabels[r.img_name] = r.boxes; });
        // Snapshot for cancel/restore
        this.initialLabels = JSON.parse(JSON.stringify(this.segmentLabels));
    }

    restoreLabels() {
        this.segmentLabels = JSON.parse(JSON.stringify(this.initialLabels));
        this.hasUnsaved = false;
        this.unsavedBadge.style.display = 'none';
        this.editor.drawingPoints = [];
        this.editor.setTool('select');
        this.redraw();
    }

    // ===== Frame =====
    async loadFrame() {
        if (!this.currentSegment) return;
        const fn = this.currentSegment.frames[this.currentFrameIdx];
        this.frameNameEl.textContent = fn;
        this.currentIdxEl.textContent = this.currentFrameIdx + 1;
        this.frameRange.value = this.currentFrameIdx;

        await this.viewer.loadImage(this.split, fn);
        this.redraw();
    }

    buildTrajectories() {
        const trajs = {};
        const frames = this.currentSegment.frames;
        for (let i = 0; i < frames.length; i++) {
            const boxes = this.segmentLabels[frames[i]] || [];
            boxes.forEach(box => {
                if (!box.track_id) return;
                if (!trajs[box.track_id]) trajs[box.track_id] = [];
                if (box.type === 'obb') {
                    const c = box.coords;
                    trajs[box.track_id].push({
                        x: (c[0] + c[2] + c[4] + c[6]) / 4,
                        y: (c[1] + c[3] + c[5] + c[7]) / 4
                    });
                }
            });
        }
        return trajs;
    }

    redraw() {
        const fn = this.currentSegment?.frames[this.currentFrameIdx];
        if (!fn) return;
        const boxes = this.segmentLabels[fn] || [];
        const trajs = this.showTrajectories ? this.buildTrajectories() : null;
        this.viewer.draw(boxes, trajs, this.trackPanel.focusedTrackId, tid => this.getTrackColor(tid));
        this.editor.drawPending(this.viewer.ctx);
    }

    handleCanvasClick(e) {
        const fn = this.currentSegment?.frames[this.currentFrameIdx];
        if (!fn) return;
        const boxes = this.segmentLabels[fn] || [];
        
        // Copy boxes for history (single frame case)
        const snapshotBoxes = JSON.parse(JSON.stringify(boxes));

        const result = this.editor.handleClick(e, boxes, this.trackPanel.focusedTrackId, this.split, fn);
        
        if (result) {
            const action = typeof result === 'string' ? result : result.action;

            if (action === 'moved') {
                const oldId = result.oldId;
                const newId = this.trackPanel.focusedTrackId;
                
                // Snapshot entire segment for global undo
                this.history.push({
                    type: 'global',
                    labels: JSON.parse(JSON.stringify(this.segmentLabels))
                });
                if (this.history.length > 50) this.history.shift();

                this.mergeTracks(oldId, newId);
            } else if (action !== 'drawing') {
                // Completed single-frame action
                this.history.push({
                    type: 'frame',
                    fn: fn,
                    boxes: snapshotBoxes
                });
                if (this.history.length > 50) this.history.shift();
                this.segmentLabels[fn] = boxes;
            }
            this.redraw();
        }
    }

    async mergeTracks(oldId, newId) {
        console.log(`Merging track ${oldId} into ${newId} across segment`);
        const affectedFrames = [];
        
        Object.entries(this.segmentLabels).forEach(([fn, frameBoxes]) => {
            let changed = false;
            frameBoxes.forEach(box => {
                if (box.track_id === oldId) {
                    box.track_id = newId;
                    changed = true;
                }
            });
            if (changed) affectedFrames.push({ fn, boxes: frameBoxes });
        });

        // Save affected frames to backend
        const promises = affectedFrames.map(f => this.editor.saveFrame(this.split, f.fn, f.boxes));
        await Promise.all(promises);
        
        // Refresh track list
        await this.trackPanel.load(this.split, this.currentSegment.frames, 'tracked_v2');
        this.redraw();
    }

    async undo() {
        // If drawing, undo last point
        if (this.editor.tool === 'draw' && this.editor.drawingPoints.length > 0) {
            this.editor.drawingPoints.pop();
            this.redraw();
            return;
        }

        if (this.history.length === 0) return;

        const lastState = this.history.pop();
        
        if (lastState.type === 'global') {
            this.segmentLabels = lastState.labels;
            // Re-save all frames (safest way to sync backend)
            const promises = Object.entries(this.segmentLabels).map(([fn, boxes]) => 
                this.editor.saveFrame(this.split, fn, boxes)
            );
            await Promise.all(promises);
            await this.trackPanel.load(this.split, this.currentSegment.frames, 'tracked_v2');
        } else {
            const fn = lastState.fn;
            this.segmentLabels[fn] = lastState.boxes;
            await this.editor.saveFrame(this.split, fn, lastState.boxes);
        }
        
        this.redraw();
    }

    // ===== Playback =====
    play() {
        this.isPlaying = true;
        this.playIcon.style.display = 'none'; this.pauseIcon.style.display = 'block';
        this.playbackInterval = setInterval(() => {
            if (this.currentFrameIdx >= this.currentSegment.num_frames - 1) { this.pause(); return; }
            this.currentFrameIdx++;
            this.loadFrame();
        }, this.speed);
    }

    pause() {
        this.isPlaying = false;
        this.playIcon.style.display = 'block'; this.pauseIcon.style.display = 'none';
        clearInterval(this.playbackInterval);
    }

    nextFrame() { if (this.currentFrameIdx < this.currentSegment.num_frames - 1) { this.currentFrameIdx++; this.loadFrame(); } }
    prevFrame() { if (this.currentFrameIdx > 0) { this.currentFrameIdx--; this.loadFrame(); } }
}

document.addEventListener('DOMContentLoaded', () => new App());
