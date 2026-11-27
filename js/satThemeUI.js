window.SOS = window.SOS || {};
(function (S) {
  'use strict';

  var MONO = "'JetBrains Mono','Fira Code',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
  var LANG_LS_KEY = 'aj_sat_lang_prefs_v1';

  // =========================================================================
  // 1. INDEPENDENT BILINGUAL PREFERENCES (DEFAULT = ENGLISH)
  // =========================================================================
  function normalizeLangPrefs(raw) {
    var r = (raw && typeof raw === 'object') ? raw : {};
    return {
      menus:  r.menus  === 'ar' ? 'ar' : 'en',
      guide:  r.guide  === 'ar' ? 'ar' : 'en',
      panels: r.panels === 'ar' ? 'ar' : 'en'
    };
  }

  function loadLangPrefs() {
    try {
      var s = localStorage.getItem(LANG_LS_KEY);
      if (s) return normalizeLangPrefs(JSON.parse(s));
    } catch (e) {}
    return { menus: 'en', guide: 'en', panels: 'en' };
  }

  function saveLangPrefs(prefs) {
    var clean = normalizeLangPrefs(prefs);
    try { localStorage.setItem(LANG_LS_KEY, JSON.stringify(clean)); } catch (e) {}
    return clean;
  }

  function langBadgeText(prefs) {
    var p = normalizeLangPrefs(prefs);
    if (p.menus === p.guide && p.guide === p.panels) return p.menus === 'ar' ? '🌐 AR' : '🌐 EN';
    return '🌐 MIX';
  }

  // =========================================================================
  // 2. UNIFIED PANEL & UI DICTIONARY (EN / AR)
  // =========================================================================
  var PANEL_I18N = {
    // 4 Unified Dock Tabs
    tab_map:         { en: 'Map & Layers',               ar: 'الخريطة والطبقات' },
    tab_draw:        { en: 'Draw & GeoTerra',            ar: 'الرسم وGeoTerra' },
    tab_edit:        { en: 'Edit & Photo',               ar: 'التعديل والصور' },
    tab_export:      { en: 'Export & CAD',               ar: 'التصدير والإعدادات' },

    // Import / Map Section
    sec_imports:     { en: 'Project & Imports',          ar: 'استيراد الخريطة والملفات' },
    btn_imp_base:    { en: '🛰 Base Satellite',          ar: '🛰 خريطة الأساس' },
    btn_imp_gt:      { en: '⬆ GeoTerra (.json/.zip)',    ar: '⬆ جلسة GeoTerra' },
    btn_imp_gis:     { en: '🗺 GIS (GeoJSON/KML)',       ar: '🗺 استيراد GIS' },
    btn_imp_clean:   { en: '🧹 Pre-Cleaned Layer',       ar: '🧹 طبقة تنظيف' },
    btn_fit_view:    { en: '⊡ Fit Map',                  ar: '⊡ ملاءمة الشاشة' },
    btn_zoom_100:    { en: '1:1 Native',                 ar: '1:1 أصلي' },
    sec_layers:      { en: 'Layers (Visibility)',        ar: 'الطبقات (إظهار / إخفاء)' },
    sec_scale:       { en: 'Scale Bar & True North',     ar: 'مقياس الرسم والشمال الحقيقي' },
    lbl_scale:       { en: 'Scale:',                     ar: 'المقياس:' },
    lbl_line:        { en: 'Line:',                      ar: 'الخط:' },
    lbl_known_m:     { en: 'Known (m)',                  ar: 'الطول الحقيقي (م)' },
    lbl_north_deg:   { en: 'North (°)',                  ar: 'زاوية الشمال (°)' },
    btn_pick_scale:  { en: 'Pick 2-Pt Scale',            ar: 'تحديد نقطتي مقياس' },
    btn_apply_scale: { en: 'Apply Scale',                ar: 'تطبيق المقياس' },
    btn_cal_north:   { en: 'Calibrate North',            ar: 'معايرة الشمال' },
    btn_clear_scale: { en: 'Clear Scale',                ar: 'مسح المقياس' },

    // Draw & GeoTerra Section
    sec_gt_survey:   { en: 'GeoTerra Field Survey',      ar: 'المسح الميداني GeoTerra' },
    sec_arcgis_tools:{ en: 'ArcGIS Vector & Analysis',   ar: 'أدوات الرسم والتحليل ArcGIS' },
    lbl_category:    { en: 'Category',                   ar: 'الفئة' },
    lbl_snapping:    { en: 'Snapping (Vertex/Mid/Edge)', ar: 'الالتقاط المغناطيسي' },
    btn_cogo:        { en: 'COGO Dist+Brg',              ar: 'طول + زاوية COGO' },
    btn_attr_tbl:    { en: 'Attribute Table',            ar: 'جدول الصفات' },
    btn_merge_poly:  { en: 'Merge Polygons',             ar: 'دمج مضلعين' },
    btn_clip_poly:   { en: 'Clip Overlap',               ar: 'اقتطاع تقاطع' },
    btn_range_rings: { en: 'Range Rings',                ar: 'دوائر المدى' },
    btn_heatmap:     { en: 'Heatmap',                    ar: 'خريطة حرارية' },
    btn_nearest:     { en: 'Nearest Exit',               ar: 'أقرب مخرج' },
    btn_spatial_q:   { en: 'Spatial Query',              ar: 'استعلام مكاني' },

    // Edit & Photo Section
    sec_photo_tools: { en: 'Map & Object Photo Tools',   ar: 'أدوات قص وتعديل الصور' },
    sec_proc_tools:  { en: 'Add Ready Sat Objects',      ar: 'إضافة معالم فضائية جاهزة' },
    photo_tools_h:   { en: 'Brush, Clone & Magic Wand',  ar: 'إعدادات الفرشاة والختم والعصا' },
    lbl_color:       { en: 'Color',                      ar: 'اللون' },
    lbl_wand_tol:    { en: 'Wand Tol',                   ar: 'تسامح العصا' },
    lbl_contig:      { en: 'Contiguous Wand',            ar: 'عصا متصلة فقط' },
    lbl_radius:      { en: 'Radius',                     ar: 'نصف القطر' },
    lbl_feather:     { en: 'Feather',                    ar: 'النعومة' },
    btn_pick_src:    { en: 'Pick Clone Src',             ar: 'التقاط مصدر' },
    btn_add_png:     { en: '+ PNG Asset',                ar: '+ إضافة صورة' },
    lbl_auto_heal:   { en: 'Auto-Heal Ground on Lift',   ar: 'تنظيف الأرضية تلقائياً عند الرفع' },
    edge_feather:    { en: 'Cut Edge Feather',           ar: 'نعومة حواف القص' },
    sec_assets:      { en: '03_Movable_Assets & Inspector', ar: 'العناصر المرفوعة والمفتش' },
    sec_sun:         { en: 'Global Sun Shadow',          ar: 'ظل الشمس الموحّد' },
    lbl_az:          { en: 'Az',                         ar: 'الاتجاه' },
    lbl_len:         { en: 'Len',                        ar: 'الطول' },
    lbl_op:          { en: 'Op',                         ar: 'الشفافية' },
    lbl_blur:        { en: 'Blur',                       ar: 'الضبابية' },

    // Export & Settings Section
    sec_export:      { en: 'Export Maps & Poster',       ar: 'تصدير الخريطة والبوستر' },
    lbl_tit_en:      { en: 'Poster Title EN',            ar: 'عنوان البوستر (إنجليزي)' },
    lbl_tit_ar:      { en: 'Poster Title AR',            ar: 'عنوان البوستر (عربي)' },
    lbl_paper:       { en: 'Paper',                      ar: 'حجم الورق' },
    lbl_dpi:         { en: 'DPI',                        ar: 'الدقة DPI' },
    btn_exp_clean:   { en: '1. Clean 2D PNG',            ar: '1. خريطة نظيفة PNG' },
    btn_exp_poster:  { en: '2. Poster PNG',              ar: '2. بوستر طباعة PNG' },
    btn_exp_geo:     { en: 'GeoJSON',                    ar: 'GeoJSON' },
    btn_exp_kml:     { en: 'Google Earth KML',           ar: 'Google Earth KML' },
    btn_exp_pgw:     { en: 'ArcGIS .pgw/.prj',           ar: 'ربط ArcGIS .pgw' },
    btn_exp_gtzip:   { en: 'GeoTerra AI ZIP',            ar: 'حزمة GeoTerra ZIP' },
    sec_cad3d:       { en: '2D CAD & 3D Engine Bridge',  ar: 'الربط مع 2D CAD ومحرك 3D' },
    btn_push_cad:    { en: 'Push ➔ 2D CAD',              ar: 'إرسال ➔ 2D CAD' },
    btn_open_3d:     { en: 'Open in 3D GPU',             ar: 'فتح في محرك 3D' },
    btn_sync_north:  { en: 'Sync CAD North',             ar: 'مزامنة الشمال مع CAD' },
    sec_studio_ops:  { en: 'View, Language & Maintenance', ar: 'العرض واللغة والصيانة' },
    btn_lang_cfg:    { en: '🌐 Language Settings',       ar: '🌐 إعدادات اللغة' },
    btn_tog_grid:    { en: 'Grid / Graticule',           ar: 'الشبكة الإحداثية' },
    btn_tog_scale:   { en: 'Scale Bar',                  ar: 'مقياس الرسم' },
    btn_tog_hist:    { en: 'History Log',                ar: 'سجل التعديلات' },
    btn_clr_patch:   { en: 'Clear Patches',              ar: 'مسح الترقيع' },
    btn_clr_erase:   { en: 'Clear Erases',               ar: 'مسح الممحاة' },
    btn_clr_sat:     { en: '🗑 Clear All Sat Studio',    ar: '🗑 تفريغ الاستوديو' },

    // Bottom Tabs & Clean Mode
    btn_show_panels: { en: 'Show UI',                    ar: 'إظهار الواجهة' },
    btn_drop_gps:    { en: '🛰 Drop GPS',                ar: '🛰 نقطة GPS' },
    btn_undo:        { en: '↩ Undo',                     ar: '↩ تراجع' },
    tab_attr:        { en: 'ArcGIS Table',               ar: 'جدول ArcGIS' },
    tab_gcp:         { en: 'GCP Georef',                 ar: 'جدول GCP' },
    tab_hist:        { en: 'History',                    ar: 'السجل' }
  };

  function applyPanelLang(rootEl, panelLang) {
    if (!rootEl) return;
    var l = panelLang === 'ar' ? 'ar' : 'en';
    [].forEach.call(rootEl.querySelectorAll('[data-i18n]'), function (el) {
      var entry = PANEL_I18N[el.dataset.i18n];
      if (entry) el.textContent = entry[l] || entry.en;
    });
    var dir = l === 'ar' ? 'rtl' : 'ltr';
    var dockBody = rootEl.querySelector('.satc-dock-body');
    var botEl = rootEl.querySelector('.satc-bottom');
    if (dockBody) dockBody.dir = dir;
    if (botEl) botEl.dir = dir;
  }

  // =========================================================================
  // 3. INLINE SVG ICONS (100% OFFLINE)
  // =========================================================================
  var ICONS = {
    select:       '<svg viewBox="0 0 24 24"><path d="M5 3l14 9-6.5 1.5L10 20 5 3z"/></svg>',
    pan:          '<svg viewBox="0 0 24 24"><path d="M12 2v20M2 12h20M12 2l-3 3m3-3l3 3M12 22l-3-3m3 3l3-3M2 12l3-3m-3 3l3 3M22 12l-3-3m3 3l-3 3"/></svg>',
    crop_asset:   '<svg viewBox="0 0 24 24"><path d="M6 2v14a2 2 0 002 2h14M18 22V8a2 2 0 00-2-2H2"/></svg>',
    lasso_erase:  '<svg viewBox="0 0 24 24"><path d="M4 11c0-4.5 4-7 9-7s7 2.5 7 6-3 6-7 6c-2.5 0-4.5-.8-6-2M7 17l-2 4m2-4l4 1"/></svg>',
    wand:         '<svg viewBox="0 0 24 24"><path d="M15 4l5 5L8 21l-5-5L15 4zM12 7l5 5M5 3v3M3.5 4.5h3M19 14v3M17.5 15.5h3"/></svg>',
    crop_base:    '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" stroke-dasharray="3 2"/><path d="M2 7h5V2M22 17h-5v5"/></svg>',
    cutout:       '<svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.5 15.5M8.5 8.5L20 20"/></svg>',
    clone:        '<svg viewBox="0 0 24 24"><path d="M12 3a3 3 0 013 3c0 2-2 3-2 5h-2c0-2-2-3-2-5a3 3 0 013-3zM5 14h14v3H5zM4 20h16"/></svg>',
    erase:        '<svg viewBox="0 0 24 24"><path d="M16 3l5 5-11 11H5l-2-2 13-14zM11 8l5 5M3 21h18"/></svg>',
    brush:        '<svg viewBox="0 0 24 24"><path d="M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4 9.5-9.5zM5 18c-1.5 0-2 1.2-2 2.5 1.8.8 4.2.5 5.5-1 .8-.9.8-2.2 0-3-.8-.8-2.1-.8-3.5 1.5z"/></svg>',
    eyedropper:   '<svg viewBox="0 0 24 24"><path d="M19 3l2 2-3.5 3.5 1.5 1.5-1.5 1.5-1.5-1.5-7 7H5v-4l7-7-1.5-1.5L12 3l1.5 1.5L17 1l2 2z"/></svg>',
    futsal_rect:  '<svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="1"/><path d="M12 5v14M2 9h3v6H2M22 9h-3v6h3"/><circle cx="12" cy="12" r="2.5"/></svg>',
    building_add: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16"/><path d="M4 12h16M12 4v16M8 8h1M15 8h1M8 16h1M15 16h1"/></svg>',
    tent_add:     '<svg viewBox="0 0 24 24"><path d="M3 19L12 4l9 15H3zM12 4v15M8 19l4-7 4 7"/></svg>',
    tree_add:     '<svg viewBox="0 0 24 24"><circle cx="12" cy="9" r="5"/><circle cx="8" cy="12" r="3.5"/><circle cx="16" cy="12" r="3.5"/><path d="M12 15v6"/></svg>',
    gis_point:    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/></svg>',
    gis_line:     '<svg viewBox="0 0 24 24"><path d="M4 18l5-10 6 7 5-11"/><circle cx="4" cy="18" r="2"/><circle cx="9" cy="8" r="2"/><circle cx="15" cy="15" r="2"/><circle cx="20" cy="4" r="2"/></svg>',
    poly_draw:    '<svg viewBox="0 0 24 24"><path d="M5 6l9-3 6 7-4 10-10-2L5 6z"/><circle cx="5" cy="6" r="1.8"/><circle cx="14" cy="3" r="1.8"/><circle cx="20" cy="10" r="1.8"/><circle cx="16" cy="20" r="1.8"/><circle cx="6" cy="18" r="1.8"/></svg>',
    gis_circle:   '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1.5"/><path d="M12 12l6-4"/></svg>',
    gis_split:    '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16"/><path d="M3 21L21 3" stroke-dasharray="3 2"/></svg>',
    gis_buffer:   '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-dasharray="3 2"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="2"/></svg>',
    gis_viewshed: '<svg viewBox="0 0 24 24"><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.5"/></svg>',
    pin:          '<svg viewBox="0 0 24 24"><path d="M12 22s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    calibrate:    '<svg viewBox="0 0 24 24"><path d="M3 15l12-12 6 6-12 12H3v-6zM12 6l2 2M9 9l2 2M6 12l2 2"/></svg>',
    bearing_cal:  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><polygon points="12,6 15,13 12,11.5 9,13"/></svg>',
    measure:      '<svg viewBox="0 0 24 24"><path d="M3 12h18M3 8v8M21 8v8M8 10v4M12 9v6M16 10v4"/></svg>',
    gt_boundary:  '<svg viewBox="0 0 24 24"><path d="M3 7l6-4 12 4-3 13-13-1L3 7z"/><path d="M9 3v16M15 5v15M4 12h16" stroke-dasharray="2 2"/></svg>',
    gt_georef:    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/><circle cx="12" cy="12" r="2.5"/></svg>',
    gt_gps_drop:  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="7" stroke-dasharray="3 2"/></svg>',
    gt_survey:    '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>'
  };

  // =========================================================================
  // 4. TOOL DOCS & SHORT TOUCH LABELS (EN / AR)
  // =========================================================================
  var TOOL_DOCS = {
    select:       { key: 'V', cat: 'nav',      shortEn: 'Select',     shortAr: 'تحديد',     en: { name: 'Select & Quick Edit', desc: 'Tap any feature, polygon, or asset to edit, move, reshape vertices, change type, or lift from base.', steps: ['Tap any polygon, pin, or asset on the map.', 'Use the floating Quick Menu right beside it.'] }, ar: { name: 'تحديد وتعديل سريع', desc: 'انقر على أي معلم أو مضلع أو عنصر لفتح قائمة التعديل والتحريك والزوايا والرفع من الأساس.', steps: ['انقر داخل أي معلم أو مضلع على الخريطة.', 'استخدم القائمة السريعة العائمة بجانبه مباشرة.'] } },
    pan:          { key: 'H', cat: 'nav',      shortEn: 'Pan Map',    shortAr: 'تحريك',     en: { name: 'Pan Canvas', desc: 'Move across the map freely without selecting or adding points.', steps: ['Drag with 1 finger to pan, pinch with 2 fingers to zoom.'] }, ar: { name: 'تحريك الخريطة', desc: 'تحريك مساحة العرض بحرية بدون إضافة نقاط بالخطأ.', steps: ['اسحب بإصبع للتنقل وإصبعين للتكبير والتصغير.'] } },
    cutout:       { key: 'X', cat: 'photo',    shortEn: 'Lift A➔B',   shortAr: 'قص ورفع',   en: { name: 'Lift & Edit from Base (A➔B)', desc: 'Trace any tent/object on Base Satellite to lift it as a movable asset and auto-heal the ground underneath.', steps: ['Tap 3+ corners around the object.', 'Tap ✓ Save on the top bar to lift & auto-heal ground.'] }, ar: { name: 'قص ورفع من الأساس (A➔B)', desc: 'تحديد أي خيمة أو معلم من صورة الأساس لرفعه وتدويره وتنظيف التربة تحته تلقائياً.', steps: ['انقر 3 زوايا أو أكثر حول المعلم.', 'اضغط ✓ حفظ في الشريط العلوي لرفعه وتنظيف خلفيته.'] } },
    clone:        { key: 'S', cat: 'photo',    shortEn: 'Clone',      shortAr: 'ختم ترقيع', en: { name: 'Clone Stamp', desc: 'Copy clean soil texture onto 02_Ground_Cleanup.', steps: ['Tap Pick Clone Src then tap clean soil.', 'Drag over the target area to blend seamlessly.'] }, ar: { name: 'ختم الترقيع', desc: 'نسخ نسيج التربة النظيفة لتغطية أي عائق بدمج ناعم.', steps: ['اضغط التقاط مصدر ثم انقر على تربة نظيفة.', 'اسحب فوق المنطقة المطلوب إخفاؤها.'] } },
    erase:        { key: 'E', cat: 'photo',    shortEn: 'Eraser',     shortAr: 'ممحاة',     en: { name: 'Soft Eraser', desc: 'Erase from 02_Ground_Cleanup to restore original Base Satellite.', steps: ['Drag over patched areas to reveal the original satellite map.'] }, ar: { name: 'الممحاة الناعمة', desc: 'مسح التعديلات من طبقة التنظيف لإرجاع الصورة الأصلية.', steps: ['اسحب فوق المنطقة المراد إرجاعها للأصل.'] } },
    brush:        { key: 'B', cat: 'photo',    shortEn: 'Brush',      shortAr: 'فرشاة',     en: { name: 'Soil Brush', desc: 'Paint soft matching ground color onto Cleanup layer.', steps: ['Pick color via Eyedropper or palette, then paint softly.'] }, ar: { name: 'فرشاة التربة', desc: 'رسم لون تربة ناعم لتوحيد الإضاءة والتمويه.', steps: ['التقط اللون بالقطّارة ثم ارسم فوق الأرضية.'] } },
    eyedropper:   { key: 'I', cat: 'photo',    shortEn: 'Pick Color', shortAr: 'قطّارة',    en: { name: 'Color Eyedropper', desc: 'Sample exact ground RGB tone from Base Satellite.', steps: ['Tap any pixel on the map to sample its color.'] }, ar: { name: 'قطّارة الألوان', desc: 'التقاط درجة اللون الحقيقية من الخريطة.', steps: ['انقر على أي نقطة تربة لالتقاط لونها.'] } },
    crop_asset:   { key: 'C', cat: 'photo',    shortEn: 'Crop Asset', shortAr: 'قص صورة',   en: { name: 'Crop Selected Asset', desc: 'Keep only the polygon you trace inside the selected asset.', steps: ['Select an asset, trace 3+ points, tap ✓ Apply on top bar.'] }, ar: { name: 'قص العنصر المحدد', desc: 'إبقاء الجزء المحدد فقط داخل الصورة المضافة.', steps: ['حدد العنصر، انقر 3 نقاط أو أكثر، ثم اضغط ✓ تنفيذ بالأعلى.'] } },
    lasso_erase:  { key: 'L', cat: 'photo',    shortEn: 'Lasso Del',  shortAr: 'مسح لاسو',  en: { name: 'Lasso Erase', desc: 'Erase a polygon region inside the selected asset.', steps: ['Select an asset, trace unwanted part, tap ✓ Apply on top bar.'] }, ar: { name: 'مسح لاسو', desc: 'حذف جزء محدد داخل الصورة المضافة بحواف ناعمة.', steps: ['حدد العنصر، ارسم حول الجزء الزائد، ثم اضغط ✓ تنفيذ.'] } },
    wand:         { key: 'W', cat: 'photo',    shortEn: 'Magic Wand', shortAr: 'عصا سحرية', en: { name: 'Magic Wand', desc: 'Remove uniform background color from selected asset with 1 tap.', steps: ['Select an asset then tap its background color.'] }, ar: { name: 'العصا السحرية', desc: 'إزالة لون الخلفية من الصورة المضافة بنقرة واحدة.', steps: ['حدد الصورة ثم انقر على لون الخلفية لإزالته.'] } },
    crop_base:    { key: '',  cat: 'photo',    shortEn: 'Crop Base',  shortAr: 'قص الأساس', en: { name: 'Crop Base Map', desc: 'Drag a rectangle to trim Base Satellite and shift all layers.', steps: ['Drag rectangle over the area to keep and release.'] }, ar: { name: 'قص خريطة الأساس', desc: 'قص صورة القمر الصناعي لحدود منطقة العمل فقط.', steps: ['اسحب مستطيلاً حول حدود الموقع وأفلت.'] } },
    futsal_rect:  { key: '',  cat: 'proc',     shortEn: 'Futsal',     shortAr: 'ملعب خماسي',en: { name: 'Futsal + Red Net', desc: 'Drag along pitch length to insert sandy pitch with red net & shadow.', steps: ['Drag from one side of pitch to the opposite side.'] }, ar: { name: 'ملعب خماسي', desc: 'رسم ملعب ترابي مع سياج وشبك أحمر وظل موحّد.', steps: ['اسحب من زاوية الملعب للزاوية المقابلة.'] } },
    building_add: { key: '',  cat: 'proc',     shortEn: '+ Building', shortAr: '+ مبنى',    en: { name: 'Add Building', desc: 'Tap map to drop top-down building roof with shadow.', steps: ['Tap target location on map.'] }, ar: { name: 'إضافة مبنى', desc: 'إدراج سطح مبنى علوي 90° مع ظل مطابق.', steps: ['انقر على موقع المبنى على الخريطة.'] } },
    tent_add:     { key: '',  cat: 'proc',     shortEn: '+ Tent',     shortAr: '+ خيمة',    en: { name: 'Add Tent', desc: 'Tap map to drop top-down field tent with shadow.', steps: ['Tap target location on map.'] }, ar: { name: 'إضافة خيمة', desc: 'إدراج خيمة ميدانية علوية مع ظل.', steps: ['انقر على موقع الخيمة على الخريطة.'] } },
    tree_add:     { key: '',  cat: 'proc',     shortEn: '+ Tree',     shortAr: '+ شجرة',    en: { name: 'Add Tree', desc: 'Tap map to drop organic tree canopy with shadow.', steps: ['Tap target location on map.'] }, ar: { name: 'إضافة شجرة', desc: 'إدراج شجرة طبيعية علوية مع ظل.', steps: ['انقر على موقع الشجرة على الخريطة.'] } },
    gis_point:    { key: '',  cat: 'gis',      shortEn: 'GIS Point',  shortAr: 'نقطة GIS',  en: { name: 'ArcGIS Point', desc: 'Place vector point feature with coordinates & attributes.', steps: ['Tap anywhere on map to drop point.'] }, ar: { name: 'نقطة GIS', desc: 'إضافة نقطة متجهية بإحداثيات وجدول صفات.', steps: ['انقر على الموقع المطلوب على الخريطة.'] } },
    gis_line:     { key: '',  cat: 'gis',      shortEn: 'Line/Route', shortAr: 'خط/مسار',   en: { name: 'ArcGIS Polyline', desc: 'Draw roads, fences, or evacuation routes with live length.', steps: ['Tap 2+ points, then tap ✓ Finish on top bar.'] }, ar: { name: 'خط ومسار', desc: 'رسم طرق أو مسارات إخلاء بحساب الطول بالمتر.', steps: ['انقر نقطتين أو أكثر ثم اضغط ✓ حفظ في الأعلى.'] } },
    poly_draw:    { key: 'P', cat: 'gis',      shortEn: 'Polygon',    shortAr: 'مضلع GIS',  en: { name: 'ArcGIS Polygon', desc: 'Draw vector polygon with live area & perimeter.', steps: ['Tap 3+ corners, then tap ✓ Finish on top bar.'] }, ar: { name: 'مضلع GIS', desc: 'رسم مضلع مساحي بحساب المساحة والمحيط.', steps: ['انقر 3 زوايا أو أكثر ثم اضغط ✓ حفظ في الأعلى.'] } },
    gis_circle:   { key: '',  cat: 'gis',      shortEn: 'Circle',     shortAr: 'دائرة',     en: { name: 'Metric Circle', desc: 'Drag from center outward to draw metric circle.', steps: ['Touch center and drag to desired radius.'] }, ar: { name: 'دائرة مترية', desc: 'رسم دائرة بنصف قطر متري.', steps: ['انقر المركز واسحب للخارج.'] } },
    gis_split:    { key: '',  cat: 'gis',      shortEn: 'Split Poly', shortAr: 'تقسيم مضلع',en: { name: 'Split Polygon', desc: 'Slice selected GIS polygon into 2 with a cut line.', steps: ['Select a GIS polygon, draw cut line across it, tap ✓ Finish.'] }, ar: { name: 'تقسيم مضلع', desc: 'قص مضلع GIS محدد إلى مضلعين.', steps: ['حدد المضلع ثم ارسم خطاً قاطعاً واضغط ✓ حفظ.'] } },
    gis_buffer:   { key: '',  cat: 'gis',      shortEn: 'Buffer',     shortAr: 'نطاق حماية',en: { name: 'Buffer Zones', desc: 'Generate metric safety/hazard buffer rings.', steps: ['Tap a feature or location and enter distances (m).'] }, ar: { name: 'نطاق حماية', desc: 'توليد حلقات حماية أو خطر بالمتر.', steps: ['انقر الموقع وأدخل المسافات بالأمتار.'] } },
    gis_viewshed: { key: '',  cat: 'gis',      shortEn: 'Viewshed',   shortAr: 'خط الرؤية', en: { name: '2D Viewshed', desc: 'Analyze line-of-sight coverage around drawn buildings.', steps: ['Tap camera/guard location and enter radius.'] }, ar: { name: 'تحليل خط الرؤية', desc: 'فحص التغطية البصرية حول المباني.', steps: ['انقر موقع الكاميرا أو الحارس وأدخل المدى.'] } },
    pin:          { key: '',  cat: 'gis',      shortEn: 'Poster Pin', shortAr: 'دبوس بوستر',en: { name: 'Poster Pin (1..N)', desc: 'Drop numbered bilingual pins for print poster legend.', steps: ['Tap map to place pin; tap it in Select mode to rename.'] }, ar: { name: 'دبوس بوستر', desc: 'وضع دبابيس مرقمة لمفتاح الطباعة.', steps: ['انقر لوضع دبوس وعدّله من القائمة السريعة.'] } },
    calibrate:    { key: '',  cat: 'gis',      shortEn: 'Scale 2-Pt', shortAr: 'معايرة متر',en: { name: '2-Point Scale', desc: 'Calibrate px/m using a known distance on the image.', steps: ['Tap 2 points on a known length, then tap Apply Scale.'] }, ar: { name: 'معايرة المقياس', desc: 'ربط البكسل بالمتر الحقيقي عبر نقطتين.', steps: ['انقر نقطتين على طول معروف ثم اضغط تطبيق المقياس.'] } },
    bearing_cal:  { key: '',  cat: 'gis',      shortEn: 'True North', shortAr: 'معايرة شمال',en: { name: 'Calibrate North', desc: 'Draw a line pointing True North.', steps: ['Tap start point then tap a point directly North.'] }, ar: { name: 'معايرة الشمال', desc: 'رسم خط يشير للشمال الحقيقي.', steps: ['انقر البداية ثم نقطة باتجاه الشمال.'] } },
    measure:      { key: 'M', cat: 'gis',      shortEn: 'Measure',    shortAr: 'قياس',      en: { name: 'Measure', desc: 'Measure distance (px/m) and bearing between 2 points.', steps: ['Tap 2 points on map to read live length & azimuth.'] }, ar: { name: 'القياس المساحي', desc: 'قياس المسافة والزاوية بين نقطتين.', steps: ['انقر نقطتين لقراءة الطول والاتجاه.'] } },
    gt_boundary:  { key: '',  cat: 'geoterra', shortEn: 'Boundary',   shortAr: 'حدود القرية',en: { name: 'Village Boundary & Grid', desc: 'Trace village corners to generate sectors A1..F4.', steps: ['Tap village corners around perimeter.', 'Tap ✓ Close Grid on top bar when finished.'] }, ar: { name: 'حدود القرية والقطاعات', desc: 'رسم حدود القرية لتوليد قطاعات A1..F4 تلقائياً.', steps: ['انقر حول زوايا القرية.', 'اضغط ✓ إغلاق الحدود في الشريط العلوي.'] } },
    gt_survey:    { key: '',  cat: 'geoterra', shortEn: 'Add Feature',shortAr: 'إضافة معلم', en: { name: 'GeoTerra Feature (REM/REP/MOD/ADD)', desc: 'Draw polygon or drop pin, then choose ADD / MOD / REP / REM and attach photos.', steps: ['Polygon mode: tap 3+ corners then tap ✓ Save on top bar.', 'Pin mode: 1 tap opens the Save Feature modal immediately.'] }, ar: { name: 'إضافة معلم GeoTerra', desc: 'رسم مضلع أو وضع دبوس ثم اختيار (إضافة/تعديل/استبدال/إزالة) وإرفاق الصور.', steps: ['وضع المضلع: انقر 3 زوايا أو أكثر ثم اضغط ✓ حفظ بالأعلى.', 'وضع الدبوس: نقرة واحدة تفتح نافذة الحفظ فوراً.'] } },
    gt_georef:    { key: '',  cat: 'geoterra', shortEn: 'GCP Georef', shortAr: 'ربط GCP',   en: { name: 'GCP Georeference', desc: 'Click map corners and enter Lat/Lon, UTM, or averaged GPS.', steps: ['Tap a known corner on the map to add a GCP.'] }, ar: { name: 'الربط الجغرافي GCP', desc: 'ربط زوايا الخريطة بإحداثيات حقيقية أو GPS.', steps: ['انقر على زاوية واضحة لإضافة نقطة GCP.'] } },
    gt_gps_drop:  { key: '',  cat: 'geoterra', shortEn: 'GPS Drop',   shortAr: 'نقطة GPS',  en: { name: 'Drop Live GPS', desc: 'Drop a point at your live filtered GPS location.', steps: ['Ensure ≥2 GCPs are set, then tap to drop your live GPS point.'] }, ar: { name: 'إسقاط GPS حي', desc: 'إسقاط نقطة في موقعك الفعلي على الخريطة.', steps: ['تأكد من وجود نقطتي GCP ثم اضغط لإسقاط النقطة.'] } }
  };

  // =========================================================================
  // 5. COMPLETE UNIFIED CYBER HUD + DAYLIGHT CSS (SINGLE DOCK + DRAW BAR)
  // =========================================================================
  function ensureCss() {
    if (document.getElementById('aj-sat-uni-css')) return;
    var old = document.getElementById('aj-sat-pro-css');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var st = document.createElement('style');
    st.id = 'aj-sat-uni-css';
    st.textContent =
      '.satc-pro{' +
        '--sc-bg:#080b10;--sc-panel:#0c121b;--sc-panel2:#101926;--sc-input:#06090e;' +
        '--sc-border:#15222e;--sc-border-hi:#1f3b52;--sc-green:#39ff14;--sc-green2:#00ff66;' +
        '--sc-cyan:#00e5ff;--sc-amber:#e8c84a;--sc-red:#ff3c3c;--sc-purple:#c084fc;' +
        '--sc-txt:#d9ecff;--sc-sub:#78b5a0;--sc-mut:#7c97b0;--sc-shadow:0 8px 28px rgba(0,0,0,.68);' +
        'position:fixed;inset:0;width:100%;max-width:100vw;height:100%;height:100dvh;z-index:945;' +
        'background:var(--sc-bg);color:var(--sc-txt);display:flex;flex-direction:column;' +
        'font-family:' + MONO + ';font-size:11.5px;overflow:hidden;' +
      '}' +
      'body.ui-day .satc-pro{' +
        '--sc-bg:#e5ecf3;--sc-panel:#f8fafc;--sc-panel2:#eef3f8;--sc-input:#ffffff;' +
        '--sc-border:#cbd5e1;--sc-border-hi:#64748b;--sc-green:#15803d;--sc-green2:#16a34a;' +
        '--sc-cyan:#0369a1;--sc-amber:#b45309;--sc-red:#dc2626;--sc-purple:#7e22ce;' +
        '--sc-txt:#0f172a;--sc-sub:#0f766e;--sc-mut:#475569;--sc-shadow:0 8px 24px rgba(15,23,42,.18);' +
      '}' +
      '.satc-pro.hide{display:none!important}' +
      '.satc-pro *{box-sizing:border-box}' +

      // Compact Single Top Bar
      '.satc-pro .satc-topbar{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:5px 7px;background:var(--sc-panel);border-bottom:1px solid var(--sc-border);flex-shrink:0;z-index:40;user-select:none}' +
      '.satc-pro .satc-brand{font-weight:800;font-size:11.5px;letter-spacing:.6px;white-space:nowrap;padding-inline-end:8px;border-inline-end:1px solid var(--sc-border);color:var(--sc-green2)}' +
      'body.ui-day .satc-pro .satc-brand{color:#0369a1}' +
      '.satc-pro .satc-tgrp{display:flex;align-items:center;gap:4px;flex-wrap:wrap}' +
      '.satc-pro .satc-tgrp.end{margin-inline-start:auto}' +

      // Buttons (Scoped cleanly so index.html rules never break them)
      '.satc-pro .satc-qbtn,.satc-pro button.satc-btn{background:var(--sc-input)!important;border:1px solid var(--sc-border-hi)!important;color:var(--sc-txt)!important;min-height:30px;padding:4px 8px;border-radius:5px;font-family:inherit;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;gap:4px;box-shadow:none!important}' +
      '.satc-pro .satc-qbtn:hover{border-color:var(--sc-cyan)!important;color:var(--sc-cyan)!important}' +
      '.satc-pro .satc-qbtn.on{border-color:var(--sc-green2)!important;color:var(--sc-green2)!important;background:rgba(0,255,102,.14)!important}' +
      'body.ui-day .satc-pro .satc-qbtn.on{background:#dcfce7!important}' +
      '.satc-pro .satc-qbtn.cy{border-color:var(--sc-cyan)!important;color:var(--sc-cyan)!important;background:rgba(0,229,255,.12)!important}' +
      'body.ui-day .satc-pro .satc-qbtn.cy{background:#e0f2fe!important}' +
      '.satc-pro .satc-qbtn.amb{border-color:var(--sc-amber)!important;color:var(--sc-amber)!important;background:rgba(232,200,74,.14)!important}' +
      'body.ui-day .satc-pro .satc-qbtn.amb{background:#fef3c7!important}' +
      '.satc-pro .satc-qbtn.pur{border-color:var(--sc-purple)!important;color:var(--sc-purple)!important;background:rgba(192,132,252,.14)!important}' +
      '.satc-pro .satc-qbtn.dng{border-color:var(--sc-red)!important;color:var(--sc-red)!important;background:rgba(255,60,60,.12)!important}' +
      '.satc-pro .satc-qbtn:disabled{opacity:.42;cursor:not-allowed}' +

      // Workspace Main Container
      '.satc-pro .satc-work{flex:1 1 auto;display:flex;min-height:0;position:relative;overflow:hidden}' +
      '.satc-pro .satc-center{flex:1 1 auto;display:flex;flex-direction:column;min-width:0;min-height:0;height:100%;position:relative;overflow:hidden}' +
      '.satc-pro .satc-cvwrap{flex:1 1 auto;position:relative;min-width:0;min-height:0;height:100%;overflow:hidden;background:var(--sc-input)}' +
      '#scCv{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}' +

      // Floating Active Draw Bar (ALWAYS visible over canvas when drawing!)
      '.satc-pro .satc-drawbar{position:absolute;top:38px;left:50%;transform:translateX(-50%);z-index:34;display:none;align-items:center;flex-wrap:wrap;justify-content:center;gap:5px;max-width:calc(100% - 16px);padding:6px 8px;border-radius:9px;background:rgba(8,14,24,.95);border:1.5px solid var(--sc-green);box-shadow:0 8px 26px rgba(0,0,0,.72);backdrop-filter:blur(4px)}' +
      'body.ui-day .satc-pro .satc-drawbar{background:rgba(255,255,255,.97);border-color:#15803d;box-shadow:0 6px 20px rgba(15,23,42,.22)}' +
      '.satc-pro .satc-drawbar.show{display:flex}' +
      '.satc-pro .satc-drawbar-lbl{font-size:11px;font-weight:800;color:var(--sc-cyan);padding:0 4px;white-space:nowrap}' +

      // Floating Quick Action Menu (Beside Selected Entity)
      '.satc-pro .satc-qpop{position:absolute;z-index:32;display:none;flex-direction:column;gap:4px;min-width:220px;max-width:calc(100% - 14px);background:rgba(8,14,24,.96);border:1.5px solid var(--sc-cyan);border-radius:9px;padding:7px;box-shadow:0 8px 26px rgba(0,0,0,.72);backdrop-filter:blur(4px);user-select:none}' +
      'body.ui-day .satc-pro .satc-qpop{background:rgba(255,255,255,.98);border-color:#0369a1;box-shadow:0 8px 22px rgba(15,23,42,.24)}' +
      '.satc-pro .satc-qpop.show{display:flex}' +
      '.satc-pro .satc-qpop-hd{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:10.5px;font-weight:800;color:var(--sc-green2);border-bottom:1px solid var(--sc-border);padding-bottom:4px}' +
      '.satc-pro .satc-qpop-hd span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px}' +
      '.satc-pro .satc-qpop-row{display:flex;flex-wrap:wrap;gap:4px}' +
      '.satc-pro .satc-qpop-btn{flex:1 1 auto;min-height:30px;padding:4px 7px;border-radius:5px;border:1px solid var(--sc-border-hi)!important;background:var(--sc-input)!important;color:var(--sc-txt)!important;font-family:inherit;font-size:10.5px;font-weight:700;cursor:pointer;white-space:nowrap;box-shadow:none!important}' +
      '.satc-pro .satc-qpop-btn.on{border-color:var(--sc-green2)!important;color:var(--sc-green2)!important;background:rgba(0,255,102,.15)!important}' +
      '.satc-pro .satc-qpop-btn.cy{border-color:var(--sc-cyan)!important;color:var(--sc-cyan)!important;background:rgba(0,229,255,.15)!important}' +
      '.satc-pro .satc-qpop-btn.amb{border-color:var(--sc-amber)!important;color:var(--sc-amber)!important;background:rgba(232,200,74,.16)!important}' +
      '.satc-pro .satc-qpop-btn.pur{border-color:var(--sc-purple)!important;color:var(--sc-purple)!important;background:rgba(192,132,252,.16)!important}' +
      '.satc-pro .satc-qpop-btn.dng{border-color:var(--sc-red)!important;color:var(--sc-red)!important;background:rgba(255,60,60,.15)!important}' +

      // SINGLE UNIFIED 4-TAB DOCK (Right Panel on Desktop, Bottom Sheet on Mobile)
      '.satc-pro .satc-dock{width:348px;height:100%;max-height:100%;background:var(--sc-panel);border-inline-start:1px solid var(--sc-border-hi);display:flex;flex-direction:column;flex-shrink:0;z-index:36;overflow:hidden;box-shadow:var(--sc-shadow)}' +
      '.satc-pro .satc-dock.collapsed{display:none!important}' +
      '.satc-pro .satc-dock-hd{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:6px 8px;background:var(--sc-panel2);border-bottom:1px solid var(--sc-border);flex-shrink:0}' +
      '.satc-pro .satc-dock-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:3px;padding:5px 6px;background:var(--sc-input);border-bottom:1px solid var(--sc-border);flex-shrink:0}' +
      '.satc-pro .satc-dtab{min-height:34px;padding:4px 3px;border-radius:5px;border:1px solid var(--sc-border)!important;background:var(--sc-panel)!important;color:var(--sc-mut)!important;font-family:inherit;font-size:10px;font-weight:700;cursor:pointer;text-align:center;line-height:1.2;box-shadow:none!important}' +
      '.satc-pro .satc-dtab.on{border-color:var(--sc-cyan)!important;color:var(--sc-cyan)!important;background:rgba(0,229,255,.14)!important}' +
      'body.ui-day .satc-pro .satc-dtab.on{background:#e0f2fe!important}' +
      '.satc-pro .satc-dock-body{flex:1 1 auto;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:8px;display:flex;flex-direction:column;gap:8px}' +
      '.satc-pro .satc-pane{display:none;flex-direction:column;gap:8px}' +
      '.satc-pro .satc-pane.on{display:flex}' +

      // Labeled Touch Tool Grid Inside Dock
      '.satc-pro .satc-tgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}' +
      '.satc-pro .satc-tgrid.cols2{grid-template-columns:repeat(2,1fr)}' +
      '.satc-pro .satc-tchip{min-height:42px;padding:5px 4px;border-radius:6px;border:1px solid var(--sc-border-hi)!important;background:var(--sc-input)!important;color:var(--sc-txt)!important;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-family:inherit;font-size:10px;font-weight:700;text-align:center;line-height:1.15;box-shadow:none!important}' +
      '.satc-pro .satc-tchip svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}' +
      '.satc-pro .satc-tchip.on{border-color:var(--sc-green)!important;color:var(--sc-green)!important;background:rgba(57,255,20,.14)!important}' +
      '.satc-pro .satc-tchip.cat-geoterra.on{border-color:var(--sc-purple)!important;color:var(--sc-purple)!important;background:rgba(192,132,252,.18)!important}' +
      '.satc-pro .satc-tchip.cat-gis.on{border-color:var(--sc-cyan)!important;color:var(--sc-cyan)!important;background:rgba(0,229,255,.16)!important}' +
      'body.ui-day .satc-pro .satc-tchip.on{background:#dcfce7!important}' +

      // Cards, Inputs, Layers & Lists
      '.satc-pro .satc-sec-h{margin:3px 0 1px;font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:var(--sc-sub);border-bottom:1px solid var(--sc-border);padding-bottom:3px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}' +
      '.satc-pro .satc-card{background:var(--sc-input);border:1px solid var(--sc-border);border-radius:6px;padding:8px;display:flex;flex-direction:column;gap:6px;font-size:11px;flex-shrink:0}' +
      '.satc-pro .satc-card button{min-height:30px;padding:4px 7px;border-radius:5px;border:1px solid var(--sc-border-hi)!important;background:var(--sc-panel2)!important;color:var(--sc-txt)!important;font-family:inherit;font-size:10.5px;font-weight:700;cursor:pointer;box-shadow:none!important}' +
      '.satc-pro .satc-card button.on{border-color:var(--sc-green2)!important;color:var(--sc-green2)!important;background:rgba(0,255,102,.13)!important}' +
      '.satc-pro .satc-card button.cy{border-color:var(--sc-cyan)!important;color:var(--sc-cyan)!important;background:rgba(0,229,255,.12)!important}' +
      '.satc-pro .satc-card button.amb{border-color:var(--sc-amber)!important;color:var(--sc-amber)!important;background:rgba(232,200,74,.13)!important}' +
      '.satc-pro .satc-card button.dng{border-color:var(--sc-red)!important;color:var(--sc-red)!important;background:rgba(255,60,60,.12)!important}' +
      '.satc-pro .satc-card .row{display:flex;gap:4px;flex-wrap:wrap}' +
      '.satc-pro .satc-card .row button{flex:1 1 auto}' +
      '.satc-pro .satc-card label{display:flex;flex-direction:column;gap:3px;font-size:10.5px;color:var(--sc-txt)}' +
      '.satc-pro .satc-card label.ck{flex-direction:row;align-items:center;gap:6px;cursor:pointer}' +
      '.satc-pro .satc-card input[type=text],.satc-pro .satc-card input[type=number],.satc-pro .satc-card select{width:100%;padding:5px 7px;border-radius:4px;border:1px solid var(--sc-border-hi);background:var(--sc-panel);color:var(--sc-txt);font-family:inherit;font-size:11px}' +
      '.satc-pro .satc-card input[type=range]{width:100%;margin:0}' +
      '.satc-pro .satc-guide{background:var(--sc-panel2);border:1px solid var(--sc-border-hi);border-radius:6px;padding:7px 8px;display:flex;flex-direction:column;gap:4px}' +
      '.satc-pro .satc-guide-hd{display:flex;align-items:center;justify-content:space-between;gap:6px}' +
      '.satc-pro .satc-guide-hd b{color:var(--sc-cyan);font-size:11px}' +
      '.satc-pro .satc-guide-desc{color:var(--sc-txt);font-size:10.5px;line-height:1.4}' +
      '.satc-pro .satc-guide-steps{margin:2px 0 0;padding-inline-start:16px;color:var(--sc-mut);font-size:10px;line-height:1.45}' +
      '.satc-pro .satc-layer{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:5px 7px;border:1px solid var(--sc-border);border-radius:5px;background:var(--sc-input);font-size:11px;flex-shrink:0}' +
      '.satc-pro .satc-layer.off{opacity:.52}' +
      '.satc-pro .satc-eye{background:transparent!important;border:1px solid var(--sc-border-hi)!important;color:var(--sc-green2)!important;width:28px;height:26px;border-radius:4px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:12px;padding:0;flex-shrink:0;box-shadow:none!important}' +
      '.satc-pro .satc-layer.off .satc-eye{color:var(--sc-mut)!important;border-color:var(--sc-border)!important}' +
      '.satc-pro .satc-tag{font-size:9px;padding:2px 5px;border-radius:3px;border:1px solid var(--sc-border-hi);color:var(--sc-mut);white-space:nowrap}' +
      '.satc-pro .satc-tag.lk{border-color:var(--sc-amber);color:var(--sc-amber)}' +
      '.satc-pro .satc-tag.ok{border-color:var(--sc-green2);color:var(--sc-green2)}' +
      '.satc-pro .satc-tag.gis{border-color:var(--sc-cyan);color:var(--sc-cyan)}' +
      '.satc-pro .satc-tag.gt{border-color:var(--sc-purple);color:var(--sc-purple)}' +
      '.satc-pro .satc-grid2{display:grid;grid-template-columns:1fr 1fr;gap:5px}' +
      '.satc-pro .satc-alist{display:flex;flex-direction:column;gap:4px;max-height:190px;overflow-y:auto;overscroll-behavior:contain}' +
      '.satc-pro .satc-ait{display:flex;align-items:center;justify-content:space-between;gap:5px;padding:5px 6px;border:1px solid var(--sc-border);border-radius:4px;background:var(--sc-panel);cursor:pointer;font-size:11px}' +
      '.satc-pro .satc-ait.sel{border-color:var(--sc-green2);background:rgba(0,255,102,.1)}' +
      '.satc-pro .satc-ait span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}' +
      '.satc-pro .mut{color:var(--sc-mut);font-size:10.5px}' +

      // Before/After Swipe Handle
      '.satc-pro .satc-swipe{position:absolute;top:0;bottom:0;left:50%;width:3px;background:var(--sc-green);z-index:20;display:none;cursor:ew-resize;box-shadow:0 0 10px rgba(57,255,20,.6)}' +
      '.satc-pro .satc-swipe.on{display:block}' +
      '.satc-pro .satc-swipe-knob{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:30px;height:30px;border-radius:50%;background:var(--sc-panel);border:2px solid var(--sc-green);color:var(--sc-green);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;user-select:none}' +

      // Bottom Data Table Drawer (Attribute Table / GCP / History)
      '.satc-pro .satc-bottom{height:0;overflow:hidden;background:var(--sc-panel);border-top:1px solid var(--sc-border);display:flex;flex-direction:column;transition:height .16s ease;flex-shrink:0;z-index:30}' +
      '.satc-pro .satc-bottom.open{height:220px}' +
      '.satc-pro .satc-btabs{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:4px 8px;background:var(--sc-panel2);border-bottom:1px solid var(--sc-border);flex-shrink:0}' +
      '.satc-pro .satc-btab{background:transparent!important;border:1px solid transparent!important;color:var(--sc-mut)!important;padding:4px 9px;border-radius:4px;font-family:inherit;font-size:10.5px;cursor:pointer;box-shadow:none!important}' +
      '.satc-pro .satc-btab.on{background:var(--sc-input)!important;border-color:var(--sc-cyan)!important;color:var(--sc-cyan)!important;font-weight:700}' +
      '.satc-pro .satc-bbody{flex:1;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:6px 8px}' +
      '.satc-pro .satc-tbl{width:100%;border-collapse:collapse;font-size:10.5px}' +
      '.satc-pro .satc-tbl th,.satc-pro .satc-tbl td{border:1px solid var(--sc-border);padding:4px 6px;text-align:start;white-space:nowrap}' +
      '.satc-pro .satc-tbl th{background:var(--sc-panel2);color:var(--sc-cyan);position:sticky;top:0;z-index:2}' +
      '.satc-pro .satc-tbl tr:hover td{background:rgba(0,229,255,.08);cursor:pointer}' +
      '.satc-pro .satc-tbl tr.sel td{background:rgba(57,255,20,.14)}' +

      // Footer Status Bar
      '.satc-pro .satc-foot{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:4px 8px;background:var(--sc-panel);border-top:1px solid var(--sc-border);font-size:10px;flex-shrink:0}' +
      '#scStatus{flex:1 1 160px;min-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--sc-cyan)}' +
      '.satc-pro .satc-fchip{padding:2px 6px;border-radius:4px;border:1px solid var(--sc-border);background:var(--sc-input);color:var(--sc-txt);white-space:nowrap;cursor:pointer}' +
      '#scIdb{color:var(--sc-green2);white-space:nowrap}' +

      // Clean Field Mode
      '.satc-pro.clean-mode .satc-topbar,.satc-pro.clean-mode .satc-dock,.satc-pro.clean-mode .satc-bottom{display:none!important}' +
      '.satc-pro .satc-cleanbar{display:none;position:absolute;top:10px;right:10px;z-index:35;background:rgba(8,11,16,.92);border:1px solid var(--sc-cyan);border-radius:8px;padding:5px 7px;gap:5px;flex-wrap:wrap;align-items:center;box-shadow:var(--sc-shadow)}' +
      'body.ui-day .satc-pro .satc-cleanbar{background:rgba(248,250,252,.95)}' +
      '.satc-pro.clean-mode .satc-cleanbar{display:flex}' +

      // Language Settings Modal
      '.satc-lmod-bg{position:fixed;inset:0;z-index:2050;background:rgba(2,6,15,.84);display:none;align-items:center;justify-content:center;padding:12px;font-family:' + MONO + '}' +
      '.satc-lmod-bg.open{display:flex}' +
      '.satc-lmod{width:100%;max-width:420px;background:#0c121b;color:#d9ecff;border:1.5px solid #00e5ff;border-radius:9px;padding:14px;box-shadow:0 12px 32px rgba(0,0,0,.75);display:flex;flex-direction:column;gap:10px;font-size:11.5px}' +
      'body.ui-day .satc-lmod{background:#f8fafc;color:#0f172a;border-color:#0369a1}' +
      '.satc-lmod h3{margin:0;font-size:13px;color:#00e5ff;display:flex;justify-content:space-between;align-items:center}' +
      'body.ui-day .satc-lmod h3{color:#0369a1}' +
      '.satc-lrow{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 9px;background:#06090e;border:1px solid #15222e;border-radius:6px}' +
      'body.ui-day .satc-lrow{background:#ffffff;border-color:#cbd5e1}' +
      '.satc-lrow-lbl{display:flex;flex-direction:column;gap:2px}' +
      '.satc-lrow-lbl small{font-size:9.5px;opacity:.72}' +
      '.satc-lseg{display:inline-flex;gap:4px;flex-shrink:0}' +
      '.satc-lseg button,.satc-lpre button{min-height:30px;padding:5px 9px;border-radius:4px;border:1px solid #1f3b52!important;background:#0c121b!important;color:#d9ecff!important;font-family:inherit;font-size:11px;font-weight:700;cursor:pointer;box-shadow:none!important}' +
      'body.ui-day .satc-lseg button,body.ui-day .satc-lpre button{background:#eef3f8!important;color:#0f172a!important;border-color:#94a3b8!important}' +
      '.satc-lseg button.on{border-color:#00ff66!important;color:#00ff66!important;background:rgba(0,255,102,.15)!important}' +
      'body.ui-day .satc-lseg button.on{border-color:#15803d!important;color:#15803d!important;background:#dcfce7!important}' +
      '.satc-lpre{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px}' +

      // Mobile Bottom-Sheet Dock (<= 980px): Thumb-Friendly, Zero Overlapping Sidebars
      '@media(max-width:980px){' +
        '.satc-pro .satc-brand{display:none}' +
        '.satc-pro .satc-topbar{gap:4px;padding:5px 6px}' +
        '.satc-pro .satc-tgrp{width:100%;justify-content:space-between}' +
        '.satc-pro .satc-tgrp .satc-qbtn{flex:1 1 auto;padding:5px 4px;font-size:10.5px}' +
        '.satc-pro .satc-dock{position:absolute;left:0;right:0;bottom:0;top:auto;width:100%;height:64dvh;max-height:76dvh;border-inline-start:0;border-top:2px solid var(--sc-cyan);border-radius:14px 14px 0 0;z-index:45}' +
        '.satc-pro .satc-bottom.open{height:44dvh}' +
        '.satc-pro .satc-drawbar{top:34px;padding:5px 6px}' +
      '}';
    document.head.appendChild(st);
  }

  // =========================================================================
  // 6. LANGUAGE SETTINGS MODAL (SEPARATE MENUS / GUIDE / PANELS)
  // =========================================================================
  function openLangSettingsModal(currentPrefs, onChange) {
    ensureCss();
    var prefs = normalizeLangPrefs(currentPrefs);
    var bg = document.getElementById('scLangModal');
    if (!bg) {
      bg = document.createElement('div');
      bg.id = 'scLangModal';
      bg.className = 'satc-lmod-bg';
      bg.dataset.ajDone = '1';
      document.body.appendChild(bg);
    }

    function renderModal() {
      function row(key, titleEn, titleAr) {
        var cur = prefs[key];
        return '<div class="satc-lrow">' +
          '<div class="satc-lrow-lbl"><b>' + titleEn + '</b><small>' + titleAr + '</small></div>' +
          '<div class="satc-lseg">' +
            '<button type="button" data-lk="' + key + '" data-lv="en" class="' + (cur === 'en' ? 'on' : '') + '">EN</button>' +
            '<button type="button" data-lk="' + key + '" data-lv="ar" class="' + (cur === 'ar' ? 'on' : '') + '">عربي</button>' +
          '</div>' +
        '</div>';
      }

      bg.innerHTML =
        '<div class="satc-lmod" data-aj-done="1">' +
          '<h3><span>🌐 Language Settings / إعدادات اللغة</span><button type="button" id="scLmX" style="padding:2px 8px;cursor:pointer">✕</button></h3>' +
          '<div class="satc-lpre">' +
            '<button type="button" data-lpre="all_en">All English</button>' +
            '<button type="button" data-lpre="all_ar">الكل عربي</button>' +
            '<button type="button" data-lpre="hybrid">EN + شرح عربي</button>' +
          '</div>' +
          row('menus',  'Top Bar & Quick Menu',     'لغة الشريط العلوي والقائمة السريعة') +
          row('guide',  'Tool Guide & Labels',      'لغة تعليمات الأدوات') +
          row('panels', 'Unified Dock & Panels',    'لغة اللوحة الموحّدة والطبقات') +
          '<div style="display:flex;justify-content:flex-end">' +
            '<button type="button" id="scLmDone" class="satc-qbtn on" style="padding:6px 14px">Done / تم</button>' +
          '</div>' +
        '</div>';

      [].forEach.call(bg.querySelectorAll('[data-lk]'), function (btn) {
        btn.onclick = function () {
          prefs[btn.dataset.lk] = btn.dataset.lv;
          saveLangPrefs(prefs);
          renderModal();
          if (onChange) onChange(Object.assign({}, prefs));
        };
      });
      [].forEach.call(bg.querySelectorAll('[data-lpre]'), function (btn) {
        btn.onclick = function () {
          var p = btn.dataset.lpre;
          if (p === 'all_en') prefs = { menus: 'en', guide: 'en', panels: 'en' };
          else if (p === 'all_ar') prefs = { menus: 'ar', guide: 'ar', panels: 'ar' };
          else prefs = { menus: 'en', guide: 'ar', panels: 'en' };
          saveLangPrefs(prefs);
          renderModal();
          if (onChange) onChange(Object.assign({}, prefs));
        };
      });
      bg.querySelector('#scLmX').onclick = function () { bg.classList.remove('open'); };
      bg.querySelector('#scLmDone').onclick = function () { bg.classList.remove('open'); };
    }

    renderModal();
    bg.classList.add('open');
  }

  // =========================================================================
  // 7. COMPACT SINGLE TOP BAR (ONE PLACE FOR NAVIGATION + DOCK TOGGLE)
  // =========================================================================
  function buildUnifiedTopBar(container, opts) {
    var lang = (opts && opts.lang) === 'ar' ? 'ar' : 'en';
    var langPrefs = normalizeLangPrefs(opts && opts.langPrefs ? opts.langPrefs : { menus: lang, guide: lang, panels: lang });
    var onAction = (opts && opts.onAction) || function () {};

    container.innerHTML =
      '<span class="satc-brand">SAT STUDIO</span>' +
      '<div class="satc-tgrp">' +
        '<button type="button" class="satc-qbtn cy" id="scQDock">☰ Tools</button>' +
        '<button type="button" class="satc-qbtn" id="scQSel" data-qtool="select">↖ Select</button>' +
        '<button type="button" class="satc-qbtn" id="scQPan" data-qtool="pan">✋ Pan</button>' +
        '<button type="button" class="satc-qbtn pur" id="scQGtAdd">+ GeoTerra</button>' +
        '<button type="button" class="satc-qbtn" id="scQUndo" title="Undo">↩</button>' +
        '<button type="button" class="satc-qbtn" id="scQRedo" title="Redo">↪</button>' +
      '</div>' +
      '<div class="satc-tgrp end">' +
        '<button type="button" class="satc-qbtn" id="scQSwipe" title="Before/After Swipe">◧</button>' +
        '<button type="button" class="satc-qbtn" id="scQClean" title="Clean Field Mode">👁</button>' +
        '<button type="button" class="satc-qbtn" id="scQTheme" title="Cyber / Daylight">☀</button>' +
        '<button type="button" class="satc-qbtn" id="scQLang" title="Language Settings">' + langBadgeText(langPrefs) + '</button>' +
        '<button type="button" class="satc-qbtn on" id="scQClose">CAD</button>' +
      '</div>';

    function setLang(curLang, allPrefs) {
      lang = curLang === 'ar' ? 'ar' : 'en';
      if (allPrefs) langPrefs = normalizeLangPrefs(allPrefs);
      else langPrefs.menus = lang;
      var ar = lang === 'ar';
      container.querySelector('#scQDock').textContent  = ar ? '☰ الأدوات' : '☰ Tools';
      container.querySelector('#scQSel').textContent   = ar ? '↖ تحديد' : '↖ Select';
      container.querySelector('#scQPan').textContent   = ar ? '✋ تحريك' : '✋ Pan';
      container.querySelector('#scQGtAdd').textContent = ar ? '+ معلم GeoTerra' : '+ GeoTerra';
      container.querySelector('#scQLang').textContent  = langBadgeText(langPrefs);
    }

    function setActiveTool(tid) {
      container.querySelector('#scQSel').classList.toggle('on', tid === 'select');
      container.querySelector('#scQPan').classList.toggle('on', tid === 'pan');
      container.querySelector('#scQGtAdd').classList.toggle('on', tid === 'gt_survey');
    }

    container.querySelector('#scQDock').onclick  = function () { onAction('toggle_dock'); };
    container.querySelector('#scQSel').onclick   = function () { onAction('tool:select'); };
    container.querySelector('#scQPan').onclick   = function () { onAction('tool:pan'); };
    container.querySelector('#scQGtAdd').onclick = function () { onAction('quick_gt_add'); };
    container.querySelector('#scQUndo').onclick  = function () { onAction('undo'); };
    container.querySelector('#scQRedo').onclick  = function () { onAction('redo'); };
    container.querySelector('#scQSwipe').onclick = function () { onAction('toggle_swipe'); };
    container.querySelector('#scQClean').onclick = function () { onAction('toggle_clean'); };
    container.querySelector('#scQTheme').onclick = function () { onAction('toggle_theme'); };
    container.querySelector('#scQLang').onclick  = function () { onAction('open_lang_settings'); };
    container.querySelector('#scQClose').onclick = function () { onAction('back_to_cad'); };

    setLang(lang, langPrefs);
    return { setLang: setLang, setActiveTool: setActiveTool };
  }

  // =========================================================================
  // 8. LABELED TOOL GRID & LIVE TOOL GUIDE
  // =========================================================================
  function renderToolGrid(container, toolIds, opts) {
    if (!container) return;
    var activeTool = (opts && opts.activeTool) || 'select';
    var lang = (opts && opts.lang) === 'ar' ? 'ar' : 'en';
    var onSelectTool = (opts && opts.onSelectTool) || function () {};

    container.innerHTML = '';
    (toolIds || []).forEach(function (tid) {
      var doc = TOOL_DOCS[tid];
      if (!doc) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.sctool = tid;
      btn.className = 'satc-tchip cat-' + doc.cat + (tid === activeTool ? ' on' : '');
      var lbl = lang === 'ar' ? doc.shortAr : doc.shortEn;
      btn.innerHTML = (ICONS[tid] || ICONS.select) + '<span>' + lbl + '</span>';
      btn.onclick = function () { onSelectTool(tid); };
      container.appendChild(btn);
    });
  }

  function updateToolGuide(guideEl, toolId, lang) {
    if (!guideEl) return;
    var doc = TOOL_DOCS[toolId] || TOOL_DOCS.select;
    var l = lang === 'ar' ? 'ar' : 'en';
    var info = doc[l] || doc.en;
    var badge = doc.cat === 'geoterra' ? 'GEOTERRA' : doc.cat === 'gis' ? 'ArcGIS' : doc.cat === 'photo' ? 'PHOTO' : doc.cat === 'proc' ? 'ASSET' : 'NAV';
    var stepsHtml = (info.steps || []).map(function (s) { return '<li>' + s + '</li>'; }).join('');
    guideEl.dir = l === 'ar' ? 'rtl' : 'ltr';
    guideEl.innerHTML =
      '<div class="satc-guide-hd">' +
        '<b>' + info.name + '</b>' +
        '<span class="satc-tag ' + (doc.cat === 'geoterra' ? 'gt' : doc.cat === 'gis' ? 'gis' : 'ok') + '">' +
          badge + (doc.key ? (' · ' + doc.key) : '') +
        '</span>' +
      '</div>' +
      '<div class="satc-guide-desc">' + info.desc + '</div>' +
      '<ol class="satc-guide-steps">' + stepsHtml + '</ol>';
  }

  // =========================================================================
  // 9. SINGLE UNIFIED 4-TAB DOCK CONTROLLER (MOBILE BOTTOM SHEET / DESKTOP RIGHT)
  // =========================================================================
  function createUnifiedDockController(rootEl, opts) {
    var onResize = (opts && opts.onResize) || function () {};
    var onSwipeChange = (opts && opts.onSwipeChange) || function () {};

    var dockEl = rootEl.querySelector('.satc-dock');
    var bottomEl = rootEl.querySelector('.satc-bottom');
    var swipeEl = rootEl.querySelector('.satc-swipe');

    var state = {
      dockOpen: window.innerWidth > 980,
      activeTab: 'draw', // 'map' | 'draw' | 'edit' | 'export'
      bottomOpen: false,
      bottomTab: 'attr',
      cleanMode: false,
      swipeActive: false,
      swipeRatio: 0.5
    };

    function applyState() {
      if (dockEl) dockEl.classList.toggle('collapsed', !state.dockOpen);
      if (bottomEl) bottomEl.classList.toggle('open', state.bottomOpen);
      rootEl.classList.toggle('clean-mode', state.cleanMode);
      if (swipeEl) {
        swipeEl.classList.toggle('on', state.swipeActive);
        swipeEl.style.left = (state.swipeRatio * 100).toFixed(2) + '%';
      }
      [].forEach.call(rootEl.querySelectorAll('[data-dtab]'), function (b) {
        b.classList.toggle('on', b.dataset.dtab === state.activeTab);
      });
      [].forEach.call(rootEl.querySelectorAll('[data-dpane]'), function (p) {
        p.classList.toggle('on', p.dataset.dpane === state.activeTab);
      });
      var qDock = rootEl.querySelector('#scQDock');
      var qSwipe = rootEl.querySelector('#scQSwipe');
      var qClean = rootEl.querySelector('#scQClean');
      if (qDock) qDock.classList.toggle('on', state.dockOpen);
      if (qSwipe) qSwipe.classList.toggle('on', state.swipeActive);
      if (qClean) qClean.classList.toggle('amb', state.cleanMode);
      setTimeout(onResize, 35);
    }

    [].forEach.call(rootEl.querySelectorAll('[data-dtab]'), function (b) {
      b.onclick = function () {
        state.activeTab = b.dataset.dtab;
        state.dockOpen = true;
        applyState();
      };
    });
    var closeDockBtn = rootEl.querySelector('#scDockClose');
    if (closeDockBtn) closeDockBtn.onclick = function () { state.dockOpen = false; applyState(); };

    if (swipeEl) {
      var draggingSwipe = false;
      swipeEl.addEventListener('pointerdown', function (e) { draggingSwipe = true; swipeEl.setPointerCapture(e.pointerId); e.stopPropagation(); });
      swipeEl.addEventListener('pointermove', function (e) {
        if (!draggingSwipe) return;
        var parentR = swipeEl.parentNode.getBoundingClientRect();
        var ratio = (e.clientX - parentR.left) / Math.max(1, parentR.width);
        state.swipeRatio = Math.max(0.02, Math.min(0.98, ratio));
        swipeEl.style.left = (state.swipeRatio * 100).toFixed(2) + '%';
        onSwipeChange(state.swipeActive, state.swipeRatio);
      });
      var stopSwipe = function () { draggingSwipe = false; };
      swipeEl.addEventListener('pointerup', stopSwipe);
      swipeEl.addEventListener('pointercancel', stopSwipe);
    }

    applyState();

    return {
      state: state,
      openTab: function (tabName) {
        if (tabName) state.activeTab = tabName;
        state.dockOpen = true;
        applyState();
      },
      toggleDock: function (force) {
        state.dockOpen = typeof force === 'boolean' ? force : !state.dockOpen;
        applyState();
      },
      autoCloseOnMobile: function () {
        if (window.innerWidth <= 980 && state.dockOpen) {
          state.dockOpen = false;
          applyState();
        }
      },
      toggleLeft: function (force) { this.toggleDock(force); },
      toggleRight: function (force) { this.toggleDock(force); },
      toggleBottom: function (tabName) {
        if (tabName && state.bottomOpen && state.bottomTab !== tabName) state.bottomTab = tabName;
        else { if (tabName) state.bottomTab = tabName; state.bottomOpen = !state.bottomOpen; }
        applyState();
        return state.bottomTab;
      },
      toggleCleanMode: function (force) { state.cleanMode = typeof force === 'boolean' ? force : !state.cleanMode; applyState(); },
      toggleSwipe: function (force) { state.swipeActive = typeof force === 'boolean' ? force : !state.swipeActive; applyState(); onSwipeChange(state.swipeActive, state.swipeRatio); },
      toggleTheme: function () {
        document.body.classList.toggle('ui-day');
        var tb = rootEl.querySelector('#scQTheme');
        if (tb) tb.textContent = document.body.classList.contains('ui-day') ? '☾' : '☀';
        onResize();
      },
      applyState: applyState
    };
  }

  S.SatThemeUI = {
    ICONS: ICONS,
    TOOL_DOCS: TOOL_DOCS,
    PANEL_I18N: PANEL_I18N,
    normalizeLangPrefs: normalizeLangPrefs,
    loadLangPrefs: loadLangPrefs,
    saveLangPrefs: saveLangPrefs,
    applyPanelLang: applyPanelLang,
    openLangSettingsModal: openLangSettingsModal,
    ensureCss: ensureCss,
    buildUnifiedTopBar: buildUnifiedTopBar,
    renderToolGrid: renderToolGrid,
    updateToolGuide: updateToolGuide,
    createUnifiedDockController: createUnifiedDockController,
    // Backward-safe aliases during file updates
    buildMenuBar: buildUnifiedTopBar,
    buildLeftIconRail: function () { return { render: function () {}, setActive: function () {}, hideTip: function () {} }; },
    createWorkspaceController: createUnifiedDockController
  };
})(window.SOS);
