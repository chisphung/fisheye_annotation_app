// tracks.js — Track list panel module

class TrackPanel {
    constructor(listEl, showAllBtn) {
        this.listEl = listEl;
        this.showAllBtn = showAllBtn;
        this.tracks = [];
        this.focusedTrackId = null;
        this.onFocus = null;  // callback(trackId|null)
        this.colorFn = null;

        this.showAllBtn.addEventListener('click', () => this.unfocus());
    }

    setColorFn(fn) { this.colorFn = fn; }

    async load(split, frames, source = 'tracked_v2') {
        const framesParam = frames.join(',');
        const res = await fetch(`/api/tracks?split=${split}&source=${source}&frames=${framesParam}`);
        this.tracks = await res.json();
        this.render();
    }

    addNewTrack() {
        const ids = this.tracks.map(t => parseInt(t.track_id)).filter(id => !isNaN(id));
        const maxId = ids.length > 0 ? Math.max(...ids) : 0;
        const newId = (maxId + 1).toString();
        
        const newTrack = { track_id: newId, num_frames: 0, frames: [] };
        this.tracks.push(newTrack);
        // Sort tracks numerically
        this.tracks.sort((a, b) => {
            const aid = parseInt(a.track_id);
            const bid = parseInt(b.track_id);
            if (isNaN(aid)) return 1;
            if (isNaN(bid)) return -1;
            return aid - bid;
        });
        this.render();
        this.focus(newId);
        return newId;
    }

    render() {
        this.listEl.innerHTML = '';
        this.tracks.forEach(t => {
            const el = document.createElement('div');
            el.className = 'track-item' + (this.focusedTrackId === t.track_id ? ' focused' : '');
            const color = this.colorFn ? this.colorFn(t.track_id) : '#888';
            el.innerHTML = `
                <span class="track-color-dot" style="background:${color}"></span>
                <span class="track-label">Track ${t.track_id}</span>
                <span class="track-meta">${t.num_frames} frames</span>
            `;
            el.onclick = () => this.focus(t.track_id);
            this.listEl.appendChild(el);
        });
    }

    focus(trackId) {
        this.focusedTrackId = trackId;
        this.render();
        if (this.onFocus) this.onFocus(trackId);
    }

    unfocus() {
        this.focusedTrackId = null;
        this.render();
        if (this.onFocus) this.onFocus(null);
    }
}
