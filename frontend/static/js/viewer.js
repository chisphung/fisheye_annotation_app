// viewer.js — Canvas rendering module

class Viewer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.image = new Image();
        this.renderParams = { offsetX: 0, offsetY: 0, renderW: 0, renderH: 0 };
        this.zoom = 1.0;
        this.pan = { x: 0, y: 0 };
    }

    async loadImage(split, frameName) {
        return new Promise((resolve) => {
            const url = `/api/image/${split}/${frameName}`;
            this.image.onload = () => {
                this.computeLayout();
                resolve();
            };
            this.image.src = url;
        });
    }

    resetZoom() {
        this.zoom = 1.0;
        this.pan = { x: 0, y: 0 };
    }

    computeLayout() {
        const container = this.canvas.parentElement;
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        this.canvas.width = cw;
        this.canvas.height = ch;

        const ratio = this.image.width / this.image.height;
        const cRatio = cw / ch;
        let rw, rh, ox, oy;
        if (ratio > cRatio) { rw = cw; rh = cw / ratio; ox = 0; oy = (ch - rh) / 2; }
        else { rh = ch; rw = ch * ratio; ox = (cw - rw) / 2; oy = 0; }
        this.renderParams = { offsetX: ox, offsetY: oy, renderW: rw, renderH: rh };
    }

    draw(allLabels, trajectories, focusedTrackId, getTrackColor) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.save();
        // Apply zoom and pan
        this.ctx.translate(this.pan.x, this.pan.y);
        this.ctx.scale(this.zoom, this.zoom);

        const { offsetX: ox, offsetY: oy, renderW: rw, renderH: rh } = this.renderParams;
        if (this.image.complete) {
            this.ctx.drawImage(this.image, ox, oy, rw, rh);
        }

        // Trajectories
        if (trajectories) {
            this.ctx.setLineDash([2, 4]);
            Object.entries(trajectories).forEach(([tid, points]) => {
                if (focusedTrackId && tid !== focusedTrackId) return;
                if (points.length < 2) return;
                const color = getTrackColor(tid);
                this.ctx.strokeStyle = color;
                this.ctx.lineWidth = 2 / this.zoom;
                this.ctx.globalAlpha = 0.6;
                this.ctx.beginPath();
                this.ctx.moveTo(ox + points[0].x * rw, oy + points[0].y * rh);
                for (let i = 1; i < points.length; i++) {
                    this.ctx.lineTo(ox + points[i].x * rw, oy + points[i].y * rh);
                }
                this.ctx.stroke();
                // Dots
                this.ctx.globalAlpha = 0.8;
                points.forEach(p => {
                    this.ctx.beginPath();
                    this.ctx.arc(ox + p.x * rw, oy + p.y * rh, 2 / this.zoom, 0, Math.PI * 2);
                    this.ctx.fillStyle = color;
                    this.ctx.fill();
                });
            });
            this.ctx.globalAlpha = 1;
            this.ctx.setLineDash([]);
        }

        // Boxes
        if (allLabels) {
            allLabels.forEach((box, idx) => {
                if (focusedTrackId && box.track_id !== focusedTrackId) {
                    // Draw dimmed
                    this.ctx.globalAlpha = 0.15;
                } else {
                    this.ctx.globalAlpha = 1;
                }
                const color = box.track_id ? getTrackColor(box.track_id) : '#888';
                this.drawBox(box, color, ox, oy, rw, rh, idx);
                this.ctx.globalAlpha = 1;
            });
        }
        this.ctx.restore();
    }

    drawBox(box, color, ox, oy, rw, rh, idx) {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2.5 / this.zoom;

        if (box.type === 'obb') {
            const c = box.coords;
            this.ctx.beginPath();
            this.ctx.moveTo(ox + c[0] * rw, oy + c[1] * rh);
            this.ctx.lineTo(ox + c[2] * rw, oy + c[3] * rh);
            this.ctx.lineTo(ox + c[4] * rw, oy + c[5] * rh);
            this.ctx.lineTo(ox + c[6] * rw, oy + c[7] * rh);
            this.ctx.closePath();
            this.ctx.stroke();

            // Fill
            this.ctx.fillStyle = color.replace(')', ',0.15)').replace('rgb', 'rgba').replace('hsl', 'hsla');
            this.ctx.fill();

            // Label
            if (box.track_id) {
                const lx = ox + c[0] * rw;
                const ly = oy + c[1] * rh;
                this.ctx.font = `bold ${11 / this.zoom}px Inter`;
                const txt = `${box.track_id}`;
                const tw = this.ctx.measureText(txt).width + 8 / this.zoom;
                this.ctx.fillStyle = color;
                this.ctx.fillRect(lx, ly - 16 / this.zoom, tw, 16 / this.zoom);
                this.ctx.fillStyle = '#000';
                this.ctx.fillText(txt, lx + 4 / this.zoom, ly - 4 / this.zoom);
            }
        }
    }

    // Convert canvas pixel coords to normalized image coords
    canvasToNorm(px, py) {
        const { offsetX: ox, offsetY: oy, renderW: rw, renderH: rh } = this.renderParams;
        const tx = (px - this.pan.x) / this.zoom;
        const ty = (py - this.pan.y) / this.zoom;
        return { x: (tx - ox) / rw, y: (ty - oy) / rh };
    }

    normToCanvas(nx, ny) {
        const { offsetX: ox, offsetY: oy, renderW: rw, renderH: rh } = this.renderParams;
        const nx_canvas = ox + nx * rw;
        const ny_canvas = oy + ny * rh;
        return { x: nx_canvas * this.zoom + this.pan.x, y: ny_canvas * this.zoom + this.pan.y };
    }

    // Hit test: find which box index is under the given canvas coords
    hitTest(boxes, px, py) {
        const { x: nx, y: ny } = this.canvasToNorm(px, py);
        for (let i = boxes.length - 1; i >= 0; i--) {
            const box = boxes[i];
            if (box.type === 'obb') {
                if (this.pointInPolygon(nx, ny, box.coords)) return i;
            }
        }
        return -1;
    }

    pointInPolygon(px, py, coords) {
        // coords: [x1,y1,x2,y2,x3,y3,x4,y4]
        const xs = [coords[0], coords[2], coords[4], coords[6]];
        const ys = [coords[1], coords[3], coords[5], coords[7]];
        let inside = false;
        for (let i = 0, j = 3; i < 4; j = i++) {
            if ((ys[i] > py) !== (ys[j] > py) &&
                px < (xs[j] - xs[i]) * (py - ys[i]) / (ys[j] - ys[i]) + xs[i]) {
                inside = !inside;
            }
        }
        return inside;
    }
}
