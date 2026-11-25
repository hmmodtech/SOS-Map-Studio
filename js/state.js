window.SOS = window.SOS || {};
(function (S) {
  var KEY = 'aj_geocad_draft_v1', LEGACY_KEY = 'sos_draft_v1', L = {};
  var SAT_WARN_MB = 30;
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
      var out = Object.assign({}, this.project);
      try {
        if (S.SatComposer && S.SatComposer.hasData && S.SatComposer.hasData()) {
          var satFull = S.SatComposer.exportState({ includeHeavy: true });
          if (satFull) {
            var estMB = JSON.stringify(satFull).length / (1024 * 1024);
            if (estMB > SAT_WARN_MB) {
              var keepFull = confirm(
                'Sat Studio embedded imagery is ' + estMB.toFixed(1) + ' MB (exceeds ' + SAT_WARN_MB + ' MB safe JSON limit).\n\n' +
                'OK = Save FULL .ajcad.json (includes full-res satellite imagery)\n' +
                'Cancel = Save LIGHTWEIGHT .ajcad.json (calibration & metadata only; local browser IndexedDB copy stays intact)'
              );
              out.satStudio = keepFull ? satFull : S.SatComposer.exportState({ includeHeavy: false });
            } else {
              out.satStudio = satFull;
            }
          }
        }
      } catch (satErr) {
        try {
          if (S.SatComposer && S.SatComposer.exportState) out.satStudio = S.SatComposer.exportState({ includeHeavy: false });
        } catch (e2) {}
      }
      var jsonStr;
      try {
        jsonStr = JSON.stringify(out, null, 1);
      } catch (memErr) {
        delete out.satStudio;
        alert('Project imagery exceeded JSON string memory limit. Saving core CAD project without embedded satellite imagery.');
        jsonStr = JSON.stringify(out, null, 1);
      }
      var b = new Blob([jsonStr], { type: 'application/json' }), a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = (this.project.meta.name || 'project').replace(/[^\w-]+/g, '_') + '.ajcad.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    },
    loadProjectJSON: function (file) {
      var self = this;
      return new Promise(function (res, rej) {
        if (file && /\.zip$/i.test(file.name) && S.SatComposer && S.SatComposer.importGeoTerraFile) {
          S.SatComposer.open();
          S.SatComposer.importGeoTerraFile(file);
          return res(self.project);
        }
        var r = new FileReader();
        r.onload = function () {
          try {
            var clean = String(r.result || '').replace(/^\uFEFF/, '').trim();
            var p = JSON.parse(clean);
            var isGeoTerra = p && !p.meta && Array.isArray(p.features) && ('georeferencing' in p || 'executionPlan' in p || 'boundaryClosed' in p || 'imageWidth' in p || Array.isArray(p.points));
            if (isGeoTerra && S.SatComposer && S.SatComposer.importGeoTerraData) {
              S.SatComposer.open();
              S.SatComposer.importGeoTerraData(p, null);
              return res(self.project);
            }
            if (!p.meta || !Array.isArray(p.features)) throw new Error('Not a valid .ajcad.json / .sos.json or GeoTerra JSON file');
            var satData = (p.satStudio && typeof p.satStudio === 'object') ? p.satStudio : null;
            if ('satStudio' in p) delete p.satStudio;
            self.snapshot(); self.project = self.merge(p);
            if (satData && S.SatComposer && S.SatComposer.importState) {
              try { S.SatComposer.importState(satData); } catch (satErr) { console.warn('SatComposer import failed:', satErr); }
            }
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
        var parsed = JSON.parse(s);
        if (parsed && 'satStudio' in parsed) delete parsed.satStudio;
        this.snapshot(); this.project = this.merge(parsed);
        this.emit('select', null); this.emit('change'); return true;
      } catch (e) { return false; }
    },
    clearWorkspace: function () {
      try { localStorage.removeItem(KEY); localStorage.removeItem(LEGACY_KEY); } catch (e) {}
      this.undoStack = []; this.redoStack = []; this.project = blank();
      this.emit('clear');
      this.emit('select', null); this.emit('change');
    }
  };
  St.on('change', function () { if (St.autoSave) St.autoSaveDraft(); });
})(window.SOS);
