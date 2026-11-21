window.SOS = window.SOS || {};
(function (S) {
  var St = S.State, MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';
  var ov, isOpen = false, built = false, activeTab = 'export';

  function ensureCss() {
    if (document.getElementById('sos-exporter-css')) return;
    var st = document.createElement('style');
    st.id = 'sos-exporter-css';
    st.textContent =
      '.ex{position:fixed;inset:0;z-index:930;background:rgba(4,7,12,.86);color:#cfe8ff;display:flex;align-items:center;justify-content:center;padding:12px;font-family:' + MONO + '}' +
      '.ex.hide{display:none}' +
      '.exwin{width:100%;max-width:940px;max-height:92vh;background:#0e141d;border:1px solid #39ff14;border-radius:8px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 0 32px rgba(57,255,20,.14)}' +
      '.extop{display:flex;align-items:center;gap:6px;padding:8px 12px;background:#080b10;border-bottom:1px solid #1b2838;overflow-x:auto;flex-shrink:0}' +
      '.ext{color:#39ff14;font-size:12px;letter-spacing:.5px;white-space:nowrap;margin-right:6px}' +
      '.ex button,.ex select,.ex input,.ex textarea{font-family:' + MONO + ';font-size:11px;background:#0b1119;color:#cfe8ff;border:1px solid #1b2838;border-radius:4px;padding:6px 8px;outline:none}' +
      '.ex button{cursor:pointer;white-space:nowrap;flex-shrink:0}' +
      '.ex button:hover{border-color:#00d9ff;color:#fff}' +
      '.ex button.on{border-color:#39ff14;color:#39ff14;background:rgba(57,255,20,.14)}' +
      '.ex button.cy{border-color:#00d9ff;color:#00d9ff;background:rgba(0,217,255,.12)}' +
      '.ex button.dng{border-color:#ff3c3c;color:#ff3c3c}' +
      '.ex .sp{flex:1;min-width:8px}' +
      '.exbody{padding:14px;overflow-y:auto;display:flex;flex-direction:column;gap:12px;flex:1}' +
      '.exgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}' +
      '.excard{background:#080b10;border:1px solid #1b2838;border-radius:6px;padding:10px;display:flex;flex-direction:column;gap:7px}' +
      '.excard h4{margin:0 0 2px;font-size:11px;color:#00d9ff;text-transform:uppercase;letter-spacing:.6px;border-bottom:1px solid #1b2838;padding-bottom:4px}' +
      '.ex label{display:flex;flex-direction:column;gap:3px;font-size:11px;color:#8fa6bc}' +
      '.ex .row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}' +
      '.ex .row>*{flex:1}' +
      '.ex .mut{font-size:10px;color:#7a93a8;line-height:1.5;margin:0}' +
      '.exstat{display:flex;flex-wrap:wrap;gap:10px;padding:8px 10px;border-radius:5px;border:1px solid #1b2838;background:#0b1119;font-size:11px;align-items:center}' +
      '.exstat.ok{border-color:#39ff14}.exstat.warn{border-color:#e8c84a;color:#e8c84a}' +
      '.excode{width:100%;min-height:130px;resize:vertical;color:#a7f3d0;background:#05080d;border:1px solid #1b2838;font-size:11px;line-height:1.45;white-space:pre;overflow:auto}' +
      '.exfoot{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#080b10;border-top:1px solid #1b2838;flex-wrap:wrap}';
    document.head.appendChild(st);
  }

  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function defaultZones() {
    var fs = (St.project.features || []).filter(function (f) { return f.visible !== false && f.category !== 'fence' && f.category !== 'road' && f.category !== 'yard'; });
    function findBy(cats) {
      for (var i = 0; i < fs.length; i++) if (cats.indexOf(fs[i].category) >= 0) return fs[i];
      return null;
    }
    var picks = [
      { f: findBy(['building']), en: 'Main Building', ar: 'المبنى الرئيسي', col: '#2563eb' },
      { f: findBy(['medical']), en: 'Clinic', ar: 'العيادة', col: '#dc2626' },
      { f: findBy(['cottage']), en: 'Wooden Cottages', ar: 'الأكواخ الخشبية', col: '#b45309' },
      { f: findBy(['field', 'tent']), en: 'Field & Tents', ar: 'الملعب والخيام', col: '#16a34a' }
    ];
    return picks.map(function (p, idx) {
      var f = p.f || fs[idx] || null;
      return {
        featureId: f ? f.id : '',
        en: f ? (f.en_name || p.en) : p.en,
        ar: f ? (f.ar_name || p.ar) : p.ar,
        col: p.col
      };
    });
  }

  function ensureCfg() {
    if (!St.project.meta) St.project.meta = {};
    var cfg = St.project.meta.exportConfig;
    if (!cfg || typeof cfg !== 'object') {
      cfg = St.project.meta.exportConfig = {
        titleEn: 'Emergency Evacuation Map',
        titleAr: 'خريطة الطوارئ والإخلاء',
        defaultLang: 'ar',
        defaultTheme: 'print',
        defaultAlert: 'none',
        emergencyPhone: '',
        mikrotikIp: '192.168.88.1',
        hotspotDir: 'flash/hotspot',
        hotspotSsid: 'SOS-MAP',
        quickZones: defaultZones()
      };
    }
    if (!Array.isArray(cfg.quickZones) || cfg.quickZones.length !== 4) cfg.quickZones = defaultZones();
    return cfg;
  }

  function buildPayload() {
    var cfg = ensureCfg();
    var p = St.project;
    return {
      cfg: {
        titleEn: cfg.titleEn || 'Emergency Evacuation Map',
        titleAr: cfg.titleAr || 'خريطة الطوارئ والإخلاء',
        defaultLang: cfg.defaultLang || 'ar',
        defaultTheme: cfg.defaultTheme || 'print',
        defaultAlert: cfg.defaultAlert || 'none',
        emergencyPhone: cfg.emergencyPhone || '',
        quickZones: cfg.quickZones
      },
      meta: {
        name: (p.meta && p.meta.name) || 'Site',
        originLat: p.meta ? p.meta.originLat : null,
        originLon: p.meta ? p.meta.originLon : null,
        trueNorthOffsetDeg: (p.meta && p.meta.trueNorthOffsetDeg) || 0,
        areaSqm: (p.meta && p.meta.areaSqm) || 0
      },
      features: (p.features || []).filter(function (f) { return f.visible !== false; }).map(function (f) {
        return {
          id: f.id, en_name: f.en_name || '', ar_name: f.ar_name || '', category: f.category,
          geometryType: f.geometryType, coordsMetric: f.coordsMetric, center: f.center,
          height_m: f.height_m, floors: f.floors, roofType: f.roofType, hazard_flag: f.hazard_flag,
          color: f.color, rotationDeg: f.rotationDeg || 0, renderMode: f.renderMode,
          customIconBase64: f.customIconBase64 || null, notes: f.notes || ''
        };
      }),
      interiors: p.interiors || {},
      routes: p.routes || { fire: { nodes: [], edges: [] }, shelling: { nodes: [], edges: [] } },
      signagePins: p.signagePins || []
    };
  }

  // =========================================================================
  // STANDALONE READ-ONLY VILLAGE FIELD EDITION HTML GENERATOR (ZERO CDNs)
  // =========================================================================
  function generateStandaloneHtml(overrideAlert, overrideLoc) {
    var payload = buildPayload();
    if (overrideAlert) payload.cfg.defaultAlert = overrideAlert;
    var safeJson = JSON.stringify(payload).replace(/<\//g, '<\\/');

    var html = [
      '<!DOCTYPE html>',
      '<html lang="' + (payload.cfg.defaultLang === 'en' ? 'en' : 'ar') + '" dir="' + (payload.cfg.defaultLang === 'en' ? 'ltr' : 'rtl') + '">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">',
      '<title>' + esc(payload.cfg.titleAr + ' | ' + payload.cfg.titleEn) + '</title>',
      '<style>',
      '*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}',
      'html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;font-family:system-ui,-apple-system,"Segoe UI",Tahoma,Arial,sans-serif;background:#f6f1e7;color:#0f172a}',
      'body.dark{background:#080b10;color:#e6f3ff}',
      '#app{display:flex;flex-direction:column;width:100%;height:100%}',
      '#hdr{display:flex;align-items:center;gap:6px;padding:8px 10px;background:#0f172a;color:#fff;flex-shrink:0;z-index:10;box-shadow:0 2px 8px rgba(0,0,0,.25)}',
      '#hdr h1{margin:0;font-size:14px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}',
      '#hdr button{background:#1e293b;color:#fff;border:1px solid #334155;border-radius:6px;padding:6px 9px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}',
      '#hdr button.on{background:#16a34a;border-color:#22c55e}',
      '#banner{display:none;padding:9px 12px;font-size:13px;font-weight:800;align-items:center;justify-content:space-between;gap:8px;flex-shrink:0;z-index:9}',
      '#banner.fire{display:flex;background:#15803d;color:#fff;border-bottom:3px solid #facc15}',
      '#banner.shelling{display:flex;background:#1d4ed8;color:#fff;border-bottom:3px solid #38bdf8}',
      '#banner .sub{font-size:11px;font-weight:600;opacity:.95;display:block;margin-top:2px}',
      '#banner button{background:rgba(0,0,0,.3);color:#fff;border:1px solid rgba(255,255,255,.6);border-radius:6px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}',
      '#stage{flex:1;position:relative;min-height:0;overflow:hidden}',
      '#cv{width:100%;height:100%;display:block;touch-action:none}',
      '#fab{position:absolute;bottom:12px;inset-inline-end:12px;display:flex;flex-direction:column;gap:6px;z-index:8}',
      '#fab button{width:42px;height:42px;border-radius:50%;border:1px solid #334155;background:rgba(15,23,42,.9);color:#fff;font-size:16px;font-weight:800;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)}',
      '#info{position:absolute;bottom:12px;inset-inline-start:12px;max-width:calc(100% - 76px);background:rgba(255,255,255,.95);color:#0f172a;border:2px solid #0f172a;border-radius:8px;padding:8px 11px;font-size:12px;display:none;z-index:8;box-shadow:0 4px 14px rgba(0,0,0,.22)}',
      'body.dark #info{background:rgba(14,20,29,.95);color:#e6f3ff;border-color:#00d9ff}',
      '#info button{margin-top:6px;background:#0f172a;color:#fff;border:0;border-radius:5px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer}',
      '#bar{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:8px;background:#0f172a;border-top:1px solid #1e293b;flex-shrink:0;z-index:10}',
      '#bar button{padding:10px 4px;border-radius:8px;border:2px solid transparent;font-size:12px;font-weight:800;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;color:#fff;background:#1e293b}',
      '#bar button.fire{background:#166534;border-color:#22c55e}',
      '#bar button.fire.on{background:#16a34a;box-shadow:0 0 12px rgba(34,197,94,.6)}',
      '#bar button.shel{background:#1e3a8a;border-color:#38bdf8}',
      '#bar button.shel.on{background:#2563eb;box-shadow:0 0 12px rgba(56,189,248,.6)}',
      '#bar button.loc{background:#9a3412;border-color:#f97316}',
      '#bar button.snd{background:#334155;border-color:#64748b}',
      '#bar button.snd.on{background:#dc2626;border-color:#facc15}',
      '.modal{position:fixed;inset:0;background:rgba(8,11,16,.84);z-index:50;display:none;align-items:center;justify-content:center;padding:14px}',
      '.modal.open{display:flex}',
      '.mbox{width:100%;max-width:440px;background:#ffffff;color:#0f172a;border-radius:12px;padding:16px;box-shadow:0 12px 32px rgba(0,0,0,.45);display:flex;flex-direction:column;gap:10px}',
      'body.dark .mbox{background:#0e141d;color:#e6f3ff;border:1px solid #00d9ff}',
      '.mbox h2{margin:0;font-size:17px;text-align:center}',
      '.zgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
      '.zbtn{padding:16px 10px;border-radius:10px;border:0;color:#fff;font-size:14px;font-weight:800;cursor:pointer;min-height:66px;box-shadow:0 3px 10px rgba(0,0,0,.2)}',
      '.gpsbtn{padding:11px;border-radius:8px;border:2px solid #0284c7;background:#e0f2fe;color:#0369a1;font-size:13px;font-weight:800;cursor:pointer}',
      '.clsbtn{padding:9px;border-radius:8px;border:1px solid #94a3b8;background:transparent;color:inherit;font-size:12px;font-weight:700;cursor:pointer}',
      '#flModal .mbox{max-width:760px;height:84vh;padding:10px}',
      '#flTop{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
      '#flTabs{display:flex;gap:5px;flex:1;overflow-x:auto}',
      '#flTabs button{padding:6px 10px;border-radius:6px;border:1px solid #64748b;background:#e2e8f0;color:#0f172a;font-weight:800;cursor:pointer}',
      '#flTabs button.on{background:#16a34a;color:#fff;border-color:#15803d}',
      '#flCv{flex:1;width:100%;min-height:200px;border:1px solid #94a3b8;border-radius:6px;background:#f8fafc}',
      '</style>',
      '</head>',
      '<body>',
      '<div id="app">',
      '  <header id="hdr">',
      '    <h1 id="titleTxt"></h1>',
      '    <button id="btnTheme"></button>',
      '    <button id="btnLang"></button>',
      '  </header>',
      '  <div id="banner">',
      '    <div><span id="banMain"></span><span id="banSub" class="sub"></span></div>',
      '    <button id="btnClearAlert"></button>',
      '  </div>',
      '  <div id="stage">',
      '    <canvas id="cv"></canvas>',
      '    <div id="info"></div>',
      '    <div id="fab">',
      '      <button id="zIn" title="Zoom In">+</button>',
      '      <button id="zOut" title="Zoom Out">&minus;</button>',
      '      <button id="zFit" title="Fit">&#8982;</button>',
      '    </div>',
      '  </div>',
      '  <nav id="bar">',
      '    <button id="bFire" class="fire"><span>&#128293;</span><span id="lFire"></span></button>',
      '    <button id="bShel" class="shel"><span>&#128737;</span><span id="lShel"></span></button>',
      '    <button id="bLoc" class="loc"><span>&#128205;</span><span id="lLoc"></span></button>',
      '    <button id="bSnd" class="snd"><span>&#128266;</span><span id="lSnd"></span></button>',
      '  </nav>',
      '</div>',
      '<div id="locModal" class="modal">',
      '  <div class="mbox">',
      '    <h2 id="locTitle"></h2>',
      '    <div id="zGrid" class="zgrid"></div>',
      '    <button id="btnGps" class="gpsbtn"></button>',
      '    <div id="gpsMsg" style="font-size:12px;text-align:center;color:#dc2626;font-weight:700"></div>',
      '    <button id="btnLocClose" class="clsbtn"></button>',
      '  </div>',
      '</div>',
      '<div id="flModal" class="modal">',
      '  <div class="mbox">',
      '    <div id="flTop"><b id="flName" style="font-size:14px"></b><div id="flTabs"></div><button id="btnFlClose" class="clsbtn"></button></div>',
      '    <canvas id="flCv"></canvas>',
      '  </div>',
      '</div>',
      '<script>',
      'window.SOS_VILLAGE_DATA=' + safeJson + ';',
      '(function(){',
      'var DATA=window.SOS_VILLAGE_DATA,CFG=DATA.cfg,D=Math.PI/180,SANS="system-ui,-apple-system,Segoe UI,Tahoma,Arial,sans-serif",MONO="ui-monospace,Menlo,Consolas,monospace";',
      'var lang=CFG.defaultLang==="en"?"en":"ar",theme=CFG.defaultTheme==="dark"?"dark":"print",alertMode="none",userPos=null,selFeat=null,sirenOn=false,audioCtx=null,sirenTimer=null;',
      'var cv=document.getElementById("cv"),ctx=cv.getContext("2d"),W=1,H=1,dpr=1,view={s:4,ox:0,oy:0,rot:0},ptrs={},drag=null;',
      'var T={',
      '  ar:{fire:"حريق",shel:"قصف / احتماء",loc:"أين أنا؟",snd:"الإنذار",sndOff:"إيقاف الصوت",themeD:"ليلي",themeL:"نهاري",lang:"EN",close:"إغلاق",cancelAlert:"إلغاء التنبيه",where:"أين أنت الآن؟ اضغط على منطقتك:",gps:"تحديد موقعي عبر GPS (ساحات مفتوحة)",you:"أنت هنا",fireBan:"إنذار حريق: اتبع المسار الأخضر فوراً إلى نقطة التجمع",shelBan:"إنذار قصف / إطلاق نار: احتمِ بالمنطقة الزرقاء بعيداً عن النوافذ",openFl:"عرض مخطط الطوابق الداخلي",dist:"المسافة",kids:"زمن للأطفال",adults:"للكبار",phone:"طوارئ الأمن",gpsNo:"GPS يعمل فقط على اتصال آمن HTTPS — اختر منطقتك بالأعلى",gpsOut:"إشارة GPS مشوشة أو خارج القرية — اختر منطقتك يدوياً",gpsWait:"جاري فحص GPS..."},',
      '  en:{fire:"Fire",shel:"Shelling",loc:"Locate Me",snd:"Siren",sndOff:"Mute",themeD:"Night",themeL:"Day",lang:"عربي",close:"Close",cancelAlert:"Clear Alert",where:"Where are you now? Tap your zone:",gps:"Use GPS (Open Areas Only)",you:"YOU ARE HERE",fireBan:"FIRE ALERT: Follow GREEN route to Assembly Point",shelBan:"SHELLING ALERT: Move to BLUE Safe Haven away from windows",openFl:"View Interior Floor Plan",dist:"Distance",kids:"Children pace",adults:"Adults",phone:"Security Desk",gpsNo:"GPS requires HTTPS — select your zone above",gpsOut:"GPS jammed or outside site — pick your zone manually",gpsWait:"Checking GPS..."}',
      '};',
      'function tr(k){return (T[lang]||T.ar)[k]||k;}',
      'function nm(o){return lang==="ar"?(o.ar_name||o.en_name||o.id):(o.en_name||o.ar_name||o.id);}',
      'function fmt(s){var m=Math.floor(s/60),x=Math.round(s%60);return m?(m+"m "+(x<10?"0":"")+x+"s"):(x+"s");}',
      'function featPts(f){var r=(f.rotationDeg||0)*D,c=Math.cos(r),n=Math.sin(r),m=f.center||{x:0,y:0};return(f.coordsMetric||[]).map(function(p){var dx=p.x-m.x,dy=p.y-m.y;return{x:m.x+dx*c-dy*n,y:m.y+dx*n+dy*c};});}',
      'function cen(a){var x=0,y=0;a.forEach(function(p){x+=p.x;y+=p.y;});return{x:x/a.length,y:y/a.length};}',
      'function bb(a){var b={x0:1e18,y0:1e18,x1:-1e18,y1:-1e18};a.forEach(function(p){b.x0=Math.min(b.x0,p.x);b.x1=Math.max(b.x1,p.x);b.y0=Math.min(b.y0,p.y);b.y1=Math.max(b.y1,p.y);});return b;}',
      'function inP(x,y,a){var r=false;for(var i=0,j=a.length-1;i<a.length;j=i++)if((a[i].y>y)!==(a[j].y>y)&&x<(a[j].x-a[i].x)*(y-a[i].y)/(a[j].y-a[i].y)+a[i].x)r=!r;return r;}',
      'function domAng(a){var sx=0,sy=0;for(var i=0;i<a.length;i++){var q=a[(i+1)%a.length],dx=q.x-a[i].x,dy=q.y-a[i].y,l=Math.hypot(dx,dy),t=Math.atan2(dy,dx);sx+=l*Math.cos(2*t);sy+=l*Math.sin(2*t);}return .5*Math.atan2(sy,sx);}',
      'function hash(s){var v=7;for(var i=0;i<s.length;i++)v=(v*31+s.charCodeAt(i))>>>0;return v;}',
      'function rotPt(p){var c=Math.cos(view.rot),s=Math.sin(view.rot);return{x:p.x*c-p.y*s,y:p.x*s+p.y*c};}',
      'function w2s(p){var q=rotPt(p);return[view.ox+q.x*view.s,view.oy-q.y*view.s];}',
      'function s2w(px,py){var rx=(px-view.ox)/view.s,ry=(view.oy-py)/view.s,c=Math.cos(-view.rot),s=Math.sin(-view.rot);return{x:rx*c-ry*s,y:rx*s+ry*c};}',
      'function solveRoute(proto,pt){',
      '  if(!pt||proto==="none")return null;',
      '  var g=DATA.routes&&DATA.routes[proto];',
      '  if(g&&g.nodes&&g.nodes.length){',
      '    var near=null,bd=1e18;',
      '    g.nodes.forEach(function(n){if(n.blocked)return;var d=Math.hypot(n.x-pt.x,n.y-pt.y);if(d<bd){bd=d;near=n;}});',
      '    if(near){',
      '      var goals={};g.nodes.forEach(function(n){if(n.blocked)return;if(proto==="fire"&&(n.type==="assembly"||n.type==="exit"))goals[n.id]=n.type==="assembly"?1:2;if(proto==="shelling"&&n.type==="safe_haven")goals[n.id]=1;});',
      '      var adj={};g.nodes.forEach(function(n){if(!n.blocked)adj[n.id]=[];});',
      '      (g.edges||[]).forEach(function(e){if(e.blocked)return;var a=g.nodes.find(function(x){return x.id===e.from;}),b=g.nodes.find(function(x){return x.id===e.to;});if(!a||!b||a.blocked||b.blocked)return;var d=Math.hypot(b.x-a.x,b.y-a.y);adj[a.id].push({to:b.id,w:d});if(e.bidirectional!==false)adj[b.id].push({to:a.id,w:d});});',
      '      var dist={},prev={},vis={};Object.keys(adj).forEach(function(k){dist[k]=1e18;});dist[near.id]=0;',
      '      while(true){var u=null,best=1e18;Object.keys(adj).forEach(function(k){if(!vis[k]&&dist[k]<best){best=dist[k];u=k;}});if(!u||best>=1e17)break;vis[u]=1;adj[u].forEach(function(nb){var alt=dist[u]+nb.w;if(alt<dist[nb.to]){dist[nb.to]=alt;prev[nb.to]=u;}});}',
      '      var bestG=null,bestD=1e18;',
      '      [1,2].forEach(function(prio){if(bestG)return;Object.keys(goals).forEach(function(gid){if(goals[gid]===prio&&dist[gid]<bestD){bestD=dist[gid];bestG=gid;}});});',
      '      if(bestG){var chain=[],cur=bestG;while(cur){var nd=g.nodes.find(function(x){return x.id===cur;});if(nd)chain.unshift({x:nd.x,y:nd.y});cur=prev[cur];}chain.unshift({x:pt.x,y:pt.y});return{pts:chain,dist:bestD+bd};}',
      '    }',
      '  }',
      '  var targets=DATA.features.filter(function(f){return proto==="fire"?(f.category==="assembly"||f.category==="gate"):(f.category==="building"&&((f.floors|0)>=2||f.hazard_flag==="safe_haven"));});',
      '  if(!targets.length)return null;',
      '  var bt=null,td=1e18;targets.forEach(function(f){var p=f.geometryType==="point"?(f.coordsMetric[0]||f.center):f.center;var d=Math.hypot(p.x-pt.x,p.y-pt.y);if(d<td){td=d;bt=p;}});',
      '  return bt?{pts:[{x:pt.x,y:pt.y},{x:bt.x,y:bt.y}],dist:td}:null;',
      '}',
      'function stopSiren(){sirenOn=false;if(sirenTimer){clearInterval(sirenTimer);sirenTimer=null;}updateUI();}',
      'function startSiren(){',
      '  try{var AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;if(!audioCtx)audioCtx=new AC();if(audioCtx.state==="suspended")audioCtx.resume();',
      '  stopSiren();sirenOn=true;var step=0;',
      '  function beep(){if(!sirenOn||!audioCtx)return;var o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=alertMode==="shelling"?"triangle":"sawtooth";var f=alertMode==="shelling"?(step%2?520:760):(step%2?880:660);o.frequency.setValueAtTime(f,audioCtx.currentTime);g.gain.setValueAtTime(0.08,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+0.42);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+0.44);step++;}',
      '  beep();sirenTimer=setInterval(beep,520);updateUI();}catch(e){}',
      '}',
      'function fit(){',
      '  view.rot=(DATA.meta.trueNorthOffsetDeg||0)*D;',
      '  var all=[];DATA.features.forEach(function(f){featPts(f).forEach(function(p){all.push(rotPt(p));});});',
      '  if(!all.length){view.s=4;view.ox=W/2;view.oy=H/2;return;}',
      '  var b=bb(all),bw=Math.max(15,b.x1-b.x0),bh=Math.max(15,b.y1-b.y0);',
      '  view.s=0.86*Math.min(W/bw,H/bh);view.ox=W/2-((b.x0+b.x1)/2)*view.s;view.oy=H/2+((b.y0+b.y1)/2)*view.s;',
      '}',
      'function drawArrow(x1,y1,x2,y2,col){var ang=Math.atan2(y2-y1,x2-x1),mx=(x1+x2)/2,my=(y1+y2)/2;ctx.save();ctx.translate(mx,my);ctx.rotate(ang);ctx.fillStyle=col;ctx.strokeStyle="#fff";ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(9,0);ctx.lineTo(-6,-5.5);ctx.lineTo(-3.5,0);ctx.lineTo(-6,5.5);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();}',
      'function draw(){',
      '  var dk=theme==="dark";ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle=dk?"#080b10":"#f6f1e7";ctx.fillRect(0,0,W,H);',
      '  function poly(arr,fill,stroke,lw){ctx.beginPath();arr.forEach(function(p,i){i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]);});ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw||1.2;ctx.stroke();}}',
      '  DATA.features.forEach(function(f){if(f.category==="fence"&&f.geometryType==="polygon")poly(featPts(f).map(w2s),dk?"#0d141e":"#f1dbb0",dk?"#39ff14":"#4b5563",2.4);});',
      '  DATA.features.forEach(function(f){',
      '    if(f.geometryType!=="polygon")return;var a=featPts(f),ps=a.map(w2s),c=f.category;',
      '    if(c==="road")poly(ps,dk?"#1e293b":"#d4d0c8",dk?"#475569":"#7a756c");',
      '    else if(c==="yard")poly(ps,dk?"#131c28":"#e8d0a2",dk?"#334155":"#c0aa80");',
      '    else if(c==="parking")poly(ps,dk?"#1e293b":"#9ca3af",dk?"#64748b":"#374151");',
      '    else if(c==="playground")poly(ps,dk?"#2c2416":"#e8ca8e",dk?"#e8c84a":"#785a3a");',
      '    else if(c==="field"){poly(ps,dk?"#14532d":"#3fa335","#fff",1.6);var th=domAng(a),cs=Math.cos(th),sn=Math.sin(th),mc=cen(a);function F2W(lx,ly){return{x:mc.x+lx*cs-ly*sn,y:mc.y+lx*sn+ly*cs};}var fb=bb(a.map(function(p){var dx=p.x-mc.x,dy=p.y-mc.y;return{x:dx*cs+dy*sn,y:-dx*sn+dy*cs};}));var mx=(fb.x0+fb.x1)/2,my=(fb.y0+fb.y1)/2,l1=w2s(F2W(mx,fb.y0)),l2=w2s(F2W(mx,fb.y1));ctx.strokeStyle="#fff";ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(l1[0],l1[1]);ctx.lineTo(l2[0],l2[1]);ctx.stroke();}',
      '    else if(c==="olive_zone"){poly(ps,dk?"#132216":"#ebd4a2",dk?"#3f8f2f":"#b09a70");var ob=bb(a),sd=hash(f.id),tr=[],tries=0;while(tr.length<22&&tries++<260){sd=(sd*1664525+1013904223)>>>0;var rx=ob.x0+sd/4294967296*(ob.x1-ob.x0);sd=(sd*1664525+1013904223)>>>0;var ry=ob.y0+sd/4294967296*(ob.y1-ob.y0);if(inP(rx,ry,a))tr.push({x:rx,y:ry});}tr.forEach(function(t){var tp=w2s(t),r=Math.max(3,1.5*view.s);ctx.beginPath();ctx.arc(tp[0],tp[1],r,0,6.3);ctx.fillStyle=dk?"#2f6f2f":"#4e7532";ctx.fill();});}',
      '  });',
      '  DATA.features.forEach(function(f){',
      '    if(f.geometryType!=="polygon")return;var a=featPts(f),ps=a.map(w2s),c=f.category;',
      '    if(["fence","road","yard","field","olive_zone","parking","playground"].indexOf(c)>=0)return;',
      '    if(!dk)poly(a.map(function(p){return w2s({x:p.x+1.2,y:p.y-1});}),"rgba(35,30,22,0.2)");',
      '    if(c==="building")poly(ps,dk?"#3b4c5e":"#cbd5e1",dk?"#89a4be":"#1e293b",1.8);',
      '    else if(c==="medical"){poly(ps,"#d4423e",dk?"#ff8a8a":"#1e293b",1.8);var cm=w2s(cen(a)),cr=Math.max(6,Math.min(14,2*view.s));ctx.beginPath();ctx.arc(cm[0],cm[1],cr,0,6.3);ctx.fillStyle="#fff";ctx.fill();ctx.beginPath();ctx.arc(cm[0]-cr*.08,cm[1],cr*.65,0,6.3);ctx.fillStyle="#d62828";ctx.fill();ctx.beginPath();ctx.arc(cm[0]+cr*.22,cm[1],cr*.55,0,6.3);ctx.fillStyle="#fff";ctx.fill();}',
      '    else if(c==="security")poly(ps,"#c9413b","#1e293b",1.5);',
      '    else if(c==="solar")poly(ps,"#224a88",dk?"#38bdf8":"#1e293b",1.2);',
      '    else if(c==="pool")poly(ps,"#38bdf8","#0369a1",1.6);',
      '    else if(c==="hazard"||c==="diesel_tank")poly(ps,dk?"#5f1d1d":"#fca5a5","#dc2626",1.8);',
      '    else if(c==="cottage")poly(ps,dk?"#8a5a32":"#d49a62",dk?"#e8b888":"#5c3a1e",1.4);',
      '    else if(c==="tent")poly(ps,dk?"#64748b":"#ffffff",dk?"#cbd5e1":"#475569",1.3);',
      '    else if(c==="gate")poly(ps,"#dc2626","#0f172a",1.6);',
      '    else poly(ps,dk?"#334155":"#e2e8f0","#475569");',
      '  });',
      '  DATA.features.forEach(function(f){',
      '    if(f.geometryType!=="point")return;var pt=w2s(f.coordsMetric[0]||f.center),c=f.category;',
      '    if(c==="assembly"){ctx.beginPath();ctx.arc(pt[0],pt[1],Math.max(12,5.5*view.s),0,6.3);ctx.fillStyle="rgba(22,163,74,.25)";ctx.fill();ctx.strokeStyle="#16a34a";ctx.lineWidth=2.2;ctx.stroke();ctx.beginPath();ctx.arc(pt[0],pt[1],10,0,6.3);ctx.fillStyle="#16a34a";ctx.fill();ctx.fillStyle="#fff";ctx.font="bold 11px "+MONO;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("A",pt[0],pt[1]+.5);}',
      '    else if(c==="vehicle"){ctx.fillStyle="#1e5aa8";ctx.strokeStyle="#fff";ctx.lineWidth=1.4;ctx.fillRect(pt[0]-10,pt[1]-5,20,10);ctx.strokeRect(pt[0]-10,pt[1]-5,20,10);}',
      '    else if(c==="extinguisher"){ctx.beginPath();ctx.arc(pt[0],pt[1],6,0,6.3);ctx.fillStyle="#dc2626";ctx.fill();ctx.strokeStyle="#fff";ctx.lineWidth=1.5;ctx.stroke();}',
      '  });',
      '  var res=solveRoute(alertMode,userPos);',
      '  if(res&&res.pts.length>=2){',
      '    var sp=res.pts.map(w2s),rc=alertMode==="fire"?"#16a34a":"#2563eb";',
      '    ctx.save();ctx.lineCap="round";ctx.lineJoin="round";',
      '    ctx.strokeStyle="#ffffff";ctx.lineWidth=8;ctx.beginPath();sp.forEach(function(p,i){i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]);});ctx.stroke();',
      '    ctx.strokeStyle=rc;ctx.lineWidth=4.8;ctx.setLineDash([12,7]);ctx.lineDashOffset=-(Date.now()/30%19);ctx.beginPath();sp.forEach(function(p,i){i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]);});ctx.stroke();ctx.setLineDash([]);',
      '    for(var i=0;i<sp.length-1;i++)if(Math.hypot(sp[i+1][0]-sp[i][0],sp[i+1][1]-sp[i][1])>22)drawArrow(sp[i][0],sp[i][1],sp[i+1][0],sp[i+1][1],rc);',
      '    ctx.restore();',
      '  }',
      '  var placed=[];ctx.font="bold 11px "+SANS;ctx.textAlign="center";ctx.textBaseline="middle";',
      '  DATA.features.forEach(function(f){',
      '    if(["fence","road","yard","extinguisher"].indexOf(f.category)>=0)return;var tx=nm(f);if(!tx)return;',
      '    var pt=w2s(f.geometryType==="point"?(f.coordsMetric[0]||f.center):f.center),tw=ctx.measureText(tx).width+10,rx=pt[0]-tw/2,ry=pt[1]-9;',
      '    for(var i=0;i<placed.length;i++){var q=placed[i];if(rx-3<q[0]+q[2]&&rx+tw+3>q[0]&&ry-3<q[1]+q[3]&&ry+21>q[1])return;}',
      '    placed.push([rx,ry,tw,18]);ctx.fillStyle=dk?"rgba(8,11,16,.88)":"rgba(255,255,255,.92)";ctx.fillRect(rx,ry,tw,18);ctx.strokeStyle=dk?"#38bdf8":"#64748b";ctx.lineWidth=1;ctx.strokeRect(rx,ry,tw,18);ctx.fillStyle=dk?"#e6f3ff":"#0f172a";ctx.fillText(tx,pt[0],pt[1]+.5);',
      '  });',
      '  if(userPos){',
      '    var up=w2s(userPos),pulse=14+5*Math.sin(Date.now()/240);',
      '    ctx.beginPath();ctx.arc(up[0],up[1],pulse,0,6.3);ctx.fillStyle="rgba(220,38,38,.25)";ctx.fill();ctx.strokeStyle="#dc2626";ctx.lineWidth=2;ctx.stroke();',
      '    ctx.beginPath();ctx.arc(up[0],up[1],9,0,6.3);ctx.fillStyle="#dc2626";ctx.fill();ctx.strokeStyle="#facc15";ctx.lineWidth=2.5;ctx.stroke();',
      '    var yt=tr("you");ctx.font="bold 11px "+SANS;var yw=ctx.measureText(yt).width+12;ctx.fillStyle="#b91c1c";ctx.fillRect(up[0]-yw/2,up[1]+14,yw,19);ctx.strokeStyle="#facc15";ctx.strokeRect(up[0]-yw/2,up[1]+14,yw,19);ctx.fillStyle="#fff";ctx.fillText(yt,up[0],up[1]+24);',
      '  }',
      '}',
      'function loop(){if(alertMode!=="none"||userPos)draw();requestAnimationFrame(loop);}',
      'function updateUI(){',
      '  document.documentElement.lang=lang;document.documentElement.dir=lang==="ar"?"rtl":"ltr";',
      '  document.body.classList.toggle("dark",theme==="dark");',
      '  document.getElementById("titleTxt").textContent=lang==="ar"?CFG.titleAr:CFG.titleEn;',
      '  document.getElementById("btnTheme").textContent=theme==="dark"?tr("themeL"):tr("themeD");',
      '  document.getElementById("btnLang").textContent=tr("lang");',
      '  document.getElementById("lFire").textContent=tr("fire");document.getElementById("lShel").textContent=tr("shel");',
      '  document.getElementById("lLoc").textContent=tr("loc");document.getElementById("lSnd").textContent=sirenOn?tr("sndOff"):tr("snd");',
      '  document.getElementById("bFire").classList.toggle("on",alertMode==="fire");document.getElementById("bShel").classList.toggle("on",alertMode==="shelling");document.getElementById("bSnd").classList.toggle("on",sirenOn);',
      '  document.getElementById("locTitle").textContent=tr("where");document.getElementById("btnGps").textContent=tr("gps");document.getElementById("btnLocClose").textContent=tr("close");document.getElementById("btnFlClose").textContent=tr("close");document.getElementById("btnClearAlert").textContent=tr("cancelAlert");',
      '  var ban=document.getElementById("banner");ban.className=alertMode==="none"?"":alertMode;',
      '  if(alertMode!=="none"){',
      '    document.getElementById("banMain").textContent=alertMode==="fire"?tr("fireBan"):tr("shelBan");',
      '    var res=solveRoute(alertMode,userPos);',
      '    var sub=res?(tr("dist")+": "+res.dist.toFixed(0)+"m | "+tr("kids")+": ~"+fmt(res.dist/.8)+" | "+tr("adults")+": ~"+fmt(res.dist/1.2)):tr("where");',
      '    if(CFG.emergencyPhone)sub+=" | "+tr("phone")+": "+CFG.emergencyPhone;',
      '    document.getElementById("banSub").textContent=sub;',
      '  }',
      '  var zg=document.getElementById("zGrid");',
      '  zg.innerHTML=CFG.quickZones.map(function(z,i){return"<button class=\\"zbtn\\" data-zi=\\""+i+"\\" style=\\"background:"+z.col+"\\">"+(lang==="ar"?(z.ar||z.en):(z.en||z.ar))+"</button>";}).join("");',
      '  [].forEach.call(zg.querySelectorAll("[data-zi]"),function(b){b.onclick=function(){var z=CFG.quickZones[+b.dataset.zi];var f=DATA.features.find(function(x){return x.id===z.featureId;});if(f){var p=f.geometryType==="point"?(f.coordsMetric[0]||f.center):f.center;userPos={x:p.x,y:p.y};}document.getElementById("locModal").classList.remove("open");updateUI();draw();};});',
      '  renderInfo();draw();',
      '}',
      'function renderInfo(){',
      '  var el=document.getElementById("info");if(!selFeat){el.style.display="none";return;}',
      '  var hasInt=DATA.interiors&&DATA.interiors[selFeat.id];',
      '  el.innerHTML="<b>"+nm(selFeat)+"</b>"+(selFeat.notes?"<div style=\\"margin-top:3px;opacity:.85\\">"+selFeat.notes+"</div>":"")+(hasInt?"<div><button id=\\"bOpenInt\\">"+tr("openFl")+"</button></div>":"");',
      '  el.style.display="block";',
      '  var bo=document.getElementById("bOpenInt");if(bo)bo.onclick=function(){openFloor(selFeat);};',
      '}',
      'function openFloor(f){',
      '  var inter=DATA.interiors[f.id];if(!inter)return;',
      '  var fm=document.getElementById("flModal"),fcv=document.getElementById("flCv"),fctx=fcv.getContext("2d"),tabs=document.getElementById("flTabs");',
      '  document.getElementById("flName").textContent=nm(f);fm.classList.add("open");',
      '  var ks=Object.keys(inter.floors||{"1":{}}),curFl=ks[0]||"1";',
      '  var w=featPts(f),cx=0,cy=0;w.forEach(function(p){cx+=p.x;cy+=p.y;});cx/=w.length;cy/=w.length;var a=inter.alignAngleRad||0,ca=Math.cos(a),sa=Math.sin(a);',
      '  var loc=w.map(function(p){var dx=p.x-cx,dy=p.y-cy;return{x:dx*ca-dy*sa,y:dx*sa+dy*ca};}),b=bb(loc);',
      '  function drawFl(){',
      '    var r=fcv.getBoundingClientRect(),fw=Math.max(10,r.width),fh=Math.max(10,r.height);fcv.width=Math.round(fw*dpr);fcv.height=Math.round(fh*dpr);',
      '    fctx.setTransform(dpr,0,0,dpr,0,0);fctx.fillStyle="#f8fafc";fctx.fillRect(0,0,fw,fh);',
      '    var s=0.8*Math.min(fw/Math.max(4,b.x1-b.x0),fh/Math.max(4,b.y1-b.y0)),ox=fw/2-(b.x0+b.x1)/2*s,oy=fh/2+(b.y0+b.y1)/2*s;',
      '    function T(p){return[ox+p.x*s,oy-p.y*s];}',
      '    fctx.beginPath();loc.map(T).forEach(function(p,i){i?fctx.lineTo(p[0],p[1]):fctx.moveTo(p[0],p[1]);});fctx.closePath();fctx.fillStyle="#fff";fctx.fill();',
      '    var g=(inter.floors&&inter.floors[curFl])||{rooms:[],walls:[],items:[]};',
      '    (g.rooms||[]).forEach(function(rm){var tl=T({x:rm.x-rm.w/2,y:rm.y+rm.h/2});fctx.fillStyle="rgba(226,232,240,.65)";fctx.fillRect(tl[0],tl[1],rm.w*s,rm.h*s);fctx.strokeStyle="#64748b";fctx.lineWidth=1.2;fctx.strokeRect(tl[0],tl[1],rm.w*s,rm.h*s);var mc=T(rm);fctx.fillStyle="#0f172a";fctx.font="bold 11px "+SANS;fctx.textAlign="center";fctx.textBaseline="middle";fctx.fillText(nm(rm),mc[0],mc[1]);});',
      '    fctx.strokeStyle="#334155";fctx.lineWidth=Math.max(2,.15*s);(g.walls||[]).forEach(function(wl){var p1=T({x:wl.x1,y:wl.y1}),p2=T({x:wl.x2,y:wl.y2});fctx.beginPath();fctx.moveTo(p1[0],p1[1]);fctx.lineTo(p2[0],p2[1]);fctx.stroke();});',
      '    (g.items||[]).forEach(function(it){var pt=T(it);fctx.save();fctx.translate(pt[0],pt[1]);fctx.rotate(-(it.rotationDeg||0)*D);fctx.scale(s,s);if(it.type==="safe_haven"){fctx.fillStyle="rgba(37,99,235,.22)";fctx.fillRect(-it.w/2,-it.h/2,it.w,it.h);fctx.strokeStyle="#1d4ed8";fctx.lineWidth=2/s;fctx.strokeRect(-it.w/2,-it.h/2,it.w,it.h);}else if(it.type==="emergency_exit"||it.type==="main_entrance"){fctx.fillStyle="#16a34a";fctx.fillRect(-it.w/2,-it.h/2,it.w,it.h);}else if(it.type==="extinguisher"||it.type==="fire_alarm"){fctx.beginPath();fctx.arc(0,0,Math.max(it.w,it.h)/2,0,6.3);fctx.fillStyle="#dc2626";fctx.fill();}else if(it.type==="stairs"){fctx.fillStyle="#cbd5e1";fctx.strokeStyle="#334155";fctx.lineWidth=1.2/s;fctx.fillRect(-it.w/2,-it.h/2,it.w,it.h);fctx.strokeRect(-it.w/2,-it.h/2,it.w,it.h);}fctx.restore();});',
      '    fctx.beginPath();loc.map(T).forEach(function(p,i){i?fctx.lineTo(p[0],p[1]):fctx.moveTo(p[0],p[1]);});fctx.closePath();fctx.strokeStyle="#0f172a";fctx.lineWidth=3;fctx.stroke();',
      '  }',
      '  function rTabs(){tabs.innerHTML=ks.map(function(k){return"<button data-fl=\\""+k+"\\" class=\\""+(k===curFl?"on":"")+"\\">"+(lang==="ar"?"طابق ":"F")+k+"</button>";}).join("");[].forEach.call(tabs.querySelectorAll("button"),function(b){b.onclick=function(){curFl=b.dataset.fl;rTabs();drawFl();};});}',
      '  rTabs();setTimeout(drawFl,40);',
      '}',
      'function tryGps(){',
      '  var msg=document.getElementById("gpsMsg");',
      '  if(!window.isSecureContext||!navigator.geolocation||DATA.meta.originLat==null){msg.textContent=tr("gpsNo");return;}',
      '  msg.textContent=tr("gpsWait");',
      '  navigator.geolocation.getCurrentPosition(function(pos){',
      '    var x=(pos.coords.longitude-DATA.meta.originLon)*111320*Math.cos(DATA.meta.originLat*D),y=(pos.coords.latitude-DATA.meta.originLat)*110540;',
      '    if(Math.hypot(x,y)>250){msg.textContent=tr("gpsOut");return;}',
      '    userPos={x:x,y:y};msg.textContent="";document.getElementById("locModal").classList.remove("open");updateUI();draw();',
      '  },function(){msg.textContent=tr("gpsOut");},{enableHighAccuracy:true,timeout:5000});',
      '}',
      'function resize(){var r=cv.parentNode.getBoundingClientRect();W=Math.max(1,r.width);H=Math.max(1,r.height);dpr=Math.min(window.devicePixelRatio||1,2);cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);draw();}',
      'function posOf(e){var r=cv.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}',
      'cv.addEventListener("pointerdown",function(e){cv.setPointerCapture(e.pointerId);var p=posOf(e);ptrs[e.pointerId]=p;if(Object.keys(ptrs).length===2){var ks=Object.keys(ptrs),a=ptrs[ks[0]],b=ptrs[ks[1]];drag={m:"pinch",d:Math.hypot(a.x-b.x,a.y-b.y)||1,s:view.s,w:s2w((a.x+b.x)/2,(a.y+b.y)/2)};return;}drag={m:"pan",x:p.x,y:p.y,ox:view.ox,oy:view.oy,moved:false};});',
      'cv.addEventListener("pointermove",function(e){var p=posOf(e);if(ptrs[e.pointerId])ptrs[e.pointerId]=p;if(!drag)return;if(drag.m==="pan"){if(Math.hypot(p.x-drag.x,p.y-drag.y)>5)drag.moved=true;view.ox=drag.ox+p.x-drag.x;view.oy=drag.oy+p.y-drag.y;draw();}else if(drag.m==="pinch"&&Object.keys(ptrs).length>=2){var ks=Object.keys(ptrs),a=ptrs[ks[0]],b=ptrs[ks[1]],d=Math.hypot(a.x-b.x,a.y-b.y)||1,mx=(a.x+b.x)/2,my=(a.y+b.y)/2;view.s=Math.max(.5,Math.min(40,drag.s*d/drag.d));var rq=rotPt(drag.w);view.ox=mx-rq.x*view.s;view.oy=my+rq.y*view.s;draw();}});',
      'function up(e){var p=posOf(e);delete ptrs[e.pointerId];if(drag&&drag.m==="pan"&&!drag.moved){var w=s2w(p.x,p.y),hit=null;for(var i=DATA.features.length-1;i>=0;i--){var f=DATA.features[i];if(["fence","road","yard"].indexOf(f.category)>=0)continue;if(f.geometryType==="point"){var pt=f.coordsMetric[0]||f.center;if(Math.hypot(w.x-pt.x,w.y-pt.y)<6){hit=f;break;}}else if(inP(w.x,w.y,featPts(f))){hit=f;break;}}selFeat=hit;renderInfo();}if(!Object.keys(ptrs).length)drag=null;}',
      'cv.addEventListener("pointerup",up);cv.addEventListener("pointercancel",up);',
      'cv.addEventListener("wheel",function(e){e.preventDefault();var p=posOf(e),w=s2w(p.x,p.y);view.s=Math.max(.5,Math.min(40,view.s*(e.deltaY<0?1.12:.89)));var rq=rotPt(w);view.ox=p.x-rq.x*view.s;view.oy=p.y+rq.y*view.s;draw();},{passive:false});',
      'document.getElementById("btnTheme").onclick=function(){theme=theme==="dark"?"print":"dark";updateUI();};',
      'document.getElementById("btnLang").onclick=function(){lang=lang==="ar"?"en":"ar";updateUI();};',
      'document.getElementById("bFire").onclick=function(){alertMode="fire";if(!userPos)document.getElementById("locModal").classList.add("open");updateUI();};',
      'document.getElementById("bShel").onclick=function(){alertMode="shelling";if(!userPos)document.getElementById("locModal").classList.add("open");updateUI();};',
      'document.getElementById("bLoc").onclick=function(){document.getElementById("gpsMsg").textContent="";document.getElementById("locModal").classList.add("open");};',
      'document.getElementById("bSnd").onclick=function(){if(sirenOn)stopSiren();else startSiren();};',
      'document.getElementById("btnClearAlert").onclick=function(){alertMode="none";stopSiren();updateUI();};',
      'document.getElementById("btnGps").onclick=tryGps;',
      'document.getElementById("btnLocClose").onclick=function(){document.getElementById("locModal").classList.remove("open");};',
      'document.getElementById("btnFlClose").onclick=function(){document.getElementById("flModal").classList.remove("open");};',
      'document.getElementById("zIn").onclick=function(){view.s=Math.min(40,view.s*1.25);draw();};',
      'document.getElementById("zOut").onclick=function(){view.s=Math.max(.5,view.s*.8);draw();};',
      'document.getElementById("zFit").onclick=function(){fit();draw();};',
      'window.addEventListener("resize",resize);',
      'var qs=new URLSearchParams(location.search),qLoc=qs.get("loc")||' + JSON.stringify(overrideLoc || '') + ',qAlert=qs.get("alert")||CFG.defaultAlert||"none";',
      'if(qAlert==="fire"||qAlert==="shelling")alertMode=qAlert;',
      'if(qLoc){var pin=(DATA.signagePins||[]).find(function(p){return p.locCode===qLoc||p.id===qLoc;});if(pin&&pin.scope!=="interior")userPos={x:pin.x,y:pin.y};else{var ff=DATA.features.find(function(f){return f.id===qLoc;});if(ff){var fp=ff.geometryType==="point"?(ff.coordsMetric[0]||ff.center):ff.center;userPos={x:fp.x,y:fp.y};}}}',
      'resize();fit();updateUI();if(alertMode!=="none"&&!userPos)document.getElementById("locModal").classList.add("open");loop();',
      '})();',
      '<' + '/script>',
      '</body>',
      '</html>'
    ];
    return html.join('\n');
  }

  // =========================================================================
  // MIKROTIK ROUTEROS DEPLOYMENT HELPER (READY FOR IT HANDOFF)
  // =========================================================================
  function buildMikrotikGuide() {
    var cfg = ensureCfg();
    var dir = (cfg.hotspotDir || 'flash/hotspot').replace(/\/+$/, '');
    var ip = cfg.mikrotikIp || '192.168.88.1';
    var ssid = cfg.hotspotSsid || 'SOS-MAP';

    var redirectFire = [
      '<!-- Save as: ' + dir + '/alert-fire.html -->',
      '<!DOCTYPE html><html><head><meta charset="utf-8">',
      '<meta http-equiv="refresh" content="0;url=http://' + ip + '/village.html?alert=fire">',
      '</head><body><a href="http://' + ip + '/village.html?alert=fire">OPEN FIRE EVACUATION MAP</a></body></html>'
    ].join('\n');

    var rosScript = [
      '# ===================================================================',
      '# MikroTik RouterOS Emergency Captive Portal Helper (For IT Review)',
      '# Prerequisites: Verify Hotspot directory (flash/hotspot vs hotspot)',
      '# and active Hotspot server profile name before running.',
      '# 1) Upload village.html into /' + dir + '/village.html via WinBox Files.',
      '# 2) Keep normal login.html backed up as login-normal.html.',
      '# 3) NOTE: Captive Portal is a visual guide ONLY — it does NOT wake',
      '#    locked phones silently; always pair with audible sirens/whistles.',
      '# ===================================================================',
      '',
      '# --- Create Fire Alert Trigger Script (SSID: ' + ssid + ') ---',
      '/system script add name="sos_alert_fire" source={',
      '  /log warning "SOS EMERGENCY: FIRE EVACUATION PORTAL ACTIVATED";',
      '  # Disconnect active hotspot sessions so devices re-trigger Captive Portal',
      '  /ip hotspot active remove [find];',
      '}',
      '',
      '# --- Create Clear / Return to Normal Script ---',
      '/system script add name="sos_alert_clear" source={',
      '  /log info "SOS EMERGENCY: ALERT CLEARED";',
      '  /ip hotspot active remove [find];',
      '}',
      '',
      '# Direct offline URLs for QR posters & staff bookmarks:',
      '# Fire:     http://' + ip + '/village.html?alert=fire',
      '# Shelling: http://' + ip + '/village.html?alert=shelling',
      '# Normal:   http://' + ip + '/village.html?loc=ZONE_CODE'
    ].join('\n');

    return { redirectFire: redirectFire, rosScript: rosScript };
  }

  // =========================================================================
  // EXPORT STUDIO UI
  // =========================================================================
  function downloadHtml() {
    var html = generateStandaloneHtml(null, null);
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'village.html';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  function previewHtml(alertOverride) {
    var html = generateStandaloneHtml(alertOverride || null, null);
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  function renderBody() {
    var cfg = ensureCfg(), body = ov.querySelector('#exBody');
    ov.querySelector('#exTabExp').className = activeTab === 'export' ? 'on' : '';
    ov.querySelector('#exTabMt').className = activeTab === 'mikrotik' ? 'cy' : '';

    if (activeTab === 'mikrotik') {
      var mt = buildMikrotikGuide();
      body.innerHTML =
        '<div class="exgrid">' +
          '<div class="excard">' +
            '<h4>MikroTik Network Parameters (IT Handoff)</h4>' +
            '<label>Router Local IP / Domain<input type="text" id="mtIp" value="' + esc(cfg.mikrotikIp) + '"></label>' +
            '<label>Hotspot Directory (flash/hotspot or hotspot)<input type="text" id="mtDir" value="' + esc(cfg.hotspotDir) + '"></label>' +
            '<label>Wi-Fi SSID Name<input type="text" id="mtSsid" value="' + esc(cfg.hotspotSsid) + '"></label>' +
            '<p class="mut">Confirm available Flash storage (&lt;400 KB target) and RouterOS v6/v7 Hotspot profile with IT before deploying.</p>' +
          '</div>' +
          '<div class="excard">' +
            '<h4>Captive Portal Redirect Stub (HTML)</h4>' +
            '<textarea class="excode" id="mtStub" readonly>' + esc(mt.redirectFire) + '</textarea>' +
            '<div class="row"><button id="cpStub" class="cy">Copy HTML Stub</button></div>' +
          '</div>' +
        '</div>' +
        '<div class="excard">' +
          '<h4>RouterOS Trigger Scripts &amp; Direct Offline URLs</h4>' +
          '<textarea class="excode" id="mtRos" style="min-height:210px" readonly>' + esc(mt.rosScript) + '</textarea>' +
          '<div class="row"><button id="cpRos" class="on">Copy RouterOS Commands</button></div>' +
        '</div>';

      body.querySelector('#mtIp').onchange = function () { cfg.mikrotikIp = this.value.trim() || '192.168.88.1'; St.emit('change'); renderBody(); };
      body.querySelector('#mtDir').onchange = function () { cfg.hotspotDir = this.value.trim() || 'flash/hotspot'; St.emit('change'); renderBody(); };
      body.querySelector('#mtSsid').onchange = function () { cfg.hotspotSsid = this.value.trim() || 'SOS-MAP'; St.emit('change'); renderBody(); };
      body.querySelector('#cpStub').onclick = function () { navigator.clipboard && navigator.clipboard.writeText(mt.redirectFire); this.textContent = 'Copied!'; };
      body.querySelector('#cpRos').onclick = function () { navigator.clipboard && navigator.clipboard.writeText(mt.rosScript); this.textContent = 'Copied!'; };
      return;
    }

    var htmlStr = generateStandaloneHtml(null, null);
    var kb = (new Blob([htmlStr]).size / 1024);
    var okSize = kb <= 400;
    var fOpts = '<option value="">-- Select feature --</option>' + (St.project.features || []).map(function (f) {
      return '<option value="' + esc(f.id) + '">' + esc((f.en_name || f.id) + (f.ar_name ? (' / ' + f.ar_name) : '')) + '</option>';
    }).join('');
    var rFire = (St.project.routes && St.project.routes.fire && St.project.routes.fire.nodes) ? St.project.routes.fire.nodes.length : 0;
    var rShel = (St.project.routes && St.project.routes.shelling && St.project.routes.shelling.nodes) ? St.project.routes.shelling.nodes.length : 0;
    var nInt = Object.keys(St.project.interiors || {}).length;

    var qHtml = cfg.quickZones.map(function (z, i) {
      return '<div class="excard">' +
        '<h4>Quick Button #' + (i + 1) + '</h4>' +
        '<label>Linked Map Feature<select data-qz="f" data-i="' + i + '">' + fOpts.replace('value="' + esc(z.featureId) + '"', 'value="' + esc(z.featureId) + '" selected') + '</select></label>' +
        '<label>Arabic Label<input type="text" dir="rtl" data-qz="ar" data-i="' + i + '" value="' + esc(z.ar) + '"></label>' +
        '<label>English Label<input type="text" data-qz="en" data-i="' + i + '" value="' + esc(z.en) + '"></label>' +
      '</div>';
    }).join('');

    body.innerHTML =
      '<div class="exstat ' + (okSize ? 'ok' : 'warn') + '">' +
        '<b>Estimated village.html size: ' + kb.toFixed(1) + ' KB</b>' +
        '<span>| ' + (okSize ? 'MikroTik Flash Safe (&lt;400 KB)' : 'Warning: Exceeds 400 KB — remove large custom icons') + '</span>' +
        '<span>| Features: ' + (St.project.features || []).length + ' | Floors: ' + nInt + ' | Fire Nodes: ' + rFire + ' | Shelling Nodes: ' + rShel + '</span>' +
      '</div>' +
      '<div class="exgrid">' +
        '<div class="excard">' +
          '<h4>General &amp; Display Defaults</h4>' +
          '<label>Arabic Header Title<input type="text" id="exAr" dir="rtl" value="' + esc(cfg.titleAr) + '"></label>' +
          '<label>English Header Title<input type="text" id="exEn" value="' + esc(cfg.titleEn) + '"></label>' +
          '<label>Default Language<select id="exLang"><option value="ar"' + (cfg.defaultLang === 'ar' ? ' selected' : '') + '>Arabic (Recommended for Village)</option><option value="en"' + (cfg.defaultLang === 'en' ? ' selected' : '') + '>English</option></select></label>' +
          '<label>Default Visual Theme<select id="exThm"><option value="print"' + (cfg.defaultTheme !== 'dark' ? ' selected' : '') + '>Daylight Print Architectural (Recommended)</option><option value="dark"' + (cfg.defaultTheme === 'dark' ? ' selected' : '') + '>Night / Dark Mode</option></select></label>' +
        '</div>' +
        '<div class="excard">' +
          '<h4>Emergency &amp; Contact Settings</h4>' +
          '<label>Default Startup Alert Mode<select id="exAl"><option value="none"' + (cfg.defaultAlert === 'none' ? ' selected' : '') + '>Normal Standby (User / URL triggers alert)</option><option value="fire"' + (cfg.defaultAlert === 'fire' ? ' selected' : '') + '>Auto-Open Fire Evacuation</option><option value="shelling"' + (cfg.defaultAlert === 'shelling' ? ' selected' : '') + '>Auto-Open Shelling Safe Haven</option></select></label>' +
          '<label>Security Desk / Guard Phone (Optional, Local Only)<input type="text" id="exPh" placeholder="Leave blank for OPSEC or enter internal ext." value="' + esc(cfg.emergencyPhone) + '"></label>' +
          '<div class="row"><button id="exAutoZ" class="cy">Auto-Fill 4 Quick Zones From Map</button></div>' +
          '<p class="mut">Exported file is 100% read-only, zero-CDN, and works completely offline on mobile phones.</p>' +
        '</div>' +
      '</div>' +
      '<div class="exgrid">' + qHtml + '</div>';

    body.querySelector('#exAr').onchange = function () { cfg.titleAr = this.value; St.emit('change'); };
    body.querySelector('#exEn').onchange = function () { cfg.titleEn = this.value; St.emit('change'); };
    body.querySelector('#exLang').onchange = function () { cfg.defaultLang = this.value; St.emit('change'); };
    body.querySelector('#exThm').onchange = function () { cfg.defaultTheme = this.value; St.emit('change'); };
    body.querySelector('#exAl').onchange = function () { cfg.defaultAlert = this.value; St.emit('change'); };
    body.querySelector('#exPh').onchange = function () { cfg.emergencyPhone = this.value.trim(); St.emit('change'); };
    body.querySelector('#exAutoZ').onclick = function () { cfg.quickZones = defaultZones(); St.emit('change'); renderBody(); };
    [].forEach.call(body.querySelectorAll('[data-qz]'), function (el) {
      el.onchange = function () {
        var i = +el.dataset.i, k = el.dataset.qz;
        if (k === 'f') {
          cfg.quickZones[i].featureId = el.value;
          var ff = (St.project.features || []).filter(function (x) { return x.id === el.value; })[0];
          if (ff) { if (ff.ar_name) cfg.quickZones[i].ar = ff.ar_name; if (ff.en_name) cfg.quickZones[i].en = ff.en_name; }
          St.emit('change'); renderBody();
        } else {
          cfg.quickZones[i][k] = el.value; St.emit('change');
        }
      };
    });
  }

  function build() {
    ensureCss();
    ov = h('div', 'ex hide');
    ov.innerHTML =
      '<div class="exwin">' +
        '<div class="extop">' +
          '<b class="ext">EXPORT VILLAGE FIELD EDITION</b>' +
          '<button id="exTabExp" class="on">1. Export village.html</button>' +
          '<button id="exTabMt">2. MikroTik IT Helper</button>' +
          '<span class="sp"></span>' +
          '<button id="exClose" class="dng">Close</button>' +
        '</div>' +
        '<div id="exBody" class="exbody"></div>' +
        '<div class="exfoot">' +
          '<button id="exPrevNorm" class="cy">Preview Live (Normal)</button>' +
          '<button id="exPrevFire" class="on">Preview Fire Alert</button>' +
          '<button id="exPrevShel" class="cy">Preview Shelling Alert</button>' +
          '<span class="sp"></span>' +
          '<button id="exDownload" class="on" style="font-weight:bold;padding:8px 14px">Download Standalone village.html</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.querySelector('#exTabExp').onclick = function () { activeTab = 'export'; renderBody(); };
    ov.querySelector('#exTabMt').onclick = function () { activeTab = 'mikrotik'; renderBody(); };
    ov.querySelector('#exClose').onclick = close;
    ov.querySelector('#exPrevNorm').onclick = function () { previewHtml('none'); };
    ov.querySelector('#exPrevFire').onclick = function () { previewHtml('fire'); };
    ov.querySelector('#exPrevShel').onclick = function () { previewHtml('shelling'); };
    ov.querySelector('#exDownload').onclick = downloadHtml;
    built = true;
  }

  function open() {
    if (!(St.project.features || []).length) {
      alert('Import your KML or load your .sos.json project before exporting Village Edition.');
      return;
    }
    ensureCfg();
    if (!built) build();
    isOpen = true; activeTab = 'export'; ov.classList.remove('hide');
    renderBody();
  }
  function close() { isOpen = false; ov.classList.add('hide'); }

  S.Exporter = { open: open, close: close, isOpen: function () { return isOpen; }, generateHtml: generateStandaloneHtml };
})(window.SOS);
