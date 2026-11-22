window.SOS = window.SOS || {};
(function (S) {
  var KEY = 'aj_geocad_draft_v1', LEGACY_KEY = 'sos_draft_v1', L = {};
  function blank() {
    return {
      meta: {
        version: '2.0', studio: 'AJ-GeoCAD Studio', name: 'Untitled Site',
        originLat: null, originLon: null, trueNorthOffsetDeg: 0, areaSqm: 0, perimeterM: 0, qrBaseUrl: ''
      },
      features: [], customAssets: [], interiors: {},
      routes: { fire: { nodes: [], edges: [] }, shelling: { nodes: [], edges: [] } },
      signagePins: []
    };
  }
  var St = S.State = {
    project: blank(), undoStack: [], redoStack: [], autoSave: false,
    blank: blank,
    on: function (e, f) { (L[e] = L[e] || []).push(f); },
    emit: function (e, d) { (L[e] || []).forEach(function (f) { f(d); }); },
    newFeature: function (o) {
      return Object.assign({
        id: 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        ar_name: '', en_name: '', category: 'building',
        shapeType: 'extrude', geometryType: 'polygon', coordsMetric: [], center: { x: 0, y: 0 },
        height_m: 6, floors: 1, roofType: 'flat', roofColor: null,
        preset: '', customStyled: false, tentShape: null, poolCover: null,
        fieldLights: false, lightRadius: null,
        hazard_flag: false, color: '#00ff9d', visible: true,
        customIconBase64: null, rotationDeg: 0, notes: ''
      }, o || {});
    },
    merge: function (p) {
      var b = blank(), self = this;
      return {
        meta: Object.assign(b.meta, p.meta || {}),
        features: (p.features || []).map(function (f) { return self.newFeature(f); }),
        customAssets: p.customAssets || [],
        interiors: p.interiors || {},
        routes: p.routes || b.routes,
        signagePins: p.signagePins || []
      };
    },
    snapshot: function () {
      this.undoStack.push(JSON.stringify(this.project));
      if (this.undoStack.length > 30) this.undoStack.shift();
      this.redoStack = [];
    },
    undo: function () {
      if (!this.undoStack.length) return;
      this.redoStack.push(JSON.stringify(this.project));
      this.project = JSON.parse(this.undoStack.pop());
      this.emit('select', null); this.emit('change');
    },
    redo: function () {
      if (!this.redoStack.length) return;
      this.undoStack.push(JSON.stringify(this.project));
      this.project = JSON.parse(this.redoStack.pop());
      this.emit('select', null); this.emit('change');
    },
    saveProjectJSON: function () {
      this.project.meta.studio = 'AJ-GeoCAD Studio';
      var b = new Blob([JSON.stringify(this.project, null, 1)], { type: 'application/json' }), a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = (this.project.meta.name || 'project').replace(/[^\w-]+/g, '_') + '.ajcad.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    },
    loadProjectJSON: function (file) {
      var self = this;
      return new Promise(function (res, rej) {
        var r = new FileReader();
        r.onload = function () {
          try {
            var p = JSON.parse(r.result);
            if (!p.meta || !Array.isArray(p.features)) throw new Error('Not a valid .ajcad.json / .sos.json project file');
            self.snapshot(); self.project = self.merge(p);
            self.emit('select', null); self.emit('change'); res(self.project);
          } catch (e) { rej(e); }
        };
        r.onerror = function () { rej(r.error); };
        r.readAsText(file);
      });
    },
    autoSaveDraft: function () { try { localStorage.setItem(KEY, JSON.stringify(this.project)); } catch (e) {} },
    restoreDraft: function () {
      try {
        var s = localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY);
        if (!s) return false;
        this.snapshot(); this.project = this.merge(JSON.parse(s));
        this.emit('select', null); this.emit('change'); return true;
      } catch (e) { return false; }
    },
    clearWorkspace: function () {
      try { localStorage.removeItem(KEY); localStorage.removeItem(LEGACY_KEY); } catch (e) {}
      this.undoStack = []; this.redoStack = []; this.project = blank();
      this.emit('select', null); this.emit('change');
    }
  };
  St.on('change', function () { if (St.autoSave) St.autoSaveDraft(); });
})(window.SOS);
