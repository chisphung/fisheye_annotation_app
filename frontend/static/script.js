class Visualizer {
    constructor() {
        this.shots = [];
        this.currentShot = null;
        this.currentFrameIdx = 0;
        this.isPlaying = false;
        this.playbackInterval = null;
        this.speed = 100;
        this.split = 'train';
        this.selectedSources = ['tracked_v2'];
        this.showTrajectories = true;
        this.currentImage = new Image();
        this.shotLabels = {}; // { frameName: { source: [boxes] } }
        this.trackColors = {}; // { track_id: color }

        // DOM Elements
        this.canvas = document.getElementById('main-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.shotList = document.getElementById('shot-list');
        this.playBtn = document.getElementById('play-btn');
        this.prevBtn = document.getElementById('prev-btn');
        this.nextBtn = document.getElementById('next-btn');
        this.frameRange = document.getElementById('frame-range');
        this.currentIdxDisplay = document.getElementById('current-idx');
        this.totalFramesDisplay = document.getElementById('total-frames');
        this.currentFrameName = document.getElementById('current-frame-name');
        this.splitSelect = document.getElementById('split-select');
        this.speedSelect = document.getElementById('speed-select');
        this.statsDisplay = document.getElementById('stats-display');
        this.playIcon = document.getElementById('play-icon');
        this.pauseIcon = document.getElementById('pause-icon');
        this.trajToggle = document.getElementById('trajectory-toggle');

        this.sourceColors = {
            'vehicle': '#38bdf8',
            'tracked': '#22c55e',
            'merged': '#fbbf24',
            'tracked_v2': '#f472b6'
        };

        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadShots();
    }

    setupEventListeners() {
        this.splitSelect.addEventListener('change', (e) => {
            this.split = e.target.value;
            this.loadShots();
        });

        document.querySelectorAll('.source-multi-select input').forEach(cb => {
            cb.addEventListener('change', () => {
                this.updateSources();
                this.loadShotLabels().then(() => this.draw());
            });
        });

        this.trajToggle.addEventListener('change', (e) => {
            this.showTrajectories = e.target.checked;
            this.draw();
        });

        this.speedSelect.addEventListener('change', (e) => {
            this.speed = parseInt(e.target.value);
            if (this.isPlaying) {
                this.pause();
                this.play();
            }
        });

        this.playBtn.addEventListener('click', () => {
            if (this.isPlaying) this.pause();
            else this.play();
        });

        this.prevBtn.addEventListener('click', () => {
            this.pause();
            this.prevFrame();
        });

        this.nextBtn.addEventListener('click', () => {
            this.pause();
            this.nextFrame();
        });

        this.frameRange.addEventListener('input', (e) => {
            this.pause();
            this.currentFrameIdx = parseInt(e.target.value);
            this.loadCurrentFrame();
        });

        window.addEventListener('resize', () => this.draw());
    }

    updateSources() {
        this.selectedSources = Array.from(document.querySelectorAll('.source-multi-select input:checked'))
                                    .map(cb => cb.value);
    }

    async loadShots() {
        this.shotList.innerHTML = '<div class="loading">Loading shots...</div>';
        try {
            const response = await fetch(`/api/shots?split=${this.split}`);
            this.shots = await response.json();
            this.renderShotList();
            if (this.shots.length > 0) {
                this.selectShot(this.shots[0]);
            }
        } catch (error) {
            console.error('Error loading shots:', error);
            this.shotList.innerHTML = '<div class="loading" style="color: var(--danger)">Failed to load shots</div>';
        }
    }

    renderShotList() {
        this.shotList.innerHTML = '';
        this.shots.forEach(shot => {
            const item = document.createElement('div');
            item.className = 'shot-item';
            if (this.currentShot && this.currentShot.shot_id === shot.shot_id) {
                item.classList.add('active');
            }
            item.innerHTML = `
                <div class="shot-info">
                    <span class="shot-id">${shot.shot_id}</span>
                    <span class="shot-meta">${shot.num_frames} frames</span>
                </div>
            `;
            item.onclick = () => this.selectShot(shot);
            this.shotList.appendChild(item);
        });
    }

    async selectShot(shot) {
        this.pause();
        this.currentShot = shot;
        this.currentFrameIdx = 0;
        this.shotLabels = {}; // Reset cache
        this.trackColors = {}; // Reset track colors
        
        document.querySelectorAll('.shot-item').forEach(el => {
            el.classList.toggle('active', el.querySelector('.shot-id').textContent === shot.shot_id);
        });

        this.frameRange.max = shot.num_frames - 1;
        this.totalFramesDisplay.textContent = shot.num_frames;
        this.statsDisplay.textContent = `${shot.shot_id} | ${shot.num_frames} frames`;
        
        await this.loadShotLabels();
        this.loadCurrentFrame();
    }

    async loadShotLabels() {
        if (!this.currentShot) return;
        this.statsDisplay.textContent = `Loading labels for ${this.currentShot.shot_id}...`;
        
        const sourcesParam = this.selectedSources.join(',');
        if (!sourcesParam) {
            this.shotLabels = {};
            this.statsDisplay.textContent = `${this.currentShot.shot_id} | ${this.currentShot.num_frames} frames`;
            return;
        }

        const labelPromises = this.currentShot.frames.map(frameName => 
            fetch(`/api/labels_multi/${this.split}/${frameName}?sources=${sourcesParam}`)
                .then(r => r.json())
        );

        const allLabelData = await Promise.all(labelPromises);
        allLabelData.forEach(data => {
            this.shotLabels[data.img_name] = data.results;
        });

        this.statsDisplay.textContent = `${this.currentShot.shot_id} | ${this.currentShot.num_frames} frames`;
    }

    async loadCurrentFrame() {
        if (!this.currentShot) return;
        
        const frameName = this.currentShot.frames[this.currentFrameIdx];
        this.currentFrameName.textContent = frameName;
        this.currentIdxDisplay.textContent = this.currentFrameIdx + 1;
        this.frameRange.value = this.currentFrameIdx;

        const imgRes = await fetch(`/api/image/${this.split}/${frameName}`);
        const blob = await imgRes.blob();
        const url = URL.createObjectURL(blob);
        
        this.currentImage.onload = () => {
            URL.revokeObjectURL(url);
            this.draw();
        };
        this.currentImage.src = url;
    }

    getTrackColor(trackId) {
        if (!trackId) return '#ffffff';
        if (this.trackColors[trackId]) return this.trackColors[trackId];
        
        // Generate a vibrant color based on track ID
        const hue = (parseInt(trackId) * 137.5) % 360; // Use golden angle for even distribution
        const color = `hsl(${hue}, 85%, 60%)`;
        this.trackColors[trackId] = color;
        return color;
    }

    hslToRgba(hsl, alpha) {
        const temp = document.createElement('div');
        temp.style.color = hsl;
        document.body.appendChild(temp);
        const rgb = window.getComputedStyle(temp).color;
        document.body.removeChild(temp);
        return rgb.replace('rgb', 'rgba').replace(')', `, ${alpha})`);
    }

    draw() {
        if (!this.currentImage.complete) return;

        const container = document.getElementById('canvas-container');
        const drawWidth = this.canvas.width = container.clientWidth;
        const drawHeight = this.canvas.height = container.clientHeight;

        const imgRatio = this.currentImage.width / this.currentImage.height;
        const containerRatio = drawWidth / drawHeight;

        let renderW, renderH, offsetX, offsetY;
        if (imgRatio > containerRatio) {
            renderW = drawWidth;
            renderH = drawWidth / imgRatio;
            offsetX = 0;
            offsetY = (drawHeight - renderH) / 2;
        } else {
            renderH = drawHeight;
            renderW = drawHeight * imgRatio;
            offsetX = (drawWidth - renderW) / 2;
            offsetY = 0;
        }

        this.ctx.clearRect(0, 0, drawWidth, drawHeight);
        this.ctx.drawImage(this.currentImage, offsetX, offsetY, renderW, renderH);

        // 1. Draw ALL Trajectories (Full shot)
        if (this.showTrajectories) {
            this.drawFullTrajectories(offsetX, offsetY, renderW, renderH);
        }

        // 2. Draw Current Bounding Boxes
        const currentFrameName = this.currentShot.frames[this.currentFrameIdx];
        const currentLabels = this.shotLabels[currentFrameName] || {};

        Object.entries(currentLabels).forEach(([source, boxes]) => {
            boxes.forEach(box => {
                const color = box.track_id ? this.getTrackColor(box.track_id) : this.sourceColors[source];
                this.ctx.strokeStyle = color;
                this.ctx.lineWidth = 3;
                this.ctx.setLineDash(source === 'vehicle' ? [5, 5] : []);

                if (box.type === 'obb') {
                    const c = box.coords;
                    this.ctx.beginPath();
                    this.ctx.moveTo(offsetX + c[0] * renderW, offsetY + c[1] * renderH);
                    this.ctx.lineTo(offsetX + c[2] * renderW, offsetY + c[3] * renderH);
                    this.ctx.lineTo(offsetX + c[4] * renderW, offsetY + c[5] * renderH);
                    this.ctx.lineTo(offsetX + c[6] * renderW, offsetY + c[7] * renderH);
                    this.ctx.closePath();
                    this.ctx.stroke();
                    
                    this.ctx.fillStyle = this.hslToRgba(color, 0.2);
                    this.ctx.fill();

                    if (box.track_id) {
                        this.drawLabel(box.track_id, offsetX + c[0] * renderW, offsetY + c[1] * renderH, color);
                    }
                } else {
                    const x = offsetX + (box.x_center - box.width / 2) * renderW;
                    const y = offsetY + (box.y_center - box.height / 2) * renderH;
                    const w = box.width * renderW;
                    const h = box.height * renderH;

                    this.ctx.strokeRect(x, y, w, h);
                    this.ctx.fillStyle = this.hslToRgba(color, 0.2);
                    this.ctx.fillRect(x, y, w, h);
                }
            });
        });
    }

    drawFullTrajectories(offsetX, offsetY, renderW, renderH) {
        const tracks = {}; // { track_id: { color, points: [] } }

        // Iterate through ALL frames in the shot
        for (let i = 0; i < this.currentShot.num_frames; i++) {
            const frameName = this.currentShot.frames[i];
            const labels = this.shotLabels[frameName] || {};

            Object.entries(labels).forEach(([source, boxes]) => {
                boxes.forEach(box => {
                    if (!box.track_id) return;
                    
                    const id = box.track_id;
                    if (!tracks[id]) {
                        tracks[id] = { color: this.getTrackColor(id), points: [] };
                    }

                    let cx, cy;
                    if (box.type === 'obb') {
                        const c = box.coords;
                        cx = (c[0] + c[2] + c[4] + c[6]) / 4;
                        cy = (c[1] + c[3] + c[5] + c[7]) / 4;
                    } else {
                        cx = box.x_center;
                        cy = box.y_center;
                    }
                    tracks[id].points.push({ x: offsetX + cx * renderW, y: offsetY + cy * renderH });
                });
            });
        }

        // Draw the lines
        this.ctx.setLineDash([2, 4]);
        Object.values(tracks).forEach(track => {
            if (track.points.length < 2) return;

            this.ctx.beginPath();
            this.ctx.strokeStyle = this.hslToRgba(track.color, 0.6);
            this.ctx.lineWidth = 2;

            this.ctx.moveTo(track.points[0].x, track.points[0].y);
            for (let i = 1; i < track.points.length; i++) {
                this.ctx.lineTo(track.points[i].x, track.points[i].y);
            }
            this.ctx.stroke();
            
            // Draw a dot at each point
            this.ctx.fillStyle = this.hslToRgba(track.color, 0.8);
            track.points.forEach(p => {
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
                this.ctx.fill();
            });
        });
        this.ctx.setLineDash([]);
    }

    drawLabel(text, x, y, color) {
        const padding = 6;
        this.ctx.font = 'bold 12px Inter';
        const label = `${text}`;
        const metrics = this.ctx.measureText(label);
        const w = metrics.width + padding * 2;
        const h = 18;

        // Background badge
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.roundRect(x, y - h - 4, w, h, 4);
        this.ctx.fill();

        // Text
        this.ctx.fillStyle = '#000';
        this.ctx.fillText(label, x + padding, y - 8);
    }

    play() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.playIcon.style.display = 'none';
        this.pauseIcon.style.display = 'block';
        
        this.playbackInterval = setInterval(() => {
            this.nextFrame();
            if (this.currentFrameIdx === this.currentShot.num_frames - 1) {
                this.pause();
            }
        }, this.speed);
    }

    pause() {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        this.playIcon.style.display = 'block';
        this.pauseIcon.style.display = 'none';
        clearInterval(this.playbackInterval);
    }

    nextFrame() {
        if (this.currentFrameIdx < this.currentShot.num_frames - 1) {
            this.currentFrameIdx++;
            this.loadCurrentFrame();
        }
    }

    prevFrame() {
        if (this.currentFrameIdx > 0) {
            this.currentFrameIdx--;
            this.loadCurrentFrame();
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new Visualizer();
});
