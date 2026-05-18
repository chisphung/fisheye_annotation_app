// editor.js — Drawing, moving, deleting annotations

class Editor {
    constructor(canvas, viewer) {
        this.canvas = canvas;
        this.viewer = viewer;
        this.tool = 'select';  // select, draw, move, delete
        this.drawingPoints = [];
        this.isDrawing = false;
        this.onModified = null;  // callback()

        this.toolBtns = document.querySelectorAll('.tool-btn[data-tool]');
        this.toolBtns.forEach(btn => {
            btn.addEventListener('click', () => this.setTool(btn.dataset.tool));
        });
    }

    setTool(tool) {
        this.tool = tool;
        this.drawingPoints = [];
        this.isDrawing = false;
        this.toolBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });
        this.canvas.style.cursor = tool === 'draw' ? 'crosshair' : (tool === 'delete' ? 'not-allowed' : 'default');
    }

    handleClick(e, boxes, focusedTrackId, split, frameName) {
        const rect = this.canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;

        if (this.tool === 'draw') {
            return this.handleDraw(px, py, focusedTrackId, split, frameName, boxes);
        } else if (this.tool === 'delete') {
            return this.handleDelete(px, py, boxes, split, frameName);
        } else if (this.tool === 'move') {
            return this.handleMove(px, py, boxes, focusedTrackId, split, frameName);
        }
        return null;
    }

    handleDraw(px, py, focusedTrackId, split, frameName, boxes) {
        const norm = this.viewer.canvasToNorm(px, py);
        this.drawingPoints.push(norm);

        if (this.drawingPoints.length >= 4) {
            // Create OBB from 4 points
            const pts = this.drawingPoints.slice(0, 4);
            const coords = [];
            pts.forEach(p => { coords.push(p.x, p.y); });

            const newBox = {
                "class": 0,
                type: "obb",
                coords: coords,
                track_id: focusedTrackId
            };

            boxes.push(newBox);
            this.drawingPoints = [];
            this.isDrawing = false;

            this.saveFrame(split, frameName, boxes);
            return 'added';
        }
        return 'drawing';
    }

    handleDelete(px, py, boxes, split, frameName) {
        const idx = this.viewer.hitTest(boxes, px, py);
        if (idx >= 0) {
            boxes.splice(idx, 1);
            this.saveFrame(split, frameName, boxes);
            return 'deleted';
        }
        return null;
    }

    handleMove(px, py, boxes, focusedTrackId, split, frameName) {
        if (!focusedTrackId) return null;
        const idx = this.viewer.hitTest(boxes, px, py);
        if (idx >= 0 && boxes[idx].track_id !== focusedTrackId) {
            const oldId = boxes[idx].track_id;
            boxes[idx].track_id = focusedTrackId;
            this.saveFrame(split, frameName, boxes);
            return { action: 'moved', oldId: oldId };
        }
        return null;
    }

    async saveFrame(split, frameName, boxes) {
        const payload = {
            split: split,
            frame_name: frameName,
            boxes: boxes.map(b => ({
                cls: b["class"] || 0,
                type: b.type,
                coords: b.coords,
                track_id: b.track_id
            }))
        };
        await fetch('/api/editor/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (this.onModified) this.onModified();
    }

    // Draw in-progress polygon points on canvas
    drawPending(ctx) {
        if (this.tool !== 'draw' || this.drawingPoints.length === 0) return;
        const pts = this.drawingPoints;
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.fillStyle = 'rgba(255,255,255,0.3)';

        ctx.beginPath();
        const p0 = this.viewer.normToCanvas(pts[0].x, pts[0].y);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < pts.length; i++) {
            const p = this.viewer.normToCanvas(pts[i].x, pts[i].y);
            ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();

        // Draw dots
        pts.forEach(pt => {
            const p = this.viewer.normToCanvas(pt.x, pt.y);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.setLineDash([]);
    }
}
