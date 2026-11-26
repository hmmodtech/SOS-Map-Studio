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
  // 2. SIDEBARS & PANELS DICTIONARY (EN / AR)
  // =========================================================================
  var PANEL_I18N = {
    active_poly:     { en: 'Active Polygon / Line',                    ar: 'المضلع / الخط النشط' },
    edge_feather:    { en: 'Edge Feather',                             ar: 'نعومة الحافة' },
    btn_apply:       { en: 'Apply / Finish',                           ar: 'تنفيذ / إنهاء' },
    btn_undo_pt:     { en: 'Undo Pt',                                  ar: 'تراجع نقطة' },
    btn_cancel:      { en: 'Cancel',                                   ar: 'إلغاء' },
    photo_tools_h:   { en: 'Photo Brush, Clone & Wand',                ar: 'فرشاة الصور والختم والعصا' },
    lbl_color:       { en: 'Color',                                    ar: 'اللون' },
    lbl_wand_tol:    { en: 'Wand Tol',                                 ar: 'تسامح العصا' },
    lbl_contig:      { en: 'Contiguous Wand',                          ar: 'عصا متصلة فقط' },
    lbl_radius:      { en: 'Radius',                                   ar: 'نصف القطر' },
    lbl_feather:     { en: 'Feather',                                  ar: 'النعومة' },
    btn_pick_src:    { en: 'Pick Clone Src',                           ar: 'التقاط مصدر' },
    btn_add_png:     { en: '+ PNG Asset',                              ar: '+ إضافة صورة' },
    arcgis_dig_h:    { en: 'ArcGIS Digitizing',                        ar: 'الرسم المتجهي ArcGIS' },
    lbl_category:    { en: 'Category',                                 ar: 'الفئة' },
    lbl_snapping:    { en: 'Snapping (Vertex/Mid/Edge)',               ar: 'الالتقاط المغناطيسي (زاوية/ضلع)' },
    btn_cogo:        { en: 'COGO Dist+Brg',                            ar: 'طول + زاوية COGO' },
    btn_attr_tbl:    { en: 'Attribute Table',                          ar: 'جدول الصفات' },
    btn_show_panels: { en: 'Show Panels',                              ar: 'إظهار الأشرطة' },
    btn_drop_gps:    { en: '🛰 Drop GPS',                              ar: '🛰 نقطة GPS' },
    btn_undo:        { en: '↩ Undo',                                   ar: '↩ تراجع' },
    tab_attr:        { en: 'ArcGIS Attribute Table',                   ar: 'جدول الصفات ArcGIS' },
    tab_gcp:         { en: 'GCP Georef Link Table',                    ar: 'جدول الربط الجغرافي GCP' },
    tab_hist:        { en: 'History',                                  ar: 'سجل التعديلات' },
    sec_layers:      { en: 'Layers (Independent Visibility)',          ar: 'الطبقات (إخفاء / إظهار مستقل)' },
    sec_scale:       { en: 'Scale Bar & True North',                   ar: 'مقياس الرسم والشمال الحقيقي' },
    lbl_scale:       { en: 'Scale:',                                   ar: 'المقياس:' },
    lbl_line:        { en: 'Line:',                                    ar: 'الخط:' },
    lbl_known_m:     { en: 'Known (m)',                                ar: 'الطول الحقيقي (م)' },
    lbl_north_deg:   { en: 'North (°)',                                ar: 'زاوية الشمال (°)' },
    btn_pick_scale:  { en: 'Pick 2-Pt Scale',                          ar: 'تحديد نقطتي مقياس' },
    btn_apply_scale: { en: 'Apply Scale',                              ar: 'تطبيق المقياس' },
    btn_cal_north:   { en: 'Calibrate North',                          ar: 'معايرة الشمال' },
    btn_clear_scale: { en: 'Clear Scale',                              ar: 'مسح المقياس' },
    sec_assets:      { en: '03_Movable_Assets & Inspector',            ar: 'العناصر المضافة والمفتش' },
    sec_sun:         { en: 'Global Sun Shadow',                        ar: 'ظل الشمس الموحّد' },
    lbl_az:          { en: 'Az',                                       ar: 'الاتجاه' },
    lbl_len:         { en: 'Len',                                      ar: 'الطول' },
    lbl_op:          { en: 'Op',                                       ar: 'الشفافية' },
    lbl_blur:        { en: 'Blur',                                     ar: 'الضبابية' },
    sec_geoterra:    { en: 'GeoTerra Field Survey',                    ar: 'المسح الميداني GeoTerra' },
    btn_imp_gt:      { en: '⬆ Import GeoTerra Session (.json / .zip)', ar: '⬆ استيراد جلسة GeoTerra (.json / .zip)' },
    sec_export:      { en: 'Print Poster & Dual Export',               ar: 'تصدير الخريطة والبوستر' },
    lbl_tit_en:      { en: 'Poster Title EN',                          ar: 'عنوان البوستر (إنجليزي)' },
    lbl_tit_ar:      { en: 'Poster Title AR',                          ar: 'عنوان البوستر (عربي)' },
    lbl_paper:       { en: 'Paper',                                    ar: 'حجم الورق' },
    lbl_dpi:         { en: 'DPI',                                      ar: 'الدقة DPI' },
    btn_exp_clean:   { en: '1. Clean 2D PNG',                          ar: '1. خريطة نظيفة PNG' },
    btn_exp_poster:  { en: '2. Poster PNG',                            ar: '2. بوستر طباعة PNG' },
    btn_push_cad:    { en: 'Push ➔ 2D CAD',                            ar: 'إرسال ➔ 2D CAD' },
    btn_open_3d:     { en: 'Open in 3D GPU',                           ar: 'فتح في محرك 3D' }
  };

  function applyPanelLang(rootEl, panelLang) {
    if (!rootEl) return;
    var l = panelLang === 'ar' ? 'ar' : 'en';
    [].forEach.call(rootEl.querySelectorAll('[data-i18n]'), function (el) {
      var entry = PANEL_I18N[el.dataset.i18n];
      if (entry) el.textContent = entry[l] || entry.en;
    });
    var dir = l === 'ar' ? 'rtl' : 'ltr';
    var lsub = rootEl.querySelector('.satc-lsub');
    var rightEl = rootEl.querySelector('.satc-right');
    var botEl = rootEl.querySelector('.satc-bottom');
    if (lsub) lsub.dir = dir;
    if (rightEl) rightEl.dir = dir;
    if (botEl) botEl.dir = dir;
  }

  // =========================================================================
  // 3. INLINE SVG ICONS (100% OFFLINE — PHOTOSHOP + ARCGIS + GEOTERRA)
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
  // 4. TOOL GROUPS & BILINGUAL PHOTOSHOP / ARCGIS / GEOTERRA INSTRUCTIONS
  // =========================================================================
  var TOOL_GROUPS = [
    { id: 'nav',      ar: 'التنقل والتحديد',          en: 'Navigate & Select',    tools: ['select', 'pan'] },
    { id: 'photo',    ar: 'تعديل الصور (Photoshop)',  en: 'Photo Edit',           tools: ['crop_asset', 'lasso_erase', 'wand', 'crop_base', 'cutout', 'clone', 'erase', 'brush', 'eyedropper'] },
    { id: 'proc',     ar: 'معالم فضائية جاهزة',       en: 'Procedural Assets',    tools: ['futsal_rect', 'building_add', 'tent_add', 'tree_add'] },
    { id: 'gis',      ar: 'أدوات الخرائط وArcGIS',    en: 'ArcGIS & Map Tools',   tools: ['gis_point', 'gis_line', 'poly_draw', 'gis_circle', 'gis_split', 'gis_buffer', 'gis_viewshed', 'pin', 'calibrate', 'bearing_cal', 'measure'] },
    { id: 'geoterra', ar: 'المسح الميداني (GeoTerra)', en: 'GeoTerra Survey',     tools: ['gt_boundary', 'gt_survey', 'gt_georef', 'gt_gps_drop'] }
  ];

  var TOOL_DOCS = {
    select: {
      key: 'V', cat: 'nav',
      ar: { name: 'تحديد وتحريك (Select / Move)', desc: 'اختيار أي عنصر أو مضلع أو معلم لإظهار القائمة السريعة (تعديل/تحريك/زوايا/نسخ/حذف).', steps: ['انقر على أي عنصر أو مضلع لتحديده.', 'استخدم القائمة السريعة بجانب المعلم للتحريك أو تعديل الزوايا أو الحذف.', 'اضغط Shift أثناء تدوير الصور للالتقاط كل 15°، أو Ctrl+D للنسخ.'] },
      en: { name: 'Select / Move', desc: 'Select any asset, polygon, or feature to open its Quick Action menu (Edit/Move/Vertices/Clone/Delete).', steps: ['Tap any asset, polygon, or pin to select it.', 'Use the floating Quick Menu to edit, move whole shape, drag vertices, clone, or delete.', 'Hold Shift for 15° angle snaps, or press Ctrl+D to duplicate.'] }
    },
    pan: {
      key: 'H', cat: 'nav',
      ar: { name: 'تحريك الخريطة (Pan)', desc: 'تحريك مساحة العرض بحرية بدون إضافة نقاط أو تحريك العناصر بالخطأ.', steps: ['اسحب بالماوس أو بإصبع واحد لتحريك الخريطة.', 'استخدم عجلة الماوس أو إصبعين (Pinch) للتكبير والتصغير.', 'تلميح: اضغط مطولاً على Space في أي أداة للتحريك المؤقت.'] },
      en: { name: 'Pan Canvas', desc: 'Navigate freely across the satellite map without modifying objects.', steps: ['Drag with mouse or one finger to pan.', 'Use scroll wheel or 2-finger pinch to zoom.', 'Tip: Hold Spacebar in any tool for temporary pan.'] }
    },
    crop_asset: {
      key: 'C', cat: 'photo',
      ar: { name: 'قص العنصر المحدد (Crop Asset)', desc: 'قص صورة مضافة لإبقاء الجزء المحدد فقط وحذف باقي الصورة فوراً.', steps: ['حدد الصورة المضافة أولاً من الكانفاس أو قائمة الطبقات.', 'انقر 3 نقاط أو أكثر حول الجزء الذي تريد إبقاءه فقط.', 'انقر النقطة الصفراء الأولى أو اضغط Apply لتنفيذ القص.'] },
      en: { name: 'Crop Selected Asset', desc: 'Keep ONLY the polygon you trace inside an imported image and remove everything outside.', steps: ['Select the target asset first.', 'Click 3+ polygon vertices around the region to keep.', 'Click the first yellow vertex or press Enter/Apply to crop.'] }
    },
    lasso_erase: {
      key: 'L', cat: 'photo',
      ar: { name: 'مسح لاسو (Lasso Erase)', desc: 'تحديد جزء غير مرغوب فيه داخل أي صورة مضافة ومسحه بحواف ناعمة.', steps: ['حدد العنصر المراد التعديل عليه.', 'ارسم مضلعاً حول الجزء غير المرغوب فيه.', 'اضغط Enter أو Apply لحذف ذلك الجزء.'] },
      en: { name: 'Lasso Erase (Asset)', desc: 'Draw a free polygon inside the selected asset to erase unwanted areas cleanly.', steps: ['Select an asset.', 'Click 3+ vertices around the unwanted region.', 'Press Enter or close the loop to erase with feathering.'] }
    },
    wand: {
      key: 'W', cat: 'photo',
      ar: { name: 'العصا السحرية (Magic Wand)', desc: 'إزالة لون الخلفية المتشابه من أي صورة مضافة بنقرة واحدة.', steps: ['حدد الصورة المضافة أولاً.', 'اضبط التسامح (Wand Tol) من خيارات الأداة.', 'انقر مباشرة على لون الخلفية غير المرغوب فيه لإزالته فوراً.'] },
      en: { name: 'Magic Wand Background Remover', desc: 'Remove uniform background colors from the selected asset with one click.', steps: ['Select the imported image asset.', 'Adjust Tolerance and Contiguous mode.', 'Click directly on the background color to make it transparent.'] }
    },
    crop_base: {
      key: '', cat: 'photo',
      ar: { name: 'قص خريطة الأساس (Crop Base)', desc: 'قص صورة القمر الصناعي الأساسية وكل الطبقات لحدود منطقة العمل فقط.', steps: ['اسحب مستطيلاً حول حدود الموقع المطلوب إبقاءه.', 'عند الإفلات يتم قص صورة الأساس وتحديث مواقع كل العناصر.'] },
      en: { name: 'Crop Base Canvas', desc: 'Trim the entire base satellite image and shift all layers/assets cleanly.', steps: ['Click and drag a rectangle over the region to keep.', 'Release to crop base image and preserve alignment.'] }
    },
    cutout: {
      key: 'X', cat: 'photo',
      ar: { name: 'قص ونقل من الأساس (Cut & Relocate A➔B)', desc: 'اقتطاع معلم حقيقي ببكسلاته الأصلية 1:1 من صورة القمر الصناعي لنقله لموقع جديد.', steps: ['انقر حول أركان المعلم في صورة الأساس (3 نقاط أو أكثر).', 'اضغط Enter أو Apply لاستخراجه كعنصر مستقل.', 'اسحبه للموقع الجديد ثم استخدم Clone Patch لتنظيف مكانه القديم.'] },
      en: { name: 'Cut & Relocate (A➔B)', desc: 'Extract 1:1 natural pixels from Base Satellite as a movable asset.', steps: ['Trace 3+ points around the real object on base map.', 'Press Enter or Apply to extract to 03_Movable_Assets.', 'Move/rotate to spot B, then clean spot A with Clone Patch.'] }
    },
    clone: {
      key: 'S', cat: 'photo',
      ar: { name: 'الختم والترقيع (Clone Patch)', desc: 'نسخ نسيج التربة أو الأسفلت الطبيعي لتغطية عوائق أو مبانٍ قديمة بدمج ناعم.', steps: ['اضغط Alt+Click (أو Pick Clone Src) على تربة نظيفة لالتقاط المصدر.', 'اسحب فوق المنطقة المطلوب إخفاؤها على طبقة 02_Ground_Cleanup.', 'عدّل نصف القطر والنعومة لدمج غير مرئي.'] },
      en: { name: 'Clone Stamp Patch', desc: 'Copy natural ground texture seamlessly onto Layer 02_Ground_Cleanup.', steps: ['Alt+Click (or tap Pick Clone Src) on clean soil.', 'Paint over unwanted features to cover them smoothly.', 'Adjust Radius and Feather as needed.'] }
    },
    erase: {
      key: 'E', cat: 'photo',
      ar: { name: 'الممحاة الناعمة (Soft Eraser)', desc: 'مسح التعديلات الموجودة على طبقة التنظيف لكشف صورة القمر الصناعي الأصلية تحتها.', steps: ['اضبط حجم الفرشاة والنعومة.', 'اسحب فوق المنطقة المطلوب إرجاعها للأصل.'] },
      en: { name: 'Soft Eraser (Cleanup Layer)', desc: 'Erase patches or pre-cleaned areas on Layer 02 to reveal original Base Satellite.', steps: ['Set Brush Radius and Soft Feather.', 'Paint over areas you want to restore from Base Satellite.'] }
    },
    brush: {
      key: 'B', cat: 'photo',
      ar: { name: 'فرشاة الرسم الأرضي (Soil Brush)', desc: 'الرسم اللوني الناعم فوق طبقة التنظيف لتمويه التربة أو توحيد الإضاءة.', steps: ['التقط لوناً طبيعياً بأداة القطّارة (I) أو اختر لوناً.', 'اسحب بالفرشاة مع ضبط الحجم والنعومة.'] },
      en: { name: 'Soil / Surface Brush', desc: 'Softly paint matching soil, asphalt, or roof tones onto the cleanup layer.', steps: ['Pick a real tone with Eyedropper (I) or color picker.', 'Paint with adjusted Radius and Hardness.'] }
    },
    eyedropper: {
      key: 'I', cat: 'photo',
      ar: { name: 'قطّارة الألوان (Eyedropper)', desc: 'التقاط درجة اللون الحقيقية بالبكسل من صورة القمر الصناعي لاستخدامها مع الفرشاة.', steps: ['انقر على أي نقطة تربة أو سقف في الخريطة.', 'يُحفظ اللون تلقائياً وتنتقل الأداة للفرشاة مباشرة.'] },
      en: { name: 'Color Eyedropper', desc: 'Sample exact RGB ground color from the satellite map for the paint brush.', steps: ['Click any ground or surface pixel.', 'Color is sampled and switches back to Brush automatically.'] }
    },
    futsal_rect: {
      key: '', cat: 'proc',
      ar: { name: 'ملعب خماسي + شبك أحمر (Futsal)', desc: 'رسم ملعب ترابي غير معشّب مع سياج شبك معدني وشبك حماية أحمر علوي وظل موحّد.', steps: ['انقر واسحب من زاوية الملعب إلى الزاوية المقابلة لتحديد الطول وزاوية الميل.', 'عدّل الإضاءة والظل من لوحة المفتش على اليمين.'] },
      en: { name: 'Futsal Pitch + Red Net', desc: 'Generate a realistic un-grassed sandy pitch with chain-link fence and upper red net.', steps: ['Click and drag along the pitch axis to set length and angle.', 'Fine-tune Blending and Shadow in the right Inspector.'] }
    },
    building_add: {
      key: '', cat: 'proc',
      ar: { name: 'إضافة مبنى/كرفان (Building)', desc: 'إدراج سطح مبنى أو كرفان بمنظور علوي 90° مع ظل مطابق لزاوية الشمس.', steps: ['انقر على الموقع المطلوب في الخريطة.', 'حدّد الأبعاد بالمتر والارتفاع والزاوية من المفتش.'] },
      en: { name: 'Add Top-Down Building', desc: 'Place an orthographic 90° building/prefab roof with global sun shadow.', steps: ['Click anywhere on the map to insert.', 'Set exact meters, rotation, and height in Inspector.'] }
    },
    tent_add: {
      key: '', cat: 'proc',
      ar: { name: 'إضافة خيمة (Tent)', desc: 'إدراج خيمة ميدانية بمنظور علوي 90° جاهزة للنسخ السريع.', steps: ['انقر على موقع الخيمة المطلوب.', 'اضغط نسخ من القائمة السريعة لتكرار صف خيام بسرعة.'] },
      en: { name: 'Add Field Tent', desc: 'Insert a top-down field tent with seam lines and realistic shadow.', steps: ['Click target location on map.', 'Use Clone from Quick Menu or Ctrl+D to duplicate rows rapidly.'] }
    },
    tree_add: {
      key: '', cat: 'proc',
      ar: { name: 'إضافة شجرة طبيعية (Tree)', desc: 'إدراج تاج شجرة عضوي متعدد الدرجات اللونية مع ظل أرضي متوافق.', steps: ['انقر على موقع الشجرة.', 'عدّل القطر والارتفاع ليتناسب مع أشجار القرية.'] },
      en: { name: 'Add Natural Tree', desc: 'Insert organic top-down tree canopy with matching sun shadow.', steps: ['Click map to place tree.', 'Resize or adjust elevation in Inspector.'] }
    },
    gis_point: {
      key: '', cat: 'gis',
      ar: { name: 'نقطة GIS مساحية (Point Feature)', desc: 'إضافة نقطة متجهية بصفات وإحداثيات Lat/Lon وUTM قابلة للاستعلام والتصدير لـ ArcGIS.', steps: ['انقر على الموقع المطلوب لإضافة النقطة.', 'تظهر تلقائياً في جدول الصفات ويمكن تطبيق Buffer أو Viewshed عليها.'] },
      en: { name: 'ArcGIS Point Feature', desc: 'Digitize a vector point with attributes, Lat/Lon & UTM coordinates for GIS analysis.', steps: ['Click map to place point feature.', 'Inspect/edit fields in the bottom Attribute Table.'] }
    },
    gis_line: {
      key: '', cat: 'gis',
      ar: { name: 'خط ومسار (Polyline / Evac Route)', desc: 'رسم طرق، أسوار، أو مسارات إخلاء بأسهم اتجاه مع حساب الطول الكلي بالأمتار.', steps: ['انقر لتحديد نقاط المسار (مع الالتقاط المغناطيسي Snapping).', 'اضغط Enter أو Apply لإنهاء الخط وحفظه في طبقة الـ GIS.'] },
      en: { name: 'ArcGIS Polyline / Route', desc: 'Digitize roads, fences, or evacuation routes with live metric length and direction arrows.', steps: ['Click vertices along the path (snapping supported).', 'Press Enter, double-click, or tap Apply to finish line.'] }
    },
    poly_draw: {
      key: 'P', cat: 'gis',
      ar: { name: 'رسم مضلع مساحي (Polygon)', desc: 'رسم مضلع GIS مع حساب مباشر للمساحة (م² / دونم) والمحيط (م).', steps: ['انقر 3 نقاط أو أكثر لتحديد الزوايا (Shift للتعامد 90°).', 'انقر النقطة الأولى أو اضغط Apply لإغلاق المضلع وحفظه.'] },
      en: { name: 'Draw GIS Polygon', desc: 'Digitize polygons with live Area (m²/dunum) and Perimeter (m).', steps: ['Click 3+ vertices (hold Shift for 90° ortho).', 'Click first vertex or press Enter/Apply to close.'] }
    },
    gis_circle: {
      key: '', cat: 'gis',
      ar: { name: 'دائرة بنصف قطر متري (Circle)', desc: 'رسم دائرة أو نطاق دائري بنصف قطر متري محدد لمناطق التجمع والمدى.', steps: ['انقر مركز الدائرة واسحب للخارج لتحديد نصف القطر بالمتر.'] },
      en: { name: 'Metric Circle / Range Ring', desc: 'Draw an exact metric-radius circle for assembly zones or safety perimeters.', steps: ['Click center and drag outward to set metric radius.'] }
    },
    gis_split: {
      key: '', cat: 'gis',
      ar: { name: 'قص وتقسيم مضلع (Split Topology)', desc: 'تقسيم أي مضلع GIS محدد إلى مضلعين مستقلين برسم خط قاطع عبره.', steps: ['حدد المضلع المطلوب تقسيمه أولاً.', 'ارسم خطاً قاطعاً يعبره ثم اضغط Apply/Enter.'] },
      en: { name: 'Split Polygon (Topology)', desc: 'Slice a selected GIS polygon cleanly into two polygons using a cut line.', steps: ['Select a GIS polygon.', 'Draw a cutting line across it and press Apply/Enter.'] }
    },
    gis_buffer: {
      key: '', cat: 'gis',
      ar: { name: 'نطاق حماية/خطر (Buffer Zone)', desc: 'توليد نطاق حماية أحادي أو متعدد الحلقات (مثل 10م، 25م، 50م) حول أي معلم.', steps: ['حدد نقطة أو خطاً أو مضلعاً (أو انقر على موقع).', 'أدخل مسافات الـ Buffer بالأمتار لتوليد مناطق الحماية فوراً.'] },
      en: { name: 'Buffer / Multi-Ring Buffer', desc: 'Generate single or multi-ring safety/hazard buffers (e.g., 10m, 25m, 50m).', steps: ['Select any feature or click a location.', 'Enter metric buffer distances to generate buffer rings.'] }
    },
    gis_viewshed: {
      key: '', cat: 'gis',
      ar: { name: 'تحليل خط الرؤية (2D Viewshed)', desc: 'فحص التغطية البصرية (أخضر مرئي / أحمر محجوب) من كاميرا أو نقطة حراسة حول المباني.', steps: ['انقر موقع الكاميرا أو برج المراقبة على الخريطة.', 'تُحسب الأشعة فوراً حول المباني المرسومة لتحديد الزوايا الميتة.'] },
      en: { name: '2D Line-of-Sight Viewshed', desc: 'Analyze visible (green) vs obstructed (red) zones from a guard post or camera.', steps: ['Click the observer/camera location on the map.', 'Raycasts automatically account for drawn building footprints.'] }
    },
    pin: {
      key: '', cat: 'gis',
      ar: { name: 'دبابيس البوستر (Pin 1..N)', desc: 'وضع دبابيس مرقمة ومصنفة تظهر في مفتاح الخريطة ثنائي اللغة عند الطباعة.', steps: ['انقر على الخريطة لوضع دبوس مرقّم.', 'اسحبه لتعديل موقعه، أو اضغط تعديل من القائمة السريعة.'] },
      en: { name: 'Poster Numbered Pins (1..N)', desc: 'Place numbered pins linked automatically to the bilingual print legend.', steps: ['Click on map to drop numbered pin.', 'Drag to reposition or use Quick Menu to edit AR/EN labels.'] }
    },
    calibrate: {
      key: '', cat: 'gis',
      ar: { name: 'معايرة المقياس (Calibrate 2-Pt)', desc: 'ربط البكسل بالمتر الحقيقي (px/m) عبر قياس ضلع معروف الطول على الصورة.', steps: ['انقر النقطة الأولى ثم الثانية على طول معروف.', 'أدخل الطول الحقيقي بالمتر واضغط Apply Scale.'] },
      en: { name: '2-Point Metric Calibration', desc: 'Bind pixels to real-world meters (px/m) using a known reference length.', steps: ['Click start and end points of a known ground distance.', 'Enter meters and click Apply Scale.'] }
    },
    bearing_cal: {
      key: '', cat: 'gis',
      ar: { name: 'معايرة الاتجاه والشمال (Bearing / North)', desc: 'رسم خط يشير إلى الشمال الحقيقي لضبط زاوية الانحراف وسهم الشمال تلقائياً.', steps: ['انقر نقطة البداية ثم انقر نقطة ثانية باتجاه الشمال الحقيقي.', 'يُحسب انحراف الشمال تلقائياً ويُزامن مع سهم الشمال وAJ-GeoCAD.'] },
      en: { name: 'True North & Bearing Calibration', desc: 'Draw a line pointing True North to auto-calibrate map rotation and North Arrow.', steps: ['Click base point then click a point directly North.', 'North offset updates automatically across Studio and CAD.'] }
    },
    measure: {
      key: 'M', cat: 'gis',
      ar: { name: 'القياس المساحي (Measure)', desc: 'قياس المسافة بالبكسل والمتر وزاوية الانحراف والاتجاه العكسي بين أي نقطتين.', steps: ['انقر نقطة البداية ثم نقطة النهاية لقراءة المسافة والزاوية مباشرة.'] },
      en: { name: 'Distance & Bearing Measure', desc: 'Measure distance (px & meters), forward bearing, and back-bearing.', steps: ['Click 2 points to read live distance and azimuth.'] }
    },
    gt_boundary: {
      key: '', cat: 'geoterra',
      ar: { name: 'حدود وقطاعات GeoTerra', desc: 'رسم حدود القرية وتقسيمها تلقائياً إلى قطاعات مرقمة (A1..F4) محاذية للحدود.', steps: ['انقر حول زوايا القرية (أو استخدم إسقاط GPS).', 'أغلق المضلع لتوليد شبكة القطاعات تلقائياً داخل الحدود فقط.'] },
      en: { name: 'GeoTerra Boundary & Sectors', desc: 'Trace village boundary to auto-generate aligned interior sectors (A1..F4).', steps: ['Click village corners (or drop live GPS points).', 'Close polygon to activate sector grid and auto-tagging.'] }
    },
    gt_survey: {
      key: '', cat: 'geoterra',
      ar: { name: 'معلم ميداني GeoTerra (REM/REP/MOD/ADD)', desc: 'تعليم معالم التغيير الميداني مع ربطها بالصور الميدانية واتجاه البوصلة وتصدير حزمة AI ZIP.', steps: ['اختر مضلعاً أو دبوساً من لوحة GeoTerra وارسم المعلم.', 'اختر نوع العملية وأرفق الصور الميدانية واتجاهها ثم احفظ.'] },
      en: { name: 'GeoTerra Field Feature (REM/REP/MOD/ADD)', desc: 'Mark phased field changes with attached compressed photos, camera bearings & AI export.', steps: ['Draw a polygon or drop a pin on the changed feature.', 'Tag operation phase, attach photos with compass bearings, and save.'] }
    },
    gt_georef: {
      key: '', cat: 'geoterra',
      ar: { name: 'الربط الجغرافي المطور (GCP Georef)', desc: 'ربط الصورة بإحداثيات حقيقية عبر 4 نماذج (Shift / Similarity / Affine / Homography) مع جدول دقة RMS.', steps: ['انقر على زوايا ثابتة واضحة في الصورة (يفضل 3 إلى 4 زوايا متباعدة).', 'الصق الإحداثية (DD أو DMS أو UTM أو رابط Google Maps) أو التقطها بالـ GPS.'] },
      en: { name: 'GCP Georeferencing (4-Model Solver)', desc: 'Georeference imagery via Shift, Similarity, Affine, or Projective Homography with RMS table.', steps: ['Click distinct ground corners on the map (3–4 spread corners recommended).', 'Paste DD, DMS, UTM, Google Maps URL, or capture averaged GPS.'] }
    },
    gt_gps_drop: {
      key: '', cat: 'geoterra',
      ar: { name: 'إسقاط نقطة GPS ميدانية (GPS Drop)', desc: 'إسقاط نقطة فورية في موقعك الفعلي باستخدام فلترة Kalman ومتوسط القراءات وتصحيح التشويش.', steps: ['تأكد من ربط الخريطة بنقطتي GCP على الأقل وتفعيل GPS.', 'انقر لإسقاط نقطة في الشكل النشط.'] },
      en: { name: 'Live GPS Drop (Filtered + Drift Fix)', desc: 'Drop a vertex/pin at your live GPS position with averaging, accuracy gate, and drift offset.', steps: ['Ensure at least 2 GCPs are set and GPS tracking is active.', 'Click to drop point into active boundary/polygon/pin.'] }
    }
  };

  // =========================================================================
  // 5. TOP MENU BAR DEFINITIONS (PHOTOSHOP + ARCGIS STYLE)
  // =========================================================================
  var MENUS = [
    {
      id: 'file', ar: 'ملف', en: 'File',
      items: [
        { act: 'import_base', ar: 'استيراد خريطة الأساس (Base Satellite)', en: 'Import Base Satellite...', k: 'Ctrl+O' },
        { act: 'import_cleanup', ar: 'استيراد طبقة تنظيف جاهزة (Cleanup)', en: 'Load Pre-Cleaned Layer...' },
        { act: 'import_asset', ar: 'إضافة صورة / عنصر (+ PNG Asset)', en: 'Import PNG / Photo Asset...' },
        { sep: true },
        { act: 'import_gis', ar: 'استيراد ملف جغرافي (GeoJSON / KML / GPX / CSV)', en: 'Import GIS (GeoJSON / KML / GPX / CSV)...' },
        { act: 'import_gt_json', ar: 'استيراد جلسة GeoTerra (.json / .zip)', en: 'Import GeoTerra Session (.json / .zip)...' },
        { sep: true },
        { act: 'export_clean', ar: 'تصدير الخريطة النظيفة (Master_Clean_2D.png)', en: 'Export Master_Clean_2D.png' },
        { act: 'export_poster', ar: 'تصدير بوستر الطباعة (Print Poster PNG)', en: 'Export Print Poster PNG' },
        { act: 'export_worldfile', ar: 'تصدير ربط ArcGIS/QGIS (.pgw + .prj + KML)', en: 'Export Georef Package (.pgw + .prj)' },
        { act: 'export_geojson', ar: 'تصدير طبقات GIS بصيغة GeoJSON', en: 'Export GIS Layers (GeoJSON)' },
        { act: 'export_kml', ar: 'تصدير Google Earth (KML)', en: 'Export Google Earth (KML)' },
        { act: 'export_gt_zip', ar: 'تصدير حزمة GeoTerra AI الكاملة (ZIP)', en: 'Export GeoTerra AI Package (ZIP)' }
      ]
    },
    {
      id: 'edit', ar: 'تحرير', en: 'Edit',
      items: [
        { act: 'undo', ar: 'تراجع (Undo)', en: 'Undo', k: 'Ctrl+Z' },
        { act: 'redo', ar: 'إعادة (Redo)', en: 'Redo', k: 'Ctrl+Y' },
        { sep: true },
        { act: 'dup_sel', ar: 'تكرار العنصر المحدد (Duplicate)', en: 'Duplicate Selected', k: 'Ctrl+D' },
        { act: 'del_sel', ar: 'حذف العنصر المحدد (Delete)', en: 'Delete Selected', k: 'Del' },
        { act: 'auto_tone', ar: 'مطابقة لون التربة تلقائياً (Auto-Match Soil)', en: 'Auto-Match Surrounding Soil Tone' },
        { sep: true },
        { act: 'clear_patches', ar: 'مسح رقع الترقيع (Clear Patches)', en: 'Clear Clone Patches' },
        { act: 'clear_erases', ar: 'مسح ضربات الممحاة (Clear Erases)', en: 'Clear Eraser Strokes' },
        { act: 'clear_sat', ar: 'تفريغ بيانات الاستوديو بالكامل (Clear Sat)', en: 'Clear All Sat Studio Data', danger: true }
      ]
    },
    {
      id: 'view', ar: 'عرض', en: 'View',
      items: [
        { act: 'fit', ar: 'ملاءمة الخريطة للشاشة (Fit View)', en: 'Fit to Screen', k: '0' },
        { act: 'zoom_100', ar: 'تكبير أصلي 100% (1:1 Pixels)', en: 'Native 100% Pixels', k: '1' },
        { sep: true },
        { act: 'toggle_left', ar: 'إظهار / إخفاء شريط الأدوات الأيسر', en: 'Toggle Left Tool Dock', k: '[' },
        { act: 'toggle_right', ar: 'إظهار / إخفاء لوحة الطبقات اليمنى', en: 'Toggle Right Layers Dock', k: ']' },
        { act: 'toggle_bottom_attr', ar: 'جدول الصفات (Attribute Table)', en: 'Toggle Attribute Table' },
        { act: 'toggle_bottom_hist', ar: 'سجل التعديلات (History Panel)', en: 'Toggle History Panel' },
        { act: 'toggle_swipe', ar: 'مقارنة قبل / بعد (Before/After Swipe)', en: 'Before / After Split Comparison' },
        { sep: true },
        { act: 'toggle_clean', ar: 'وضع المسح النظيف (إخفاء الأشرطة)', en: 'Clean Field Mode (Hide Panels)', k: 'Tab' },
        { act: 'toggle_grid', ar: 'إظهار / إخفاء الشبكة الإحداثية (Graticule)', en: 'Toggle Coordinate Grid / Graticule' },
        { act: 'toggle_scalebar', ar: 'إظهار / إخفاء مقياس الرسم', en: 'Toggle Live Scale Bar' },
        { act: 'toggle_theme', ar: 'تبديل الوضع الليلي / النهاري (Cyber / Day)', en: 'Switch Cyber HUD / Daylight Mode' },
        { act: 'open_lang_settings', ar: '🌐 إعدادات اللغة (القوائم / التعليمات / الأشرطة)...', en: '🌐 Language Settings (Menus / Guide / Sidebars)...' },
        { act: 'toggle_fullscreen', ar: 'ملء الشاشة (Fullscreen)', en: 'Toggle Fullscreen', k: 'F11' }
      ]
    },
    {
      id: 'gis', ar: 'ArcGIS', en: 'Map & GIS',
      items: [
        { act: 'tool:calibrate', ar: 'معايرة المقياس (2-Point px/m)', en: '2-Point Metric Scale Calibration' },
        { act: 'tool:bearing_cal', ar: 'معايرة الشمال الحقيقي والاتجاهات', en: 'True North & Bearing Calibration' },
        { act: 'open_gcp_table', ar: 'جدول نقاط الربط الجغرافي (GCP Link Table)', en: 'Open GCP Link Table & RMS' },
        { act: 'cycle_coord_sys', ar: 'تبديل نظام الإحداثيات (DD / DMS / UTM 36N)', en: 'Cycle Coords (DD / DMS / UTM 36N)' },
        { sep: true },
        { act: 'tool:gis_point', ar: 'رسم نقطة مساحية (Point)', en: 'Digitize Point Feature' },
        { act: 'tool:gis_line', ar: 'رسم طريق / مسار إخلاء (Polyline)', en: 'Digitize Polyline / Route' },
        { act: 'tool:poly_draw', ar: 'رسم مضلع مساحي (Polygon)', en: 'Digitize Polygon' },
        { act: 'tool:gis_circle', ar: 'رسم دائرة بنصف قطر متري (Circle)', en: 'Draw Metric Circle' },
        { act: 'gis_cogo', ar: 'إدخال ضلع بالطول والزاوية (COGO)', en: 'COGO (Distance + Bearing Input)' },
        { sep: true },
        { act: 'gis_snap_toggle', ar: 'تفعيل / تعطيل الالتقاط المغناطيسي (Snapping)', en: 'Toggle Vertex/Edge Snapping' },
        { act: 'tool:gis_split', ar: 'تقسيم مضلع (Split Polygon)', en: 'Topology: Split Polygon' },
        { act: 'gis_merge', ar: 'دمج المضلعات المحددة (Merge / Union)', en: 'Topology: Merge Selected Polygons' },
        { act: 'gis_clip', ar: 'اقتطاع مضلع من مضلع (Clip / Erase)', en: 'Topology: Clip / Erase Overlap' },
        { sep: true },
        { act: 'tool:gis_buffer', ar: 'نطاق حماية/خطر (Buffer & Multi-Ring)', en: 'Geoprocessing: Buffer / Multi-Ring' },
        { act: 'gis_range_rings', ar: 'دوائر المدى والاتجاهات (Range Rings)', en: 'Geoprocessing: Range Rings & Spider' },
        { act: 'tool:gis_viewshed', ar: 'تحليل خط الرؤية (2D Viewshed)', en: 'Spatial Analysis: 2D Viewshed' },
        { act: 'gis_heatmap', ar: 'خريطة الكثافة الحرارية (Heatmap)', en: 'Spatial Analysis: Toggle Heatmap' },
        { act: 'gis_nearest', ar: 'أقرب مخرج / مصفوفة الإخلاء (Nearest)', en: 'Spatial Analysis: Nearest Exit Matrix' },
        { act: 'gis_spatial_query', ar: 'استعلام مكاني ووصفي (Spatial Query)', en: 'Select by Location / Attributes' }
      ]
    },
    {
      id: 'geoterra', ar: 'GeoTerra', en: 'GeoTerra',
      items: [
        { act: 'open_gt_panel', ar: 'فتح لوحة GeoTerra الكاملة', en: 'Open GeoTerra Workspace Panel' },
        { sep: true },
        { act: 'tool:gt_boundary', ar: 'رسم حدود القرية وتقسيم القطاعات (A1..F4)', en: 'Village Boundary & Sector Grid' },
        { act: 'tool:gt_survey', ar: 'تعليم معلم ميداني (REM / REP / MOD / ADD)', en: 'Mark Field Feature (REM/REP/MOD/ADD)' },
        { act: 'tool:gt_georef', ar: 'ربط الخريطة بالـ GPS (GCPs)', en: 'Georeference Map (GCP Mode)' },
        { sep: true },
        { act: 'gt_gps_toggle', ar: 'تفعيل / إيقاف تتبع GPS الحي + التشخيص', en: 'Toggle Live GPS + Diagnostics' },
        { act: 'gt_gps_drift', ar: 'تصحيح إزاحة وتشويش GPS (1-Pt Drift Fix)', en: 'Calibrate GPS Drift Offset Here' },
        { act: 'gt_gps_track', ar: 'تسجيل مسار الحركة (Breadcrumb Track)', en: 'Toggle GPS Breadcrumb Track' },
        { act: 'gt_compass_toggle', ar: 'تفعيل / إيقاف البوصلة الحية', en: 'Toggle Live Compass HUD' },
        { sep: true },
        { act: 'export_gt_refsheet', ar: 'تصدير اللوحة المرجعية (AI Reference PNG)', en: 'Export AI Reference Sheet PNG' },
        { act: 'export_gt_zip', ar: 'تصدير حزمة الذكاء الاصطناعي الكاملة (ZIP)', en: 'Export Full AI Package (ZIP)' }
      ]
    },
    {
      id: 'cad3d', ar: '3D/CAD', en: '3D & CAD',
      items: [
        { act: 'sync_cad_north', ar: 'مزامنة الشمال مع AJ-GeoCAD', en: 'Sync True North from AJ-GeoCAD' },
        { act: 'push_gis_to_cad', ar: 'إرسال المضلعات المرسومة إلى 2D CAD', en: 'Push Drawn Polygons to 2D CAD' },
        { sep: true },
        { act: 'send_to_3d', ar: 'إرسال الخريطة النظيفة إلى محرك البناء 3D', en: 'Send Master Clean Map to 3D Engine' },
        { act: 'back_to_cad', ar: 'العودة إلى AJ-GeoCAD الرئيسي', en: 'Back to Main AJ-GeoCAD Workspace' }
      ]
    }
  ];

  // =========================================================================
  // 6. COMPLETE CYBER HUD + DAYLIGHT + FIXED-DOCK RESPONSIVE CSS
  // =========================================================================
  function ensureCss() {
    if (document.getElementById('aj-sat-pro-css')) return;
    var st = document.createElement('style');
    st.id = 'aj-sat-pro-css';
    st.textContent =
      '.satc-pro{' +
        '--sc-bg:#080b10;--sc-panel:#0c121b;--sc-panel2:#101926;--sc-input:#06090e;' +
        '--sc-border:#15222e;--sc-border-hi:#1f3b52;--sc-green:#39ff14;--sc-green2:#00ff66;' +
        '--sc-cyan:#00e5ff;--sc-amber:#e8c84a;--sc-red:#ff3c3c;--sc-purple:#c084fc;' +
        '--sc-txt:#d9ecff;--sc-sub:#78b5a0;--sc-mut:#7c97b0;--sc-shadow:0 8px 28px rgba(0,0,0,.65);' +
        'position:fixed;inset:0;width:100%;max-width:100vw;height:100%;height:100dvh;z-index:945;' +
        'background:var(--sc-bg);color:var(--sc-txt);display:flex;flex-direction:column;' +
        'font-family:' + MONO + ';font-size:11.5px;overflow:hidden;' +
      '}' +
      'body.ui-day .satc-pro{' +
        '--sc-bg:#e5ecf3;--sc-panel:#f8fafc;--sc-panel2:#eef3f8;--sc-input:#ffffff;' +
        '--sc-border:#cbd5e1;--sc-border-hi:#64748b;--sc-green:#15803d;--sc-green2:#16a34a;' +
        '--sc-cyan:#0369a1;--sc-amber:#b45309;--sc-red:#dc2626;--sc-purple:#7e22ce;' +
        '--sc-txt:#0f172a;--sc-sub:#0f766e;--sc-mut:#475569;--sc-shadow:0 8px 24px rgba(15,23,42,.16);' +
      '}' +
      '.satc-pro.hide{display:none!important}' +
      '.satc-pro *{box-sizing:border-box}' +

      '.satc-pro .satc-menubar{display:flex;flex-wrap:wrap;align-items:center;gap:4px;min-height:36px;height:auto;padding:4px 8px;background:var(--sc-panel);border-bottom:1px solid var(--sc-border);flex-shrink:0;z-index:40;user-select:none}' +
      '.satc-pro .satc-brand{font-weight:800;font-size:11.5px;letter-spacing:.7px;white-space:nowrap;padding-inline-end:8px;margin-inline-end:4px;border-inline-end:1px solid var(--sc-border);color:var(--sc-green2)}' +
      'body.ui-day .satc-pro .satc-brand{color:#0369a1}' +
      '.satc-pro .satc-menus{display:flex;flex-wrap:wrap;align-items:center;gap:2px;overflow:visible}' +
      '.satc-pro .satc-mwrap{position:relative}' +
      '.satc-pro .satc-mbtn{background:transparent!important;border:1px solid transparent!important;color:var(--sc-txt)!important;padding:4px 8px;border-radius:4px;font-family:inherit;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;box-shadow:none!important}' +
      '.satc-pro .satc-mbtn:hover,.satc-pro .satc-mwrap.open .satc-mbtn{background:var(--sc-panel2)!important;border-color:var(--sc-border-hi)!important;color:var(--sc-cyan)!important}' +
      '.satc-pro .satc-drop{display:none;position:fixed;min-width:240px;max-width:calc(100vw - 12px);max-height:72dvh;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;background:var(--sc-panel);border:1px solid var(--sc-border-hi);border-radius:6px;padding:4px;box-shadow:var(--sc-shadow);z-index:120}' +
      '.satc-pro .satc-mwrap.open .satc-drop{display:block}' +
      '.satc-pro .satc-ditem{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 9px;border:0!important;background:transparent!important;color:var(--sc-txt)!important;border-radius:4px;font-family:inherit;font-size:11px;text-align:start;cursor:pointer;box-shadow:none!important}' +
      '.satc-pro .satc-ditem:hover{background:rgba(0,229,255,.14)!important;color:var(--sc-cyan)!important}' +
      '.satc-pro .satc-ditem.dng{color:var(--sc-red)!important}' +
      '.satc-pro .satc-ditem.dng:hover{background:rgba(255,60,60,.16)!important}' +
      '.satc-pro .satc-dkey{font-size:9.5px;color:var(--sc-mut);white-space:nowrap}' +
      '.satc-pro .satc-dsep{height:1px;background:var(--sc-border);margin:4px 3px}' +

      '.satc-pro .satc-mquick{margin-inline-start:auto;display:flex;align-items:center;gap:4px;flex-shrink:0}' +
      '.satc-pro .satc-qbtn{background:var(--sc-input)!important;border:1px solid var(--sc-border)!important;color:var(--sc-txt)!important;padding:4px 7px;border-radius:4px;font-family:inherit;font-size:11px;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;gap:4px;box-shadow:none!important}' +
      '.satc-pro .satc-qbtn:hover{border-color:var(--sc-cyan)!important;color:var(--sc-cyan)!important}' +
      '.satc-pro .satc-qbtn.on{border-color:var(--sc-green2)!important;color:var(--sc-green2)!important;background:rgba(0,255,102,.12)!important}' +
      'body.ui-day .satc-pro .satc-qbtn.on{background:#dcfce7!important}' +
      '.satc-pro .satc-qbtn.amb{border-color:var(--sc-amber)!important;color:var(--sc-amber)!important;background:rgba(232,200,74,.1)!important}' +
      'body.ui-day .satc-pro .satc-qbtn.amb{background:#fef3c7!important}' +
      '.satc-pro .satc-qbtn.dng{border-color:var(--sc-red)!important;color:var(--sc-red)!important}' +

      '.satc-pro .satc-work{flex:1 1 auto;display:flex;min-height:0;height:auto;position:relative;overflow:hidden}' +
      '.satc-pro .satc-left{display:flex;height:100%;max-height:100%;overflow:hidden;background:var(--sc-panel);border-inline-end:1px solid var(--sc-border);flex-shrink:0;z-index:25}' +
      '.satc-pro .satc-left.collapsed{display:none!important}' +
      '.satc-pro .satc-rail{width:50px;height:100%;max-height:100%;background:var(--sc-input);border-inline-end:1px solid var(--sc-border);padding:6px 4px;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;align-items:center;gap:3px;flex-shrink:0;scrollbar-width:thin}' +
      '.satc-pro .satc-rsep{width:32px;height:1px;background:var(--sc-border-hi);margin:4px 0;flex-shrink:0}' +
      '.satc-pro .satc-tbtn{width:38px;height:36px;border-radius:6px;border:1px solid transparent!important;background:transparent!important;color:var(--sc-txt)!important;cursor:pointer;display:flex;align-items:center;justify-content:center;position:relative;flex-shrink:0;padding:0;box-shadow:none!important}' +
      '.satc-pro .satc-tbtn svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.85;stroke-linecap:round;stroke-linejoin:round}' +
      '.satc-pro .satc-tbtn:hover{background:var(--sc-panel2)!important;border-color:var(--sc-cyan)!important;color:var(--sc-cyan)!important}' +
      '.satc-pro .satc-tbtn.on{background:rgba(57,255,20,.14)!important;border-color:var(--sc-green)!important;color:var(--sc-green)!important;box-shadow:0 0 8px rgba(57,255,20,.2)!important}' +
      'body.ui-day .satc-pro .satc-tbtn.on{background:#dcfce7!important;box-shadow:none!important}' +
      '.satc-pro .satc-tbtn.cat-geoterra.on{background:rgba(192,132,252,.18)!important;border-color:var(--sc-purple)!important;color:var(--sc-purple)!important;box-shadow:none!important}' +
      '.satc-pro .satc-tbtn.cat-gis.on{background:rgba(0,229,255,.15)!important;border-color:var(--sc-cyan)!important;color:var(--sc-cyan)!important;box-shadow:none!important}' +
      '.satc-pro .satc-tkey{position:absolute;bottom:1px;right:3px;font-size:8px;opacity:.65;font-weight:700}' +

      '.satc-pro .satc-lsub{width:236px;height:100%;max-height:100%;padding:8px;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;gap:8px;background:var(--sc-panel)}' +
      '.satc-pro .satc-lsub.hide-guide{display:none}' +
      '.satc-pro .satc-guide{background:var(--sc-input);border:1px solid var(--sc-border-hi);border-radius:6px;padding:8px;display:flex;flex-direction:column;gap:5px}' +
      '.satc-pro .satc-guide-hd{display:flex;align-items:center;justify-content:space-between;gap:6px}' +
      '.satc-pro .satc-guide-hd b{color:var(--sc-cyan);font-size:11.5px}' +
      '.satc-pro .satc-guide-desc{color:var(--sc-txt);font-size:11px;line-height:1.45}' +
      '.satc-pro .satc-guide-steps{margin:2px 0 0;padding-inline-start:16px;color:var(--sc-mut);font-size:10.5px;line-height:1.5}' +
      '.satc-pro .satc-guide-steps li{margin-bottom:2px}' +

      '.satc-tip{position:fixed;z-index:160;pointer-events:none;background:#0c121b;border:1px solid #00e5ff;color:#d9ecff;padding:6px 9px;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.6);max-width:240px;display:none;font-family:' + MONO + '}' +
      'body.ui-day .satc-tip{background:#ffffff;border-color:#0369a1;color:#0f172a;box-shadow:0 8px 22px rgba(15,23,42,.18)}' +
      '.satc-tip.show{display:block}' +
      '.satc-tip b{color:#00ff66;font-size:11px;display:block;margin-bottom:2px}' +
      'body.ui-day .satc-tip b{color:#15803d}' +
      '.satc-tip span{font-size:10px;opacity:.85;line-height:1.35;display:block}' +

      '.satc-lmod-bg{position:fixed;inset:0;z-index:1150;background:rgba(2,6,15,.82);display:none;align-items:center;justify-content:center;padding:12px;font-family:' + MONO + '}' +
      '.satc-lmod-bg.open{display:flex}' +
      '.satc-lmod{width:100%;max-width:420px;background:#0c121b;color:#d9ecff;border:1.5px solid #00e5ff;border-radius:8px;padding:14px;box-shadow:0 12px 32px rgba(0,0,0,.7);display:flex;flex-direction:column;gap:10px;font-size:11.5px}' +
      'body.ui-day .satc-lmod{background:#f8fafc;color:#0f172a;border-color:#0369a1}' +
      '.satc-lmod h3{margin:0;font-size:13px;color:#00e5ff;display:flex;justify-content:space-between;align-items:center}' +
      'body.ui-day .satc-lmod h3{color:#0369a1}' +
      '.satc-lrow{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 9px;background:#06090e;border:1px solid #15222e;border-radius:6px}' +
      'body.ui-day .satc-lrow{background:#ffffff;border-color:#cbd5e1}' +
      '.satc-lrow-lbl{display:flex;flex-direction:column;gap:2px}' +
      '.satc-lrow-lbl small{font-size:9.5px;opacity:.72}' +
      '.satc-lseg{display:inline-flex;gap:4px;flex-shrink:0}' +
      '.satc-lseg button,.satc-lpre button{padding:5px 9px;border-radius:4px;border:1px solid #1f3b52!important;background:#0c121b!important;color:#d9ecff!important;font-family:inherit;font-size:11px;font-weight:700;cursor:pointer;box-shadow:none!important}' +
      'body.ui-day .satc-lseg button,body.ui-day .satc-lpre button{background:#eef3f8!important;color:#0f172a!important;border-color:#94a3b8!important}' +
      '.satc-lseg button.on{border-color:#00ff66!important;color:#00ff66!important;background:rgba(0,255,102,.15)!important}' +
      'body.ui-day .satc-lseg button.on{border-color:#15803d!important;color:#15803d!important;background:#dcfce7!important}' +
      '.satc-lpre{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px}' +

      '.satc-pro .satc-center{flex:1 1 auto;display:flex;flex-direction:column;min-width:0;min-height:0;height:100%;position:relative;overflow:hidden}' +
      '.satc-pro .satc-cvwrap{flex:1 1 auto;position:relative;min-width:0;min-height:0;height:100%;overflow:hidden;background:var(--sc-input)}' +
      '#scCv{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}' +

      '.satc-pro .satc-edge-btn{position:absolute;top:50%;transform:translateY(-50%);z-index:22;width:20px;height:54px;background:var(--sc-panel)!important;border:1px solid var(--sc-border-hi)!important;color:var(--sc-cyan)!important;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:11px;padding:0;opacity:.88;box-shadow:none!important}' +
      '.satc-pro .satc-edge-btn:hover{opacity:1;border-color:var(--sc-green2)!important;color:var(--sc-green2)!important}' +
      '.satc-pro .satc-edge-btn.l{left:0;border-left:0!important;border-radius:0 6px 6px 0}' +
      '.satc-pro .satc-edge-btn.r{right:0;border-right:0!important;border-radius:6px 0 0 6px}' +

      '.satc-pro .satc-swipe{position:absolute;top:0;bottom:0;left:50%;width:3px;background:var(--sc-green);z-index:20;display:none;cursor:ew-resize;box-shadow:0 0 10px rgba(57,255,20,.6)}' +
      '.satc-pro .satc-swipe.on{display:block}' +
      '.satc-pro .satc-swipe-knob{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:30px;height:30px;border-radius:50%;background:var(--sc-panel);border:2px solid var(--sc-green);color:var(--sc-green);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;user-select:none}' +

      '.satc-pro .satc-right{width:300px;height:100%;max-height:100%;background:var(--sc-panel);border-inline-start:1px solid var(--sc-border);padding:8px;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;gap:7px;flex-shrink:0;z-index:25}' +
      '.satc-pro .satc-right.collapsed{display:none!important}' +
      '.satc-pro .satc-sec-h{margin:4px 0 2px;font-size:10px;text-transform:uppercase;letter-spacing:.8px;color:var(--sc-sub);border-bottom:1px solid var(--sc-border);padding-bottom:3px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}' +
      '.satc-pro .satc-card{background:var(--sc-input);border:1px solid var(--sc-border);border-radius:5px;padding:7px 8px;display:flex;flex-direction:column;gap:5px;font-size:11px;flex-shrink:0}' +
      '.satc-pro .satc-layer{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:5px 7px;border:1px solid var(--sc-border);border-radius:5px;background:var(--sc-input);font-size:11px;flex-shrink:0}' +
      '.satc-pro .satc-layer.off{opacity:.52}' +
      '.satc-pro .satc-eye{background:transparent!important;border:1px solid var(--sc-border-hi)!important;color:var(--sc-green2)!important;width:26px;height:24px;border-radius:4px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:12px;padding:0;flex-shrink:0;box-shadow:none!important}' +
      '.satc-pro .satc-layer.off .satc-eye{color:var(--sc-mut)!important;border-color:var(--sc-border)!important}' +
      '.satc-pro .satc-tag{font-size:9px;padding:2px 5px;border-radius:3px;border:1px solid var(--sc-border-hi);color:var(--sc-mut);white-space:nowrap}' +
      '.satc-pro .satc-tag.lk{border-color:var(--sc-amber);color:var(--sc-amber)}' +
      '.satc-pro .satc-tag.ok{border-color:var(--sc-green2);color:var(--sc-green2)}' +
      '.satc-pro .satc-tag.gis{border-color:var(--sc-cyan);color:var(--sc-cyan)}' +
      '.satc-pro .satc-tag.gt{border-color:var(--sc-purple);color:var(--sc-purple)}' +
      '.satc-pro .satc-grid2{display:grid;grid-template-columns:1fr 1fr;gap:5px}' +
      '.satc-pro .satc-alist{display:flex;flex-direction:column;gap:4px;max-height:175px;overflow-y:auto;overscroll-behavior:contain}' +
      '.satc-pro .satc-ait{display:flex;align-items:center;justify-content:space-between;gap:5px;padding:5px 6px;border:1px solid var(--sc-border);border-radius:4px;background:var(--sc-panel);cursor:pointer;font-size:11px}' +
      '.satc-pro .satc-ait.sel{border-color:var(--sc-green2);background:rgba(0,255,102,.1)}' +
      '.satc-pro .satc-ait span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}' +

      '.satc-pro .satc-bottom{height:0;overflow:hidden;background:var(--sc-panel);border-top:1px solid var(--sc-border);display:flex;flex-direction:column;transition:height .16s ease;flex-shrink:0}' +
      '.satc-pro .satc-bottom.open{height:215px}' +
      '.satc-pro .satc-btabs{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:4px 8px;background:var(--sc-panel2);border-bottom:1px solid var(--sc-border);flex-shrink:0}' +
      '.satc-pro .satc-btab{background:transparent!important;border:1px solid transparent!important;color:var(--sc-mut)!important;padding:3px 9px;border-radius:4px;font-family:inherit;font-size:10.5px;cursor:pointer;box-shadow:none!important}' +
      '.satc-pro .satc-btab.on{background:var(--sc-input)!important;border-color:var(--sc-cyan)!important;color:var(--sc-cyan)!important;font-weight:700}' +
      '.satc-pro .satc-bbody{flex:1;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:6px 8px}' +
      '.satc-pro .satc-tbl{width:100%;border-collapse:collapse;font-size:10.5px}' +
      '.satc-pro .satc-tbl th,.satc-pro .satc-tbl td{border:1px solid var(--sc-border);padding:4px 6px;text-align:start;white-space:nowrap}' +
      '.satc-pro .satc-tbl th{background:var(--sc-panel2);color:var(--sc-cyan);position:sticky;top:0;z-index:2}' +
      '.satc-pro .satc-tbl tr:hover td{background:rgba(0,229,255,.08);cursor:pointer}' +
      '.satc-pro .satc-tbl tr.sel td{background:rgba(57,255,20,.14)}' +

      '.satc-pro .satc-foot{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:4px 8px;background:var(--sc-panel);border-top:1px solid var(--sc-border);font-size:10px;flex-shrink:0}' +
      '#scStatus{flex:1 1 160px;min-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--sc-cyan)}' +
      '.satc-pro .satc-fchip{padding:2px 6px;border-radius:4px;border:1px solid var(--sc-border);background:var(--sc-input);color:var(--sc-txt);white-space:nowrap;cursor:pointer}' +
      '#scIdb{color:var(--sc-green2);white-space:nowrap}' +

      '.satc-pro.clean-mode .satc-menubar,.satc-pro.clean-mode .satc-left,.satc-pro.clean-mode .satc-right,.satc-pro.clean-mode .satc-bottom,.satc-pro.clean-mode .satc-edge-btn{display:none!important}' +
      '.satc-pro .satc-cleanbar{display:none;position:absolute;top:10px;right:10px;z-index:35;background:rgba(8,11,16,.92);border:1px solid var(--sc-cyan);border-radius:8px;padding:5px 7px;gap:5px;flex-wrap:wrap;align-items:center;box-shadow:var(--sc-shadow)}' +
      'body.ui-day .satc-pro .satc-cleanbar{background:rgba(248,250,252,.94)}' +
      '.satc-pro.clean-mode .satc-cleanbar{display:flex}' +

      '@media(max-width:980px){' +
        '.satc-pro .satc-brand{display:none}' +
        '.satc-pro .satc-menubar{flex-direction:column;align-items:stretch;gap:4px;padding:5px 6px}' +
        '.satc-pro .satc-menus{width:100%;justify-content:space-between;gap:2px}' +
        '.satc-pro .satc-mwrap{flex:1 1 auto}' +
        '.satc-pro .satc-mbtn{width:100%;padding:5px 4px;font-size:10.5px;text-align:center}' +
        '.satc-pro .satc-mquick{width:100%;margin-inline-start:0;justify-content:space-between;border-top:1px solid var(--sc-border);padding-top:4px;gap:3px}' +
        '.satc-pro .satc-qbtn{padding:5px 5px;min-height:30px;flex:1 1 auto;font-size:10.5px}' +
        '.satc-pro .satc-left{position:absolute;top:0;bottom:0;left:0;box-shadow:var(--sc-shadow);max-width:88vw}' +
        '.satc-pro .satc-right{position:absolute;top:0;bottom:0;right:0;width:min(310px,86vw);box-shadow:var(--sc-shadow)}' +
        '.satc-pro .satc-rail{width:50px}' +
        '.satc-pro .satc-tbtn{width:40px;height:38px}' +
        '.satc-pro .satc-lsub{width:min(230px,calc(88vw - 50px))}' +
        '.satc-pro .satc-bottom.open{height:40dvh}' +
        '.satc-pro .satc-edge-btn{width:24px;height:56px}' +
      '}';
    document.head.appendChild(st);
  }

  // =========================================================================
  // 7. LANGUAGE SETTINGS MODAL (SEPARATE MENUS / GUIDE / SIDEBARS CONTROLS)
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
          '<h3><span>🌐 Language Settings / إعدادات اللغة</span><button type="button" id="scLmX" style="padding:2px 7px;cursor:pointer">✕</button></h3>' +
          '<div class="satc-lpre">' +
            '<button type="button" data-lpre="all_en">All English</button>' +
            '<button type="button" data-lpre="all_ar">الكل عربي</button>' +
            '<button type="button" data-lpre="hybrid">EN + شرح عربي</button>' +
          '</div>' +
          row('menus',  'Top Menus & Quick Bar',      'لغة القوائم العلوية والقائمة السريعة') +
          row('guide',  'Tool Guide & Hover Tips',    'لغة تعليمات الأدوات والتلميحات') +
          row('panels', 'Sidebars, Layers & Panels',  'لغة الأشرطة الجانبية واللوحات') +
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
  // 8. TOP MENU BAR RENDERER & DROPDOWN CONTROLLER (DEFAULT = EN)
  // =========================================================================
  function buildMenuBar(container, opts) {
    var lang = (opts && opts.lang) || 'en';
    var langPrefs = normalizeLangPrefs(opts && opts.langPrefs ? opts.langPrefs : { menus: lang, guide: lang, panels: lang });
    var onAction = (opts && opts.onAction) || function () {};
    var openMenuId = null;

    container.innerHTML =
      '<span class="satc-brand">AJ-GeoCAD STUDIO</span>' +
      '<div class="satc-menus" id="scMenuList"></div>' +
      '<div class="satc-mquick">' +
        '<button type="button" class="satc-qbtn" id="scQLeft" title="Toggle Left Tools">◀ Tools</button>' +
        '<button type="button" class="satc-qbtn" id="scQRight" title="Toggle Right Layers">Layers ▶</button>' +
        '<button type="button" class="satc-qbtn" id="scQAttr" title="Attribute Table & History">⊞</button>' +
        '<button type="button" class="satc-qbtn" id="scQSwipe" title="Before / After Swipe">◧</button>' +
        '<button type="button" class="satc-qbtn" id="scQClean" title="Clean Field Mode">👁</button>' +
        '<button type="button" class="satc-qbtn" id="scQTheme" title="Cyber HUD / Daylight">☀</button>' +
        '<button type="button" class="satc-qbtn" id="scQLang" title="Language Settings (Menus / Guide / Sidebars)">' + langBadgeText(langPrefs) + '</button>' +
        '<button type="button" class="satc-qbtn on" id="scQClose">CAD</button>' +
      '</div>';

    var listEl = container.querySelector('#scMenuList');

    function closeAll() {
      openMenuId = null;
      [].forEach.call(listEl.querySelectorAll('.satc-mwrap.open'), function (w) { w.classList.remove('open'); });
    }

    function positionDrop(wrap) {
      var btn = wrap.querySelector('.satc-mbtn');
      var drop = wrap.querySelector('.satc-drop');
      var r = btn.getBoundingClientRect();
      drop.style.top = Math.round(r.bottom + 3) + 'px';
      var dw = Math.min(260, window.innerWidth - 12);
      var leftPos = r.left;
      if (leftPos + dw > window.innerWidth - 6) leftPos = Math.max(6, window.innerWidth - dw - 6);
      drop.style.left = Math.round(leftPos) + 'px';
    }

    function renderMenus(curLang, allPrefs) {
      lang = curLang === 'ar' ? 'ar' : 'en';
      if (allPrefs) langPrefs = normalizeLangPrefs(allPrefs);
      else langPrefs.menus = lang;
      listEl.innerHTML = '';
      MENUS.forEach(function (m) {
        var wrap = document.createElement('div');
        wrap.className = 'satc-mwrap';
        wrap.dataset.mid = m.id;

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'satc-mbtn';
        btn.textContent = lang === 'ar' ? m.ar : m.en;

        var drop = document.createElement('div');
        drop.className = 'satc-drop';
        drop.dir = lang === 'ar' ? 'rtl' : 'ltr';
        m.items.forEach(function (it) {
          if (it.sep) {
            var sep = document.createElement('div');
            sep.className = 'satc-dsep';
            drop.appendChild(sep);
            return;
          }
          var ib = document.createElement('button');
          ib.type = 'button';
          ib.className = 'satc-ditem' + (it.danger ? ' dng' : '');
          ib.innerHTML = '<span>' + (lang === 'ar' ? it.ar : it.en) + '</span>' +
            (it.k ? ('<span class="satc-dkey">' + it.k + '</span>') : '');
          ib.onclick = function (ev) {
            ev.stopPropagation();
            closeAll();
            onAction(it.act);
          };
          drop.appendChild(ib);
        });

        btn.onclick = function (ev) {
          ev.stopPropagation();
          var wasOpen = wrap.classList.contains('open');
          closeAll();
          if (!wasOpen) {
            wrap.classList.add('open');
            positionDrop(wrap);
            openMenuId = m.id;
          }
        };
        btn.onmouseenter = function () {
          if (openMenuId && openMenuId !== m.id) {
            closeAll();
            wrap.classList.add('open');
            positionDrop(wrap);
            openMenuId = m.id;
          }
        };

        wrap.appendChild(btn);
        wrap.appendChild(drop);
        listEl.appendChild(wrap);
      });
      var qL = container.querySelector('#scQLeft');
      var qR = container.querySelector('#scQRight');
      var langBtn = container.querySelector('#scQLang');
      if (qL) qL.textContent = lang === 'ar' ? '◀ الأدوات' : '◀ Tools';
      if (qR) qR.textContent = lang === 'ar' ? 'الطبقات ▶' : 'Layers ▶';
      if (langBtn) langBtn.textContent = langBadgeText(langPrefs);
    }

    document.addEventListener('click', closeAll);

    container.querySelector('#scQLeft').onclick = function () { onAction('toggle_left'); };
    container.querySelector('#scQRight').onclick = function () { onAction('toggle_right'); };
    container.querySelector('#scQAttr').onclick = function () { onAction('toggle_bottom_attr'); };
    container.querySelector('#scQSwipe').onclick = function () { onAction('toggle_swipe'); };
    container.querySelector('#scQClean').onclick = function () { onAction('toggle_clean'); };
    container.querySelector('#scQTheme').onclick = function () { onAction('toggle_theme'); };
    container.querySelector('#scQLang').onclick = function () { onAction('open_lang_settings'); };
    container.querySelector('#scQClose').onclick = function () { onAction('back_to_cad'); };

    renderMenus(lang, langPrefs);
    return { setLang: renderMenus, closeAll: closeAll };
  }

  // =========================================================================
  // 9. LEFT PHOTOSHOP ICON RAIL + HOVER TOOLTIP + LIVE TOOL GUIDE (DEFAULT=EN)
  // =========================================================================
  function ensureTooltipEl() {
    var el = document.getElementById('scHoverTip');
    if (!el) {
      el = document.createElement('div');
      el.id = 'scHoverTip';
      el.className = 'satc-tip';
      el.dataset.ajDone = '1';
      document.body.appendChild(el);
    }
    return el;
  }

  function buildLeftIconRail(railEl, opts) {
    var lang = (opts && opts.lang) || 'en';
    var onSelectTool = (opts && opts.onSelectTool) || function () {};
    var onHoverTool = (opts && opts.onHoverTool) || function () {};
    var tipEl = ensureTooltipEl();

    function showTip(btn, tid) {
      var doc = TOOL_DOCS[tid];
      if (!doc) return;
      var info = doc[lang] || doc.en;
      tipEl.dir = lang === 'ar' ? 'rtl' : 'ltr';
      tipEl.innerHTML = '<b>' + info.name + (doc.key ? ' [' + doc.key + ']' : '') + '</b><span>' + info.desc + '</span>';
      tipEl.classList.add('show');
      var r = btn.getBoundingClientRect();
      var x = r.right + 8;
      if (x + 245 > window.innerWidth) x = Math.max(8, r.left - 248);
      var y = Math.min(window.innerHeight - 90, Math.max(40, r.top));
      tipEl.style.left = Math.round(x) + 'px';
      tipEl.style.top = Math.round(y) + 'px';
    }

    function hideTip() { tipEl.classList.remove('show'); }

    function render(activeTool, curLang) {
      if (curLang) lang = curLang === 'ar' ? 'ar' : 'en';
      railEl.innerHTML = '';
      TOOL_GROUPS.forEach(function (grp, gIdx) {
        if (gIdx > 0) {
          var sp = document.createElement('div');
          sp.className = 'satc-rsep';
          railEl.appendChild(sp);
        }
        grp.tools.forEach(function (tid) {
          var doc = TOOL_DOCS[tid];
          if (!doc) return;
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.dataset.sctool = tid;
          btn.className = 'satc-tbtn cat-' + doc.cat + (tid === activeTool ? ' on' : '');
          btn.innerHTML = (ICONS[tid] || ICONS.select) + (doc.key ? ('<span class="satc-tkey">' + doc.key + '</span>') : '');
          btn.onclick = function () { hideTip(); onSelectTool(tid); };
          btn.onmouseenter = function () { showTip(btn, tid); onHoverTool(tid); };
          btn.onmouseleave = function () { hideTip(); onHoverTool(null); };
          railEl.appendChild(btn);
        });
      });
    }

    function setActive(tid) {
      [].forEach.call(railEl.querySelectorAll('[data-sctool]'), function (b) {
        b.classList.toggle('on', b.dataset.sctool === tid);
      });
    }

    render('select', lang);
    return { render: render, setActive: setActive, hideTip: hideTip };
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
  // 10. COLLAPSIBLE DOCKS, SWIPE SLIDER, CLEAN MODE & BOTTOM DRAWER
  // =========================================================================
  function createWorkspaceController(rootEl, opts) {
    var onResize = (opts && opts.onResize) || function () {};
    var onSwipeChange = (opts && opts.onSwipeChange) || function () {};

    var leftEl = rootEl.querySelector('.satc-left');
    var rightEl = rootEl.querySelector('.satc-right');
    var bottomEl = rootEl.querySelector('.satc-bottom');
    var swipeEl = rootEl.querySelector('.satc-swipe');
    var edgeL = rootEl.querySelector('.satc-edge-btn.l');
    var edgeR = rootEl.querySelector('.satc-edge-btn.r');

    var isCompact = window.innerWidth <= 980;
    var state = {
      leftOpen: !isCompact,
      rightOpen: window.innerWidth > 1024,
      bottomOpen: false,
      bottomTab: 'attr',
      cleanMode: false,
      swipeActive: false,
      swipeRatio: 0.5
    };

    function applyState() {
      if (leftEl) leftEl.classList.toggle('collapsed', !state.leftOpen);
      if (rightEl) rightEl.classList.toggle('collapsed', !state.rightOpen);
      if (bottomEl) bottomEl.classList.toggle('open', state.bottomOpen);
      rootEl.classList.toggle('clean-mode', state.cleanMode);
      if (swipeEl) {
        swipeEl.classList.toggle('on', state.swipeActive);
        swipeEl.style.left = (state.swipeRatio * 100).toFixed(2) + '%';
      }
      if (edgeL) edgeL.textContent = state.leftOpen ? '◀' : '▶';
      if (edgeR) edgeR.textContent = state.rightOpen ? '▶' : '◀';
      var qL = rootEl.querySelector('#scQLeft');
      var qR = rootEl.querySelector('#scQRight');
      var qA = rootEl.querySelector('#scQAttr');
      var qS = rootEl.querySelector('#scQSwipe');
      var qC = rootEl.querySelector('#scQClean');
      if (qL) qL.classList.toggle('on', state.leftOpen);
      if (qR) qR.classList.toggle('on', state.rightOpen);
      if (qA) qA.classList.toggle('on', state.bottomOpen);
      if (qS) qS.classList.toggle('on', state.swipeActive);
      if (qC) qC.classList.toggle('amb', state.cleanMode);
      setTimeout(onResize, 40);
    }

    if (edgeL) edgeL.onclick = function () {
      state.leftOpen = !state.leftOpen;
      if (window.innerWidth <= 980 && state.leftOpen) state.rightOpen = false;
      applyState();
    };
    if (edgeR) edgeR.onclick = function () {
      state.rightOpen = !state.rightOpen;
      if (window.innerWidth <= 980 && state.rightOpen) state.leftOpen = false;
      applyState();
    };

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
      toggleLeft: function (force) {
        state.leftOpen = typeof force === 'boolean' ? force : !state.leftOpen;
        if (window.innerWidth <= 980 && state.leftOpen) state.rightOpen = false;
        applyState();
      },
      toggleRight: function (force) {
        state.rightOpen = typeof force === 'boolean' ? force : !state.rightOpen;
        if (window.innerWidth <= 980 && state.rightOpen) state.leftOpen = false;
        applyState();
      },
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
    TOOL_GROUPS: TOOL_GROUPS,
    TOOL_DOCS: TOOL_DOCS,
    MENUS: MENUS,
    PANEL_I18N: PANEL_I18N,
    normalizeLangPrefs: normalizeLangPrefs,
    loadLangPrefs: loadLangPrefs,
    saveLangPrefs: saveLangPrefs,
    applyPanelLang: applyPanelLang,
    openLangSettingsModal: openLangSettingsModal,
    ensureCss: ensureCss,
    buildMenuBar: buildMenuBar,
    buildLeftIconRail: buildLeftIconRail,
    updateToolGuide: updateToolGuide,
    createWorkspaceController: createWorkspaceController
  };
})(window.SOS);
