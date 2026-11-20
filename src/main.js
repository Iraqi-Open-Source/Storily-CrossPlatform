import './style.css';
import { bakeEdit, bindStudio, freshEdit, studioAction, studioInput, studioKey, studioMarkup, unbindStudio } from './studio.js';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { documentDir, join } from '@tauri-apps/api/path';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { PDFDocument } from 'pdf-lib';

const $ = (s, root = document) => root.querySelector(s);
const esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const svgPaths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  images: '<rect x="8" y="3" width="13" height="16" rx="2"/><path d="M3 8v11a2 2 0 0 0 2 2h11"/><circle cx="12" cy="8" r="1"/><path d="m9 16 3-3 3 3 2-2 4 4"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  settings: '<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-2.12 2.12-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.52V21h-3v-.09a1.65 1.65 0 0 0-1-1.52 1.65 1.65 0 0 0-1.82.33l-.06.06-2.12-2.12.06-.06A1.65 1.65 0 0 0 7 15.79a1.65 1.65 0 0 0-1.52-1H5v-3h.09a1.65 1.65 0 0 0 1.52-1A1.65 1.65 0 0 0 6.28 9l-.06-.06L8.34 6.8l.06.06a1.65 1.65 0 0 0 1.82.33 1.65 1.65 0 0 0 1-1.52V5h3v.09a1.65 1.65 0 0 0 1 1.52 1.65 1.65 0 0 0 1.82-.33l.06-.06 2.12 2.12-.06.06A1.65 1.65 0 0 0 18.79 10a1.65 1.65 0 0 0 1.52 1H21v3h-.09A1.65 1.65 0 0 0 19.4 15z"/>',
  upload: '<path d="M12 16V3m0 0L7 8m5-5 5 5"/><path d="M3 16v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/>',
  download: '<path d="M12 3v13m0 0 5-5m-5 5-5-5M3 17v3h18v-3"/>',
  dots: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>', heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',
  pencil: '<path d="m4 20 5-.9L20 7a2 2 0 0 0-3-3L5 16z"/>',
  trash: '<path d="M4 7h16M10 3h4m-8 4 1 14h10l1-14M10 11v6m4-6v6"/>',
  arrow: '<path d="m9 18 6-6-6-6"/>', moon: '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4"/>',
  sparkle: '<path d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', back: '<path d="m15 18-6-6 6-6"/>',
  check: '<path d="m5 12 5 5L20 7"/>', calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
  filter: '<path d="M4 5h16M7 12h10m-7 7h4"/>', list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18m-9-9c-5 6-5 12 0 18m0-18c5 6 5 12 0 18"/>',
  edit: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m7 16 8-8 2 2-8 8-3 1z"/>',
  rotate: '<path d="M4 12a8 8 0 1 0 2-5m-2-5v5h5"/>',
  grip: '<circle cx="9" cy="7" r="1.2"/><circle cx="15" cy="7" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="17" r="1.2"/><circle cx="15" cy="17" r="1.2"/>',
  crop: '<path d="M6 3v12a3 3 0 0 0 3 3h12"/><path d="M18 21V9a3 3 0 0 0-3-3H3"/>',
  emoji: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
  expand: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 1 1 0 12h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 1 0 0 12h3"/>',
};
const icon = (name, size = 19) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${svgPaths[name] || svgPaths.image}</svg>`;

const en = {
  all: 'Your library', albums: 'Albums', favorites: 'Favorites', settings: 'Settings', addAlbum: 'New album', importAlbum: 'Import album',
  homeTitle: 'Memories worth keeping.', homeDesc: 'A beautiful home for the moments that matter. Create an album and start your collection.',
  createFirst: 'Create your first album', photos: 'Photos', addPhotos: 'Add photos', exportPdf: 'Export PDF', exportAlbum: 'Export .storily',
  library: 'My collection', search: 'Search photos, places, tags...', sortNewest: 'Newest first', sortOldest: 'Oldest first', sortName: 'Name A–Z',
  noPhotos: 'Your story starts here', noPhotosDesc: 'Add your favorite images to fill this album with memories.',
  open: 'Open', edit: 'Edit', details: 'Details', title: 'Title', description: 'Description', location: 'Location', date: 'Date', tags: 'Tags (comma separated)',
  previewExport: 'Preview export', previewExportNote: 'This is how the PDF pages will look. Nothing is saved.', showDate: 'Show date on PDF', showPageCount: 'Show page count', alignment: 'Text alignment',
  save: 'Save changes', cancel: 'Cancel', delete: 'Delete', renameAlbum: 'Album details', removeAlbum: 'Delete album', confirmDelete: 'This cannot be undone. Continue?',
  import: 'Import', export: 'Export', language: 'Language', appearance: 'Appearance', pdfStyle: 'PDF presentation', fontSize: 'PDF font size',
  fontFamily: 'PDF font', fontColor: 'PDF text color', light: 'Light', dark: 'Dark', stylePoster: 'Poster', styleModern: 'Modern', styleClassic: 'Classic', styleVintage: 'Vintage',
  styleArtistic: 'Artistic', styleMinimal: 'Minimal', mainSettings: 'Preferences', albumName: 'Album name', create: 'Create album',
  imageEditor: 'Image studio', filter: 'Filter', crop: 'Crop', rotation: 'Rotate', emoji: 'Emoji', applyEdit: 'Apply to image',
  editMode: 'Edit', previewMode: 'Preview', adjust: 'Adjust', upscale: 'Upscale',
  brightness: 'Brightness', contrast: 'Contrast', saturation: 'Saturation', vignette: 'Vignette',
  monochrome: 'Monochrome', sepia: 'Sepia', vibrance: 'Vibrance', warm: 'Warm', cool: 'Cool', fade: 'Fade',
  noir: 'Noir', vintage: 'Vintage', dramatic: 'Dramatic', soft: 'Soft', vivid: 'Vivid', matte: 'Matte',
  golden: 'Golden', rose: 'Rose', arctic: 'Arctic', emerald: 'Emerald', film: 'Film',
  freeCrop: 'Free', square: '1:1', ratio43: '4:3', ratio34: '3:4', ratio169: '16:9', ratio916: '9:16',
  undo: 'Undo', redo: 'Redo', resetEdits: 'Reset', compare: 'Compare', compareHold: 'Hold to see the original', original: 'Original',
  addText: 'Add text', textPlaceholder: 'A short caption', stickerSize: 'Size', stickerRotate: 'Rotate', stickerColor: 'Color', removeSticker: 'Remove',
  rotateLeft: 'Rotate left', rotateRight: 'Rotate right', flipHorizontal: 'Flip horizontal', flipVertical: 'Flip vertical',
  upscaleNote: 'Enlarges the cropped photo and sharpens it. This is not an AI model. Very large results are capped so the file stays within the app limit.',
  hintCrop: 'Drag inside the box to move it. Drag a corner or edge to resize. Everything outside the box is removed.',
  hintFilter: 'Choose a look. Brightness, color, and corner darkening stay on Adjust.',
  hintEmoji: 'Add an emoji or a short caption, then drag it. Rotate turns the selected one. Arrow keys nudge it.',
  hintAdjust: 'These sliders stack on top of the selected filter. Vignette darkens the corners.',
  hintRotate: 'Turn or mirror the photo. The crop and stickers follow the picture.',
  hintUpscale: 'Choose how large the saved image should be. The stage stays the same size; the output size is shown on the photo.',
  hintPreview: 'This is the PDF page: the photo, with its description, location, and date.',
  savingImage: 'Saving image…', imageUpdated: 'Image updated.',
  ready: 'All changes saved locally', chooseAlbum: 'Select an album', dragHere: 'Drop images to add them to this album',
  recent: 'Recently added', count: 'total photos', favorite: 'Favorite', none: 'None',
  pdfDefaultsNote: 'These are the defaults. Each album can keep its own PDF settings.',
  pdfAlbumNote: 'Use the app default, or save PDF settings for this album only.',
  useDefault: 'Use default', customAlbum: 'Custom for this album', pdfForAlbum: 'PDF settings',
  sortManual: 'Custom order', reorder: 'Reorder', pdfPreview: 'Preview', backPage: 'Previous page', nextPage: 'Next page',
  savedTo: 'Saved to', creatingPdf: 'Creating PDF…',
};
const ar = {
  all: 'مكتبتي', albums: 'الألبومات', favorites: 'المفضلة', settings: 'الإعدادات', addAlbum: 'ألبوم جديد', importAlbum: 'استيراد ألبوم',
  homeTitle: 'ذكريات تستحق الاحتفاظ بها.', homeDesc: 'مكان جميل للحظات المهمة. أنشئ ألبومك الأول وابدأ بتنظيم صورك.',
  createFirst: 'إنشاء أول ألبوم', photos: 'الصور', addPhotos: 'إضافة صور', exportPdf: 'تصدير PDF', exportAlbum: 'تصدير .storily',
  library: 'مجموعتي', search: 'بحث في الصور والأماكن والوسوم...', sortNewest: 'الأحدث أولاً', sortOldest: 'الأقدم أولاً', sortName: 'حسب الاسم',
  noPhotos: 'قصتك تبدأ هنا', noPhotosDesc: 'أضف صورك المفضلة لتملأ هذا الألبوم بالذكريات.',
  open: 'فتح', edit: 'تعديل', details: 'التفاصيل', title: 'العنوان', description: 'الوصف', location: 'الموقع', date: 'التاريخ', tags: 'الوسوم (مفصولة بفواصل)',
  previewExport: 'معاينة التصدير', previewExportNote: 'هكذا ستبدو صفحات PDF. لن يُحفظ أي ملف.', showDate: 'إظهار التاريخ في PDF', showPageCount: 'إظهار رقم الصفحة', alignment: 'محاذاة النص',
  save: 'حفظ التعديلات', cancel: 'إلغاء', delete: 'حذف', renameAlbum: 'تفاصيل الألبوم', removeAlbum: 'حذف الألبوم', confirmDelete: 'لا يمكن التراجع عن هذا الإجراء. هل تريد المتابعة؟',
  import: 'استيراد', export: 'تصدير', language: 'اللغة', appearance: 'المظهر', pdfStyle: 'نمط ملف PDF', fontSize: 'حجم خط PDF',
  fontFamily: 'خط PDF', fontColor: 'لون نص PDF', light: 'فاتح', dark: 'داكن', stylePoster: 'ملصق', styleModern: 'عصري', styleClassic: 'كلاسيكي', styleVintage: 'قديم',
  styleArtistic: 'فني', styleMinimal: 'بسيط', mainSettings: 'التفضيلات', albumName: 'اسم الألبوم', create: 'إنشاء ألبوم',
  imageEditor: 'استوديو الصور', filter: 'تأثير', crop: 'قص', rotation: 'تدوير', emoji: 'رمز', applyEdit: 'تطبيق على الصورة',
  editMode: 'تعديل', previewMode: 'معاينة', adjust: 'ضبط', upscale: 'تكبير',
  brightness: 'السطوع', contrast: 'التباين', saturation: 'التشبع', vignette: 'تعتيم الحواف',
  monochrome: 'أبيض وأسود', sepia: 'بني دافئ', vibrance: 'حيوية', warm: 'دافئ', cool: 'بارد', fade: 'باهت',
  noir: 'نوار', vintage: 'عتيق', dramatic: 'درامي', soft: 'ناعم', vivid: 'زاهٍ', matte: 'مطفي',
  golden: 'ذهبي', rose: 'وردي', arctic: 'قطبي', emerald: 'زمردي', film: 'فيلم',
  freeCrop: 'حر', square: '1:1', ratio43: '4:3', ratio34: '3:4', ratio169: '16:9', ratio916: '9:16',
  undo: 'تراجع', redo: 'إعادة', resetEdits: 'إعادة ضبط', compare: 'مقارنة', compareHold: 'اضغط لرؤية الصورة الأصلية', original: 'الأصلية',
  addText: 'إضافة نص', textPlaceholder: 'عبارة قصيرة', stickerSize: 'الحجم', stickerRotate: 'تدوير', stickerColor: 'اللون', removeSticker: 'إزالة',
  rotateLeft: 'تدوير لليسار', rotateRight: 'تدوير لليمين', flipHorizontal: 'قلب أفقي', flipVertical: 'قلب عمودي',
  upscaleNote: 'يكبّر الجزء المقصوص ويزيد حدته. هذا ليس تكبيراً بالذكاء الاصطناعي. النتائج الكبيرة جداً تُحد حتى يبقى الملف ضمن حد التطبيق.',
  hintCrop: 'اسحب داخل الإطار لتحريكه، واسحب الزوايا أو الأطراف لتغيير الحجم. ما خارج الإطار يُحذف.',
  hintFilter: 'اختر مظهراً. السطوع واللون وتعتيم الحواف تبقى في الضبط.',
  hintEmoji: 'أضف رمزاً أو عبارة قصيرة ثم اسحبها. التدوير يدير العنصر المحدد، ومفاتيح الأسهم تحرّكه.',
  hintAdjust: 'هذه المؤشرات تُضاف فوق المؤثر المختار. تعتيم الحواف يغمّق الأطراف.',
  hintRotate: 'دوّر الصورة أو اعكسها. القص والملصقات تتبع الصورة.',
  hintUpscale: 'اختر حجم الصورة عند الحفظ. مساحة العمل تبقى بنفس الحجم، والحجم النهائي يظهر على الصورة.',
  hintPreview: 'هذه صفحة PDF: الصورة مع الوصف والموقع والتاريخ.',
  savingImage: 'جارٍ حفظ الصورة…', imageUpdated: 'تم تحديث الصورة.',
  ready: 'التغييرات محفوظة محلياً', chooseAlbum: 'اختر ألبوماً', dragHere: 'أفلت الصور هنا لإضافتها إلى الألبوم',
  recent: 'المضافة مؤخراً', count: 'إجمالي الصور', favorite: 'مفضلة', none: 'بدون',
  pdfDefaultsNote: 'هذه الإعدادات الافتراضية. يمكن لكل ألبوم الاحتفاظ بإعدادات PDF خاصة.',
  pdfAlbumNote: 'استخدم الإعداد الافتراضي، أو احفظ إعدادات PDF لهذا الألبوم فقط.',
  useDefault: 'استخدام الافتراضي', customAlbum: 'مخصص لهذا الألبوم', pdfForAlbum: 'إعدادات PDF',
  sortManual: 'ترتيب مخصص', reorder: 'إعادة الترتيب', pdfPreview: 'معاينة', backPage: 'الصفحة السابقة', nextPage: 'الصفحة التالية',
  savedTo: 'تم الحفظ في', creatingPdf: 'جارٍ إنشاء PDF…',
};
const defaultPrefs = { lang: 'en', theme: 'light', pdfStyle: 'poster', fontSize: 16, fontFamily: 'Arial, sans-serif', fontColor: '#222036', showPageCount: true };
function readPrefs() { try { return { ...defaultPrefs, ...JSON.parse(localStorage.getItem('storily-prefs') || '{}') }; } catch { return { ...defaultPrefs }; } }
const state = { lib: { albums: [], photos: [] }, albumId: null, photoId: null, search: '', sort: 'order', onlyFavorites: false, view: 'grid', modal: '', previewIndex: 0, editTab: 'details', mobileNav: false, busy: false, prefs: readPrefs(), edit: freshEdit(), editPast: [], editFuture: [] };
const thumbs = new Map();
const originals = new Map();
const t = key => (state.prefs.lang === 'ar' ? ar : en)[key] || key;
const album = () => state.lib.albums.find(a => a.id === state.albumId);
const photo = () => state.lib.photos.find(p => p.id === state.photoId);
const getAlbumPhotos = () => {
  let items = state.lib.photos.filter(p => state.onlyFavorites ? p.favorite : p.albumId === state.albumId);
  if (state.search.trim()) {
    const q = state.search.trim().toLowerCase();
    items = items.filter(p => [p.name, p.description, p.location, ...(p.tags || [])].some(v => String(v || '').toLowerCase().includes(q)));
  }
  if (state.sort === 'name') items.sort((a, b) => a.name.localeCompare(b.name));
  else if (state.sort === 'new') items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  else if (state.sort === 'old') items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  else items.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || b.createdAt.localeCompare(a.createdAt));
  return items;
};
const albumsSorted = () => [...state.lib.albums].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.createdAt).localeCompare(String(b.createdAt)));
const fonts = [['Arial, sans-serif', 'Arial'], ['Georgia, serif', 'Georgia'], ['Tahoma, sans-serif', 'Tahoma (Arabic)']];
const fontOptions = current => fonts.map(([value, label]) => `<option value="${value}" ${current === value ? 'selected' : ''}>${esc(label)}</option>`).join('');
const styleOptions = current => styles.map(s => `<option value="${s}" ${current === s ? 'selected' : ''}>${esc(themeLabel(s))}</option>`).join('');
function resolvePdf(a) {
  const d = state.prefs;
  const base = { style: styles.includes(d.pdfStyle) ? d.pdfStyle : 'modern', fontFamily: d.fontFamily, fontSize: Number(d.fontSize) || 16, fontColor: d.fontColor || '#222036', showPageCount: d.showPageCount !== false };
  if (!a?.pdfCustom) return base;
  return {
    style: styles.includes(a.style) ? a.style : base.style,
    fontFamily: a.pdfFontFamily || base.fontFamily,
    fontSize: Number(a.pdfFontSize) || base.fontSize,
    fontColor: a.pdfFontColor || base.fontColor,
    showPageCount: a.showPageCount !== false,
  };
}
const button = (action, text, kind = 'ghost', extra = '') => `<button type="button" class="btn btn-${kind} ${extra}" data-action="${action}">${text}</button>`;
const styles = ['poster', 'modern', 'classic', 'vintage', 'artistic', 'minimal'];
const themeLabel = s => t('style' + s.charAt(0).toUpperCase() + s.slice(1));
function pdfPreviewBlock(kind) {
  return `<div class="pdf-preview-block"><canvas data-pdf-preview="${kind}" width="238" height="337" aria-label="${esc(t('pdfPreview'))}"></canvas><div><strong class="pdf-preview-label"></strong><small>${esc(t('pdfPreview'))}</small></div></div>`;
}

function renderSidebar() {
  const nav = albumsSorted().map(a => {
    const count = state.lib.photos.filter(p => p.albumId === a.id).length;
    return `<div class="nav-row" data-drop="album" data-id="${esc(a.id)}"><button type="button" class="drag-handle" data-drag="album" data-id="${esc(a.id)}" data-action="ignore" aria-label="${esc(t('reorder'))}">${icon('grip', 14)}</button><button type="button" class="nav-entry ${state.albumId === a.id && !state.onlyFavorites ? 'active' : ''}" data-action="selectAlbum" data-id="${esc(a.id)}">${icon('folder', 18)}<span>${esc(a.title)}</span><small>${count}</small></button></div>`;
  }).join('');
  return `<aside class="sidebar ${state.mobileNav ? 'is-open' : ''}">
    <div class="brand"><img src="/original-icon.png" alt="Storily"/><div><strong>Storily</strong><span>MEMORY STUDIO</span></div></div>
    <div class="nav-group"><div class="nav-heading">WORKSPACE</div>
      <button class="nav-entry ${!state.albumId && !state.onlyFavorites ? 'active' : ''}" data-action="home">${icon('grid', 18)}<span>${esc(t('all'))}</span></button>
      <button class="nav-entry ${state.onlyFavorites ? 'active' : ''}" data-action="favorites">${icon('heart', 18)}<span>${esc(t('favorites'))}</span><small>${state.lib.photos.filter(p => p.favorite).length}</small></button></div>
    <div class="nav-group albums-group"><div class="nav-heading with-action">${esc(t('albums'))}<button aria-label="${esc(t('addAlbum'))}" data-action="newAlbum" class="icon-btn tiny">${icon('plus', 16)}</button></div>
      <div class="album-scroll">${nav || `<div class="sidebar-hint">${esc(t('chooseAlbum'))}</div>`}</div>
      <button class="sidebar-add" data-action="newAlbum">${icon('plus', 16)} ${esc(t('addAlbum'))}</button>
      <button class="sidebar-import" data-action="importAlbum">${icon('upload', 16)} ${esc(t('importAlbum'))}</button>
    </div>
    <div class="sidebar-bottom"><div class="storage-note">${icon('lock', 17)}<div><b>Private by design</b><small>Local-first • No account needed</small></div></div>
      <button class="nav-entry" data-action="settings">${icon('settings', 18)}<span>${esc(t('settings'))}</span></button></div>
  </aside>`;
}
function renderHome() {
  const count = state.lib.photos.length;
  const albumCards = albumsSorted().map(a => {
    const photos = state.lib.photos.filter(p => p.albumId === a.id).sort((x, y) => (Number(x.order) || 0) - (Number(y.order) || 0) || y.createdAt.localeCompare(x.createdAt));
    const covers = photos.slice(0, 4).map(p => `<img data-thumb="${p.id}" alt=""/>`).join('');
    return `<article class="album-card" data-drop="album" data-id="${esc(a.id)}"><button type="button" class="drag-handle" data-drag="album" data-id="${esc(a.id)}" data-action="ignore" aria-label="${esc(t('reorder'))}">${icon('grip', 15)}</button><button type="button" class="album-hit" data-action="selectAlbum" data-id="${esc(a.id)}"><div class="album-cover">${covers || `<span>${icon('images', 40)}</span>`}</div><div class="album-card-caption"><div class="album-name-row"><strong>${esc(a.title)}</strong></div><small>${photos.length} ${esc(t('photos'))}</small>${icon('arrow', 17)}</div></button></article>`;
  }).join('');
  return `<div class="home-view"><section class="hero"><div class="hero-text"><div class="eyebrow">✦ YOUR PERSONAL MEMORY SPACE</div><h1>${esc(t('homeTitle'))}</h1><p>${esc(t('homeDesc'))}</p><div class="hero-actions">${button('newAlbum', `${icon('plus')} ${esc(t('addAlbum'))}`, 'primary')}${button('importAlbum', `${icon('upload')} ${esc(t('importAlbum'))}`, 'outline')}</div></div><div class="hero-art"><div class="art-circle a"></div><div class="art-circle b"></div><div class="art-icon">${icon('images', 88)}</div><div class="hero-sparkle">✧</div></div></section>
    <section class="stats-line"><div class="stat"><span>${icon('folder')}</span><b>${state.lib.albums.length}</b><small>${esc(t('albums'))}</small></div><div class="stat"><span>${icon('image')}</span><b>${count}</b><small>${esc(t('photos'))}</small></div><div class="stat"><span>${icon('heart')}</span><b>${state.lib.photos.filter(p => p.favorite).length}</b><small>${esc(t('favorites'))}</small></div></section>
    <div class="section-head"><div><span class="eyebrow dark">CURATED COLLECTIONS</span><h2>${esc(t('albums'))}</h2></div>${button('newAlbum', `${icon('plus', 17)} ${esc(t('addAlbum'))}`, 'outline')}</div>
    <div class="album-grid">${albumCards || `<div class="blank-state compact">${icon('folder', 42)}<h3>${esc(t('homeTitle'))}</h3>${button('newAlbum', esc(t('createFirst')), 'primary')}</div>`}</div>
  </div>`;
}
function clipText(value, limit = 48) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  const chars = [...text];
  if (chars.length <= limit) return text;
  return `${chars.slice(0, limit).join('').trimEnd()}…`;
}
function photoDateLabel(p) {
  const taken = String(p.takenAt || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(taken)) return taken;
  if (!p.createdAt) return '';
  const created = new Date(p.createdAt);
  return Number.isNaN(created.getTime()) ? '' : created.toLocaleDateString();
}
function photoCardMeta(p) {
  const description = String(p.description || '').replace(/\s+/g, ' ').trim();
  const location = String(p.location || '').trim();
  const date = photoDateLabel(p);
  const desc = description ? `<strong dir="auto" title="${esc(description)}">${esc(clipText(description))}</strong>` : '';
  const place = location ? `<span class="place" dir="auto">${esc(location)}</span>` : '';
  const when = date ? `<time${/^\d{4}-\d{2}-\d{2}$/.test(date) ? ` datetime="${esc(date)}"` : ''}>${esc(date)}</time>` : '';
  const sep = place && when ? '<span class="dot" aria-hidden="true">•</span>' : '';
  const meta = place || when ? `<span class="photo-meta">${place}${sep}${when}</span>` : '';
  return `${desc}${meta}`;
}
function renderGallery() {
  const active = album();
  const items = getAlbumPhotos();
  const name = state.onlyFavorites ? t('favorites') : active?.title || t('photos');
  const desc = state.onlyFavorites ? 'A collection of all the photos you love' : active?.description || 'Every little moment tells a story.';
  const canReorder = !state.onlyFavorites && !state.search.trim();
  const controls = state.onlyFavorites ? '' : `<div class="gallery-actions">${button('addPhotos', `${icon('plus')} ${esc(t('addPhotos'))}`, 'primary')}${button('exportPdf', `${icon('download')} ${esc(t('exportPdf'))}`, 'outline')}${button('exportAlbum', `${icon('folder')} .storily`, 'outline')}${button('previewExport', `${icon('eye')} ${esc(t('previewExport'))}`, 'outline')}${button('albumDetails', icon('dots'), 'outline', 'square')}</div>`;
  const cards = items.map(p => `<article class="photo-card ${state.view === 'list' ? 'list-item' : ''}" data-action="openPhoto" data-id="${esc(p.id)}" ${canReorder ? 'data-drop="photo"' : ''}><div class="photo-preview">${canReorder ? `<button type="button" class="drag-handle" data-drag="photo" data-id="${esc(p.id)}" data-action="ignore" aria-label="${esc(t('reorder'))}">${icon('grip', 14)}</button>` : ''}<img data-thumb="${p.id}" alt="${esc(p.name)}" draggable="false" loading="lazy"/>${p.favorite ? `<span class="fav-heart">${icon('heart', 14)}</span>` : ''}</div><div class="photo-info">${photoCardMeta(p)}</div></article>`).join('');
  return `<div class="gallery"><div class="crumb">${esc(t('library'))} <span>/</span> ${esc(name)}</div><div class="gallery-title"><div><span class="eyebrow dark">THE MOMENTS YOU LOVE</span><h1>${esc(name)}</h1><p>${esc(desc)}</p></div>${controls}</div>
    <div class="gallery-toolbar"><div class="search-box">${icon('search', 18)}<input id="search" placeholder="${esc(t('search'))}" value="${esc(state.search)}"/></div><div class="tools-right"><span class="count-label">${items.length} ${esc(t('photos'))}</span><select id="sort" aria-label="Sort"><option value="order" ${state.sort === 'order' ? 'selected' : ''}>${esc(t('sortManual'))}</option><option value="new" ${state.sort === 'new' ? 'selected' : ''}>${esc(t('sortNewest'))}</option><option value="old" ${state.sort === 'old' ? 'selected' : ''}>${esc(t('sortOldest'))}</option><option value="name" ${state.sort === 'name' ? 'selected' : ''}>${esc(t('sortName'))}</option></select><button class="icon-btn ${state.view === 'grid' ? 'pressed' : ''}" data-action="viewGrid" aria-label="Grid">${icon('grid', 19)}</button><button class="icon-btn ${state.view === 'list' ? 'pressed' : ''}" data-action="viewList" aria-label="List">${icon('list', 19)}</button></div></div>
    ${items.length ? `<div class="photo-grid ${state.view === 'list' ? 'list-view' : ''}">${cards}</div>` : `<div class="blank-state">${icon('image', 50)}<h2>${esc(t('noPhotos'))}</h2><p>${esc(t('noPhotosDesc'))}</p>${!state.onlyFavorites ? button('addPhotos', `${icon('plus')} ${esc(t('addPhotos'))}`, 'primary') : ''}</div>`}
  </div>`;
}
function renderSettings() {
  const p = state.prefs;
  return `<div class="settings-page"><div class="crumb">STORILY / ${esc(t('settings'))}</div><h1>${esc(t('mainSettings'))}</h1><p class="settings-subtitle">Customize your experience across all your devices.</p>
  <div class="pref-card"><h3>${icon('globe')} ${esc(t('language'))}</h3><div class="setting-row"><span>${esc(t('language'))}</span><select id="lang"><option value="en" ${p.lang === 'en' ? 'selected' : ''}>English</option><option value="ar" ${p.lang === 'ar' ? 'selected' : ''}>العربية</option></select></div></div>
  <div class="pref-card"><h3>${icon('sun')} ${esc(t('appearance'))}</h3><div class="setting-row"><span>${esc(t('appearance'))}</span><div class="segmented"><button class="${p.theme === 'light' ? 'selected' : ''}" data-action="themeLight">${icon('sun', 16)} ${esc(t('light'))}</button><button class="${p.theme === 'dark' ? 'selected' : ''}" data-action="themeDark">${icon('moon', 16)} ${esc(t('dark'))}</button></div></div></div>
  <div class="pref-card"><h3>${icon('download')} ${esc(t('exportPdf'))}</h3><p class="settings-hint">${esc(t('pdfDefaultsNote'))}</p><div class="setting-row"><span>${esc(t('pdfStyle'))}</span><select id="pdfStyle">${styleOptions(p.pdfStyle)}</select></div>
  <div class="setting-row"><span>${esc(t('fontFamily'))}</span><select id="fontFamily">${fontOptions(p.fontFamily)}</select></div>
  <div class="setting-row"><span>${esc(t('fontSize'))}</span><input id="fontSize" type="range" min="12" max="24" value="${p.fontSize}"/><strong>${p.fontSize}px</strong></div>
  <div class="setting-row"><span>${esc(t('fontColor'))}</span><input id="fontColor" type="color" value="${esc(p.fontColor)}"/></div>
  <div class="setting-row"><span>${esc(t('showPageCount'))}</span><input id="showPageCount" type="checkbox" ${p.showPageCount !== false ? 'checked' : ''}/></div>${pdfPreviewBlock('settings')}</div>
  <div class="privacy-note">${icon('lock')} Your albums are stored on this device. No cloud account or external service is required.</div></div>`;
}
function renderModal() {
  if (!state.modal) return '';
  if (state.modal === 'newAlbum') return `<div class="overlay" data-action="closeModal"><form class="modal small" id="newAlbumForm"><div class="modal-heading"><h2>${esc(t('addAlbum'))}</h2><button type="button" class="icon-btn" data-action="closeModal">${icon('close')}</button></div><p>Give your new collection a name.</p><label>${esc(t('albumName'))}<input name="title" required autofocus maxlength="120" placeholder="Summer memories"/></label><div class="modal-actions"><button type="button" class="btn btn-outline" data-action="closeModal">${esc(t('cancel'))}</button><button class="btn btn-primary" type="submit">${esc(t('create'))}</button></div></form></div>`;
  if (state.modal === 'albumDetails') {
    const a = album(); if (!a) return '';
    const pdf = resolvePdf(a);
    return `<div class="overlay" data-action="closeModal"><form class="modal small" id="albumForm"><div class="modal-heading"><h2>${esc(t('renameAlbum'))}</h2><button type="button" class="icon-btn" data-action="closeModal">${icon('close')}</button></div><label>${esc(t('title'))}<input name="title" required maxlength="120" value="${esc(a.title)}"/></label><label>${esc(t('description'))}<textarea name="description" rows="3">${esc(a.description)}</textarea></label><div class="pdf-mode"><span>${esc(t('pdfForAlbum'))}</span><select name="pdfMode"><option value="default" ${a.pdfCustom ? '' : 'selected'}>${esc(t('useDefault'))}</option><option value="custom" ${a.pdfCustom ? 'selected' : ''}>${esc(t('customAlbum'))}</option></select></div><p class="settings-hint">${esc(t('pdfAlbumNote'))}</p><div id="albumPdfFields" class="pdf-fields ${a.pdfCustom ? '' : 'is-disabled'}"><label>${esc(t('pdfStyle'))}<select name="pdfStyle">${styleOptions(pdf.style)}</select></label><label>${esc(t('fontFamily'))}<select name="pdfFontFamily">${fontOptions(pdf.fontFamily)}</select></label><label>${esc(t('fontSize'))}<span class="range-line"><input name="pdfFontSize" type="range" min="12" max="24" value="${pdf.fontSize}"/><strong>${pdf.fontSize}px</strong></span></label><label>${esc(t('fontColor'))}<input name="pdfFontColor" type="color" value="${esc(pdf.fontColor)}"/></label><label class="checkbox-row"><input type="checkbox" name="showPageCount" ${pdf.showPageCount !== false ? 'checked' : ''}/>${esc(t('showPageCount'))}</label></div>${pdfPreviewBlock('album')}<div class="modal-actions spread"><button type="button" class="btn btn-danger" data-action="deleteAlbum">${icon('trash', 17)} ${esc(t('removeAlbum'))}</button><button class="btn btn-primary" type="submit">${esc(t('save'))}</button></div></form></div>`;
  }
  if (state.modal === 'exportPreview') {
    const a = album(); if (!a) return '';
    const photos = exportPhotos(a);
    const index = Math.max(0, Math.min(state.previewIndex || 0, Math.max(photos.length - 1, 0)));
    const look = resolvePdf(a);
    const pageLabel = photos.length ? `${index + 1} / ${photos.length}` : '0 / 0';
    return `<div class="overlay" data-action="closeModal"><div class="modal export-preview" role="dialog" aria-modal="true" aria-labelledby="exportPreviewTitle"><div class="modal-heading"><div><h2 id="exportPreviewTitle">${esc(t('previewExport'))}</h2><p>${esc(t('previewExportNote'))}</p></div><button type="button" class="icon-btn" data-action="closeModal" aria-label="${esc(t('cancel'))}">${icon('close')}</button></div><div class="export-preview-stage"><button type="button" class="icon-btn" data-action="previewPrev" ${index <= 0 ? 'disabled' : ''} aria-label="${esc(t('backPage'))}">${icon('back')}</button><div class="export-preview-frame"><canvas id="exportPreviewCanvas" width="428" height="606" aria-label="${esc(themeLabel(look.style))}"></canvas></div><button type="button" class="icon-btn" data-action="previewNext" ${index >= photos.length - 1 ? 'disabled' : ''} aria-label="${esc(t('nextPage'))}">${icon('arrow')}</button></div><div class="export-preview-meta"><span>${esc(themeLabel(look.style))}</span><span>${esc(pageLabel)}</span></div></div></div>`;
  }
  if (state.modal === 'photo') {
    const p = photo(); if (!p) return '';
    const editing = state.editTab === 'edit';
    const mode = state.edit.mode === 'preview' ? 'preview' : 'edit';
    const tabs = `<div class="tabbar"><button type="button" class="${editing ? '' : 'on'}" data-action="tabDetails">${icon('list', 16)} ${esc(t('details'))}</button><button type="button" class="${editing ? 'on' : ''}" data-action="tabEdit">${icon('edit', 16)} ${esc(t('imageEditor'))}</button></div>`;
    const details = `<form id="photoForm"><label>${esc(t('description'))}<textarea name="description" rows="3">${esc(p.description)}</textarea></label><div class="two-fields"><label>${esc(t('location'))}<input name="location" value="${esc(p.location)}" placeholder="Baghdad, Iraq"/></label><label>${esc(t('date'))}<input name="takenAt" type="date" value="${esc((p.takenAt || '').slice(0, 10))}"/></label></div><label>${esc(t('tags'))}<input name="tags" value="${esc((p.tags || []).join(', '))}"/></label><label>${esc(t('alignment'))}<select name="textAlignment">${['left', 'center', 'right'].map(v => `<option value="${v}" ${p.textAlignment === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label class="checkbox-row"><input type="checkbox" name="showDate" ${p.showDate !== false ? 'checked' : ''} />${esc(t('showDate'))}</label><label class="checkbox-row"><input type="checkbox" name="favorite" ${p.favorite ? 'checked' : ''} />${icon('heart', 16)} ${esc(t('favorite'))}</label><div class="modal-actions spread"><button class="btn btn-danger" type="button" data-action="deletePhoto">${icon('trash', 17)} ${esc(t('delete'))}</button><button type="submit" class="btn btn-primary">${icon('check', 17)} ${esc(t('save'))}</button></div></form>`;
    const body = editing
      ? studioMarkup(t, icon, esc)
      : `<div class="large-preview"><img id="fullImage" alt="${esc(p.name)}"/><div class="preview-tag">${p.width} × ${p.height}</div></div><div class="photo-controls">${details}</div>`;
    const modes = editing ? `<div class="segmented studio-mode"><button type="button" class="${mode === 'edit' ? 'selected' : ''}" data-action="studioMode" data-mode="edit" aria-pressed="${mode === 'edit'}">${esc(t('editMode'))}</button><button type="button" class="${mode === 'preview' ? 'selected' : ''}" data-action="studioMode" data-mode="preview" aria-pressed="${mode === 'preview'}">${esc(t('previewMode'))}</button></div>` : '';
    return `<div class="overlay" data-action="closeModal"><div class="modal photo-modal ${editing ? 'is-studio' : ''}"><div class="photo-modal-head">${tabs}<div class="photo-head-actions">${modes}<button class="icon-btn" data-action="closeModal" aria-label="${esc(t('cancel'))}">${icon('close')}</button></div></div><div class="photo-modal-body">${body}</div></div></div>`;
  }
  return '';
}
function render() {
  document.documentElement.lang = state.prefs.lang;
  document.documentElement.dir = state.prefs.lang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.dataset.theme = state.prefs.theme;
  const body = state.modal === 'settings' ? renderSettings() : (!state.albumId && !state.onlyFavorites) ? renderHome() : renderGallery();
  const current = state.albumId ? album()?.title || 'Album' : state.onlyFavorites ? t('favorites') : t('all');
  $('#app').innerHTML = `<div class="shell">${renderSidebar()}<main class="main-panel"><header class="topbar"><button class="icon-btn mobile-menu" data-action="toggleNav" aria-label="Menu">${icon('menu')}</button><div class="topbar-left"><span class="topbar-dot"></span> STORILY COLLECTION <span class="topbar-separator">/</span> ${esc(current)}</div><div class="topbar-right"><span class="saved-indicator"><span></span>${esc(t('ready'))}</span><button class="icon-btn" data-action="settings" title="${esc(t('settings'))}">${icon('settings')}</button></div></header><div class="content">${body}</div></main></div>${renderModal()}<input hidden type="file" id="imagePicker" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,image/tiff" multiple/><input hidden type="file" id="albumPicker" accept=".storily,application/json"/><div id="toast" aria-live="polite"></div>${state.mobileNav ? `<button class="nav-backdrop" data-action="toggleNav" aria-label="Close navigation"></button>` : ''}`;
  loadThumbs();
  if (state.modal === 'photo' && state.editTab === 'edit') bindStudio(studioEnv());
  else { unbindStudio(); if (state.modal === 'photo') loadFullPhoto(); }
  drawPdfPreviews();
  if (state.modal === 'exportPreview') paintExportPreview();
}
function paintStudioPage(ctx, image) {
  const p = photo();
  if (!p || !image) return;
  const a = album();
  const look = resolvePdf(a);
  const photos = state.lib.photos.filter(item => item.albumId === (a?.id || p.albumId))
    .sort((x, y) => (Number(x.order) || 0) - (Number(y.order) || 0) || String(y.createdAt).localeCompare(String(x.createdAt)));
  const index = Math.max(0, photos.findIndex(item => item.id === p.id));
  ctx.save();
  ctx.direction = state.prefs.lang === 'ar' ? 'rtl' : 'ltr';
  paintPdfPage(ctx, { ...look, image, photo: p, index, total: Math.max(photos.length, 1), albumName: a?.title || '' });
  ctx.restore();
}
function studioEnv() {
  return { state, t, icon, esc, loadOriginal, report, paintStudioPage };
}
function toast(message, bad = false) {
  const el = $('#toast'); if (!el) return;
  el.textContent = String(message); el.className = bad ? 'toast-error visible' : 'visible';
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { if (el.isConnected) el.className = ''; }, 3500);
}
function report(e) { console.error(e); toast(e?.message || String(e), true); }
async function refresh() {
  state.lib = await invoke('load_library');
  if (state.albumId && !album()) state.albumId = null;
  render();
}
let thumbQueue = Promise.resolve();
function loadThumbs() {
  document.querySelectorAll('img[data-thumb]').forEach(img => {
    const id = img.dataset.thumb;
    if (thumbs.has(id)) { img.src = thumbs.get(id); return; }
    thumbQueue = thumbQueue.catch(() => {}).then(async () => {
      if (!thumbs.has(id)) thumbs.set(id, await invoke('image_data', { photoId: id, thumbnail: true }));
      if (img.isConnected) img.src = thumbs.get(id);
    }).catch(console.warn);
  });
}
async function loadOriginal(id) {
  if (!originals.has(id)) originals.set(id, await invoke('image_data', { photoId: id, thumbnail: false }));
  return originals.get(id);
}
async function loadFullPhoto() {
  const id = state.photoId;
  const img = $('#fullImage'); if (!img || !id) return;
  if (thumbs.has(id)) img.src = thumbs.get(id);
  try { const url = await loadOriginal(id); if (img.isConnected && state.photoId === id) img.src = url; }
  catch (e) { report(e); }
}
function closeModal() { state.modal = ''; state.photoId = null; state.editTab = 'details'; render(); }
const pick = which => $(which)?.click();

async function readAsDataURL(file) {
  return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
}
async function addSelectedFiles(files) {
  if (!state.albumId) { toast(t('chooseAlbum'), true); return; }
  try {
    const list = Array.from(files).filter(f => f.type.startsWith('image/') && f.size <= 40 * 1024 * 1024);
    if (!list.length) return toast('No supported image files (40 MiB maximum).', true);
    let imported = 0;
    for (let at = 0; at < list.length; at += 10) {
      const images = await Promise.all(list.slice(at, at + 10).map(async f => ({ name: f.name.replace(/\.[^.]+$/, ''), mimeType: f.type, data: await readAsDataURL(f) })));
      imported += await invoke('add_images', { albumId: state.albumId, images });
    }
    await refresh(); toast(`${imported} images added successfully.`);
  } catch (e) { report(e); await refresh(); }
}
async function defaultSavePath(filename) {
  try {
    const dir = await documentDir();
    if (dir) return await join(dir, filename);
  } catch (e) { console.warn('Documents folder unavailable', e); }
  return filename;
}
async function saveBlob(blob, filename, extension) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (isTauri()) {
    const target = await save({
      title: extension === 'pdf' ? 'Save PDF' : 'Save album',
      defaultPath: await defaultSavePath(filename),
      canCreateDirectories: true,
      filters: [{ name: extension === 'pdf' ? 'PDF document' : 'Storily album', extensions: [extension] }],
    });
    if (!target) return;
    await writeFile(target, bytes);
    toast(`${t('savedTo')} ${target}`);
    return;
  }
  if (navigator.canShare && navigator.share) {
    const file = new File([bytes], filename, { type: blob.type });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: filename }); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
  toast(`Prepared ${filename}. If your mobile WebView blocks downloads, use a device share target.`);
}
function slug(value) { return String(value || 'album').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80); }
function exportPhotos(a) {
  if (!a) return [];
  return state.lib.photos.filter(p => p.albumId === a.id)
    .sort((x, y) => (Number(x.order) || 0) - (Number(y.order) || 0) || String(y.createdAt).localeCompare(String(x.createdAt)));
}
async function exportPortable() {
  if (!album()) return;
  try { const json = await invoke('export_album', { id: state.albumId });
    await saveBlob(new Blob([json], { type: 'application/json' }), `${slug(album().title)}.storily`, 'storily');
  } catch (e) { report(e); }
}
function openExportPreview() {
  const a = album();
  if (!a) return;
  if (!exportPhotos(a).length) return toast('Add photos before exporting PDF.', true);
  state.previewIndex = 0;
  state.modal = 'exportPreview';
  render();
}
function shiftExportPreview(delta) {
  const a = album();
  if (!a || state.modal !== 'exportPreview') return;
  const total = exportPhotos(a).length;
  const next = (state.previewIndex || 0) + delta;
  if (next < 0 || next >= total) return;
  state.previewIndex = next;
  render();
}
async function importPortable(file) {
  try {
    const json = await file.text();
    const imported = await invoke('import_album', { content: json, fileName: file.name });
    state.albumId = imported.id; state.onlyFavorites = false; await refresh(); toast(`Imported ${imported.title}`);
  } catch (e) { report(e); }
}
function imageElement(data) { return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = data; }); }
function wrapCanvasText(ctx, text, maxWidth, maxLines = 3) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = []; let current = '';
  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word;
    if (ctx.measureText(attempt).width > maxWidth && current) { lines.push(current); current = word; }
    else current = attempt;
    if (lines.length >= maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}
function drawFit(ctx, image, rect) {
  const ratio = Math.min(rect.w / image.width, rect.h / image.height);
  const w = image.width * ratio, h = image.height * ratio;
  ctx.drawImage(image, rect.x + (rect.w - w) / 2, rect.y + (rect.h - h) / 2, w, h);
}
const PDF_W = 1190;
const PDF_H = 1684;
function drawPhotoFrame(ctx, image, x, y, w, h, radius = 0) {
  ctx.save();
  ctx.beginPath();
  if (radius > 0 && typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, radius);
  else ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#e6e1ea';
  ctx.fillRect(x, y, w, h);
  drawFit(ctx, image, { x, y, w, h });
  ctx.restore();
}
function captionX(align, left, right) {
  if (align === 'center') return (left + right) / 2;
  if (align === 'right') return right;
  return left;
}
function photoMeta(p) {
  return [p.showDate !== false && p.takenAt ? String(p.takenAt).slice(0, 10) : '', p.location].filter(Boolean).join('  •  ');
}
function paintCaption(ctx, { align, left, right, y, name, description, meta, metaColor, fontFamily, fontSize, fontColor }) {
  const x = captionX(align, left, right);
  const width = right - left;
  ctx.textAlign = align === 'center' || align === 'right' ? align : 'left';
  ctx.fillStyle = fontColor;
  ctx.font = `700 ${Math.round(fontSize * 2.15)}px ${fontFamily}`;
  ctx.fillText(String(name || '').slice(0, 90), x, y, width);
  let next = y + Math.round(fontSize * 2.35);
  ctx.font = `400 ${Math.round(fontSize * 1.4)}px ${fontFamily}`;
  for (const line of wrapCanvasText(ctx, description, width, 3)) {
    ctx.fillText(line, x, next, width);
    next += Math.round(fontSize * 1.9);
  }
  if (meta) {
    ctx.fillStyle = metaColor || fontColor;
    ctx.font = `500 ${Math.round(fontSize * 1.15)}px ${fontFamily}`;
    ctx.fillText(meta, x, next + 8, width);
  }
}
function paintPageNumber(ctx, index, total, color, x, y) {
  ctx.save();
  ctx.direction = 'ltr';
  ctx.textAlign = 'right';
  ctx.fillStyle = color;
  ctx.font = '22px Arial, sans-serif';
  ctx.fillText(`${index + 1} / ${total}`, x, y);
  ctx.restore();
}
function paintCorners(ctx, inset, len, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  const marks = [[inset, inset, 1, 1], [PDF_W - inset, inset, -1, 1], [inset, PDF_H - inset, 1, -1], [PDF_W - inset, PDF_H - inset, -1, -1]];
  for (const [x, y, sx, sy] of marks) {
    ctx.beginPath();
    ctx.moveTo(x, y + sy * len);
    ctx.lineTo(x, y);
    ctx.lineTo(x + sx * len, y);
    ctx.stroke();
  }
}
function coverRect(image, box) {
  const ratio = Math.max(box.w / image.width, box.h / image.height);
  const w = image.width * ratio;
  const h = image.height * ratio;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}
function paintPoster(ctx, page) {
  const { image, fontFamily, fontSize, fontColor } = page;
  const photo = page.photo;
  const align = ['left', 'center', 'right'].includes(photo.textAlignment) ? photo.textAlignment : 'left';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PDF_W, PDF_H);
  const margin = 36;
  const left = margin;
  const right = PDF_W - margin;
  const width = right - left;
  const description = String(photo.description || '').trim();
  ctx.font = `400 ${Math.round(fontSize * 1.7)}px ${fontFamily}`;
  const lines = description ? wrapCanvasText(ctx, description, width, 2) : [];
  const location = String(photo.location || '').trim().slice(0, 80);
  const date = photo.showDate !== false && photo.takenAt ? String(photo.takenAt).slice(0, 10) : '';
  const rows = [
    ...lines.map(text => ({ text, font: `400 ${Math.round(fontSize * 1.7)}px ${fontFamily}`, color: fontColor || '#1c1a22' })),
    ...(location ? [{ text: location, font: `500 ${Math.round(fontSize * 1.45)}px ${fontFamily}`, color: fontColor || '#1c1a22' }] : []),
    ...(date ? [{ text: date, font: `400 ${Math.round(fontSize * 1.25)}px ${fontFamily}`, color: '#8d8796' }] : []),
  ];
  const lineH = Math.round(fontSize * 2.35);
  const gap = Math.round(fontSize * 2.4);
  const captionH = rows.length ? gap + (rows.length - 1) * lineH + Math.round(fontSize * 2.4) : margin;
  const box = { x: margin, y: margin, w: PDF_W - margin * 2, h: Math.max(PDF_H - margin - captionH, 1) };
  const rect = coverRect(image, box);
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
  if (!rows.length) return;
  ctx.save();
  ctx.direction = document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr';
  ctx.textAlign = align === 'center' || align === 'right' ? align : 'left';
  const x = captionX(align, left, right);
  let y = box.y + box.h + gap;
  for (const row of rows) {
    ctx.font = row.font;
    ctx.fillStyle = row.color;
    ctx.fillText(row.text, x, y, width);
    y += lineH;
  }
  ctx.restore();
}
function paintPdfPage(ctx, page) {
  const { style, image, photo: p, index, total, albumName, fontFamily, fontSize, fontColor, showPageCount } = page;
  const pageMark = (color, x, y) => { if (showPageCount !== false) paintPageNumber(ctx, index, total, color, x, y); };
  if (style === 'poster') {
    paintPoster(ctx, page);
    return;
  }
  const align = ['left', 'center', 'right'].includes(p.textAlignment) ? p.textAlignment : 'left';
  const meta = photoMeta(p);
  const caption = { align, name: p.name, description: p.description, meta, fontFamily, fontSize, fontColor };
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PDF_W, PDF_H);
  if (style === 'classic') {
    ctx.fillStyle = '#f7f1e6';
    ctx.fillRect(0, 0, PDF_W, PDF_H);
    ctx.strokeStyle = '#2b261f';
    ctx.lineWidth = 4;
    ctx.strokeRect(46, 46, PDF_W - 92, PDF_H - 92);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(62, 62, PDF_W - 124, PDF_H - 124);
    ctx.fillStyle = '#2b261f';
    ctx.textAlign = 'center';
    ctx.font = `600 22px ${fontFamily}`;
    ctx.fillText(albumName || 'STORILY', PDF_W / 2, 128);
    ctx.fillRect(PDF_W / 2 - 70, 146, 140, 2);
    drawPhotoFrame(ctx, image, 150, 190, 890, 980, 0);
    ctx.strokeStyle = '#2b261f';
    ctx.strokeRect(150, 190, 890, 980);
    paintCaption(ctx, { ...caption, left: 130, right: PDF_W - 130, y: 1248, metaColor: '#6d5840' });
    pageMark('#6d5840', PDF_W - 90, PDF_H - 78);
    return;
  }
  if (style === 'vintage') {
    ctx.fillStyle = '#f0ddb8';
    ctx.fillRect(0, 0, PDF_W, PDF_H);
    let seed = 90 + index;
    ctx.fillStyle = 'rgba(120, 72, 28, 0.08)';
    for (let n = 0; n < 110; n++) {
      seed = (seed * 48271) % 2147483647;
      const x = seed % PDF_W;
      seed = (seed * 48271) % 2147483647;
      ctx.fillRect(x, seed % PDF_H, 3, 3);
    }
    paintCorners(ctx, 54, 46, '#8a5a2b');
    ctx.fillStyle = '#8a5a2b';
    ctx.textAlign = 'center';
    ctx.font = `700 24px ${fontFamily}`;
    ctx.fillText(albumName || 'STORILY', PDF_W / 2, 118);
    ctx.fillStyle = '#fff8ec';
    ctx.fillRect(128, 168, 934, 1044);
    ctx.strokeStyle = '#8a5a2b';
    ctx.lineWidth = 8;
    ctx.strokeRect(128, 168, 934, 1044);
    drawPhotoFrame(ctx, image, 156, 196, 878, 988, 0);
    paintCaption(ctx, { ...caption, left: 140, right: PDF_W - 140, y: 1300, metaColor: '#8a5a2b' });
    pageMark('#8a5a2b', PDF_W - 80, PDF_H - 70);
    return;
  }
  if (style === 'artistic') {
    ctx.fillStyle = '#fff4fb';
    ctx.fillRect(0, 0, PDF_W, PDF_H);
    ctx.fillStyle = '#f0b7ea';
    ctx.beginPath();
    ctx.arc(1020, 260, 320, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b423a4';
    ctx.fillRect(0, PDF_H - 130, PDF_W, 130);
    if (albumName) {
      ctx.fillStyle = '#b423a4';
      ctx.textAlign = 'left';
      ctx.font = `700 26px ${fontFamily}`;
      ctx.fillText(albumName.slice(0, 40), 72, 96);
    }
    drawPhotoFrame(ctx, image, 72, 150, 760, 1120, 48);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(780, 430, 340, 760);
    paintCaption(ctx, { ...caption, align: 'left', left: 808, right: 1090, y: 520, metaColor: '#b423a4' });
    pageMark('#ffffff', PDF_W - 70, PDF_H - 54);
    return;
  }
  if (style === 'minimal') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PDF_W, PDF_H);
    drawPhotoFrame(ctx, image, 145, 120, 900, 1120, 0);
    paintCaption(ctx, { ...caption, left: 145, right: PDF_W - 145, y: 1320, metaColor: '#8d8796' });
    pageMark('#b7b2c0', PDF_W - 145, PDF_H - 70);
    return;
  }
  ctx.fillStyle = '#f4f0ff';
  ctx.fillRect(0, 0, PDF_W, PDF_H);
  ctx.fillStyle = '#6d3df0';
  ctx.fillRect(0, 0, 22, PDF_H);
  ctx.fillStyle = '#6d3df0';
  ctx.textAlign = 'left';
  ctx.font = `700 22px ${fontFamily}`;
  ctx.fillText(albumName || 'STORILY', 78, 108);
  ctx.fillRect(78, 126, 86, 6);
  drawPhotoFrame(ctx, image, 78, 168, 1034, 1040, 28);
  paintCaption(ctx, { ...caption, left: 78, right: 1112, y: 1290, metaColor: '#6d3df0' });
  pageMark('#8d86a3', 1112, PDF_H - 58);
}
let previewImagePromise;
function previewImage() {
  if (!previewImagePromise) {
    const sample = document.createElement('canvas');
    sample.width = 640; sample.height = 480;
    const ctx = sample.getContext('2d');
    const wash = ctx.createLinearGradient(0, 0, 640, 480);
    wash.addColorStop(0, '#d5c4ff'); wash.addColorStop(0.55, '#f6d4ec'); wash.addColorStop(1, '#8b68ee');
    ctx.fillStyle = wash; ctx.fillRect(0, 0, 640, 480);
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    ctx.beginPath(); ctx.arc(190, 160, 58, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(0, 330, 640, 150);
    previewImagePromise = imageElement(sample.toDataURL('image/jpeg', 0.9));
  }
  return previewImagePromise;
}
const previewPhoto = { name: 'Summer afternoon', description: 'A quiet walk kept just as it was, where the light stayed on the street a little longer.', location: 'Baghdad', takenAt: '2024-07-01', showDate: true, textAlignment: 'left' };
function lookFromSettings() {
  const style = $('#pdfStyle')?.value;
  if (!style) return resolvePdf(null);
  return { style, fontFamily: $('#fontFamily')?.value || state.prefs.fontFamily, fontSize: Number($('#fontSize')?.value) || 16, fontColor: $('#fontColor')?.value || state.prefs.fontColor, showPageCount: $('#showPageCount')?.checked !== false };
}
function lookFromAlbumForm() {
  const form = $('#albumForm');
  if (!form) return null;
  const base = resolvePdf(null);
  if (form.pdfMode?.value !== 'custom') return base;
  return {
    style: form.pdfStyle?.value || base.style,
    fontFamily: form.pdfFontFamily?.value || base.fontFamily,
    fontSize: Number(form.pdfFontSize?.value) || base.fontSize,
    fontColor: form.pdfFontColor?.value || base.fontColor,
    showPageCount: !!form.showPageCount?.checked,
  };
}
let previewToken = 0;
let exportPreviewToken = 0;
async function paintExportPreview() {
  const canvas = $('#exportPreviewCanvas');
  const a = album();
  if (!canvas || !a || state.modal !== 'exportPreview') return;
  const photos = exportPhotos(a);
  if (!photos.length) return;
  const index = Math.max(0, Math.min(state.previewIndex || 0, photos.length - 1));
  const token = ++exportPreviewToken;
  const look = resolvePdf(a);
  const scale = 0.36;
  canvas.width = Math.round(PDF_W * scale);
  canvas.height = Math.round(PDF_H * scale);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = '#f7f4fb';
  ctx.fillRect(0, 0, PDF_W, PDF_H);
  try {
    const image = await imageElement(await loadOriginal(photos[index].id));
    if (token !== exportPreviewToken || !canvas.isConnected) return;
    ctx.direction = state.prefs.lang === 'ar' ? 'rtl' : 'ltr';
    paintPdfPage(ctx, { ...look, image, photo: photos[index], index, total: photos.length, albumName: a.title });
  } catch (e) { report(e); }
}
async function drawPdfPreviews() {
  const canvases = [...document.querySelectorAll('canvas[data-pdf-preview]')];
  if (!canvases.length) return;
  const token = ++previewToken;
  const image = await previewImage();
  if (token !== previewToken) return;
  for (const canvas of canvases) {
    if (!canvas.isConnected) continue;
    const look = canvas.dataset.pdfPreview === 'album' ? (lookFromAlbumForm() || resolvePdf(album())) : lookFromSettings();
    const scale = 0.2;
    canvas.width = Math.round(PDF_W * scale);
    canvas.height = Math.round(PDF_H * scale);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const albumName = canvas.dataset.pdfPreview === 'album' ? (album()?.title || 'Summer') : 'Summer';
    paintPdfPage(ctx, { ...look, image, photo: previewPhoto, index: 0, total: 3, albumName });
    const label = canvas.parentElement?.querySelector('.pdf-preview-label');
    if (label) label.textContent = themeLabel(look.style);
  }
}
async function createPdf() {
  const a = album(); if (!a) return;
  const photos = exportPhotos(a);
  if (!photos.length) return toast('Add photos before exporting PDF.', true);
  const look = resolvePdf(a);
  toast(t('creatingPdf'));
  await new Promise(resolve => requestAnimationFrame(resolve));
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${a.title} — Storily`);
  pdf.setCreator('Storily CrossPlatform');
  const albumName = a.title;
  for (let index = 0; index < photos.length; index++) {
    const p = photos[index];
    const canvas = document.createElement('canvas');
    canvas.width = PDF_W;
    canvas.height = PDF_H;
    const ctx = canvas.getContext('2d');
    ctx.direction = state.prefs.lang === 'ar' ? 'rtl' : 'ltr';
    const photoImage = await imageElement(await loadOriginal(p.id));
    paintPdfPage(ctx, { style: look.style, image: photoImage, photo: p, index, total: photos.length, albumName, ...look });
    const embedded = await pdf.embedJpg(canvas.toDataURL('image/jpeg', 0.86));
    const page = pdf.addPage([595, 842]);
    page.drawImage(embedded, { x: 0, y: 0, width: 595, height: 842 });
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  const bytes = await pdf.save();
  await saveBlob(new Blob([bytes], { type: 'application/pdf' }), `${slug(a.title)}.pdf`, 'pdf');
}
async function applyImageEdit() {
  const p = photo(); if (!p) return;
  try {
    toast(t('savingImage'));
    const source = await imageElement(await loadOriginal(p.id));
    const canvas = bakeEdit(source, state.edit);
    await invoke('replace_image', { id: p.id, data: canvas.toDataURL('image/png') });
    thumbs.delete(p.id); originals.delete(p.id);
    state.editTab = 'edit'; state.edit = freshEdit(); state.editPast = []; state.editFuture = [];
    await refresh(); toast(`${t('imageUpdated')} ${canvas.width} × ${canvas.height}`);
  } catch (e) { report(e); }
}

function albumPayload(a, extra = {}) {
  return {
    id: a.id, title: a.title, description: a.description || '', style: a.style || 'modern',
    hideTitle: false, pdfCustom: !!a.pdfCustom, pdfFontFamily: a.pdfFontFamily || '',
    pdfFontSize: Number(a.pdfFontSize) || 0, pdfFontColor: a.pdfFontColor || '',
    showPageCount: a.showPageCount !== false, ...extra,
  };
}
let pointerDrag = null;
let suppressClick = false;
function orderIds(parent, kind) {
  return [...parent.children].filter(node => node.dataset.drop === kind).map(node => node.dataset.id);
}
function slideReorder(source, target, clientX, clientY) {
  const parent = source.parentElement;
  if (!parent || target.parentElement !== parent || target === source) return;
  const rect = target.getBoundingClientRect();
  const after = (clientY - rect.top) / rect.height > 0.5;
  if (!after && source.nextElementSibling === target) return;
  if (after && target.nextElementSibling === source) return;
  const items = [...parent.children].filter(node => node.dataset.drop === source.dataset.drop && node !== source);
  items.forEach(node => { node.style.transition = 'none'; node.style.transform = ''; });
  parent.getBoundingClientRect();
  const first = new Map(items.map(node => [node, node.getBoundingClientRect()]));
  parent.insertBefore(source, after ? target.nextElementSibling : target);
  items.forEach(node => {
    const start = first.get(node);
    const next = node.getBoundingClientRect();
    const dx = start.left - next.left;
    const dy = start.top - next.top;
    if (!dx && !dy) return;
    node.style.transition = 'none';
    node.style.transform = `translate(${dx}px, ${dy}px)`;
    requestAnimationFrame(() => {
      if (!node.isConnected) return;
      node.style.transition = 'transform 180ms ease';
      node.style.transform = '';
    });
  });
}
function parkCard(card, clientX, clientY, offsetX, offsetY) {
  card.style.transition = 'none';
  card.style.transform = 'none';
  const layout = card.getBoundingClientRect();
  const tx = clientX - offsetX - layout.left;
  const ty = clientY - offsetY - layout.top;
  card.style.transform = `translate(${tx}px, ${ty}px)`;
}
function clearDrag(drag) {
  document.body.classList.remove('is-reordering');
  document.querySelectorAll('.drag-ghost').forEach(node => node.remove());
  const card = drag?.card;
  if (card) {
    card.classList.remove('is-lifted', 'is-placeholder');
    card.style.pointerEvents = '';
    card.style.zIndex = '';
    card.style.transform = '';
    card.style.transition = '';
  }
  document.querySelectorAll('[data-drop]').forEach(node => {
    node.classList.remove('is-lifted', 'is-placeholder');
    node.style.transition = '';
    node.style.transform = '';
    node.style.pointerEvents = '';
    node.style.zIndex = '';
  });
}
function beginLift(drag, event) {
  const card = drag.card;
  const rect = card.getBoundingClientRect();
  drag.offsetX = event.clientX - rect.left;
  drag.offsetY = event.clientY - rect.top;
  drag.startIds = orderIds(card.parentElement, drag.kind).join('|');
  card.classList.add('is-lifted');
  card.style.pointerEvents = 'none';
  document.body.classList.add('is-reordering');
  drag.active = true;
  parkCard(card, event.clientX, event.clientY, drag.offsetX, drag.offsetY);
}
function moveDrag(event) {
  if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
  const dx = event.clientX - pointerDrag.x;
  const dy = event.clientY - pointerDrag.y;
  if (!pointerDrag.active && Math.hypot(dx, dy) < 6) return;
  if (!pointerDrag.active) beginLift(pointerDrag, event);
  event.preventDefault();
  parkCard(pointerDrag.card, event.clientX, event.clientY, pointerDrag.offsetX, pointerDrag.offsetY);
  const scroller = document.querySelector('.content');
  if (scroller) {
    const bounds = scroller.getBoundingClientRect();
    if (event.clientY < bounds.top + 48) scroller.scrollTop -= 16;
    else if (event.clientY > bounds.bottom - 48) scroller.scrollTop += 16;
  }
  const under = document.elementFromPoint(event.clientX, event.clientY);
  const zone = under?.closest(`[data-drop="${pointerDrag.kind}"]`);
  if (zone && zone !== pointerDrag.card) {
    slideReorder(pointerDrag.card, zone, event.clientX, event.clientY);
    parkCard(pointerDrag.card, event.clientX, event.clientY, pointerDrag.offsetX, pointerDrag.offsetY);
  }
}
async function finishPointerDrag(event) {
  if (!pointerDrag || (event?.pointerId !== undefined && event.pointerId !== pointerDrag.pointerId)) return;
  const drag = pointerDrag;
  pointerDrag = null;
  const parent = drag.card?.parentElement;
  const ids = parent ? orderIds(parent, drag.kind) : [];
  const moved = drag.active && ids.join('|') !== drag.startIds;
  if (drag.active) {
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 400);
  }
  clearDrag(drag);
  if (!moved) return;
  try {
    if (drag.kind === 'album') await invoke('reorder_albums', { ids });
    else { state.sort = 'order'; await invoke('reorder_photos', { albumId: state.albumId, ids }); }
    await refresh();
  } catch (e) { report(e); }
}
const app = $('#app');
app.addEventListener('pointerdown', event => {
  if (event.button > 0 || pointerDrag) return;
  const fromHandle = event.target.closest('[data-drag]');
  const card = fromHandle?.closest('[data-drop]')
    || (!event.target.closest('button, input, select, textarea, a') && event.target.closest('[data-drop="photo"]'));
  if (!card) return;
  pointerDrag = { kind: card.dataset.drop, id: card.dataset.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, active: false, card };
});
window.addEventListener('pointermove', moveDrag, { passive: false });
window.addEventListener('pointerup', finishPointerDrag);
window.addEventListener('pointercancel', finishPointerDrag);
window.addEventListener('blur', () => { if (pointerDrag) { const drag = pointerDrag; pointerDrag = null; clearDrag(drag); } });
app.addEventListener('click', async event => {
  if (suppressClick) { suppressClick = false; event.preventDefault(); event.stopPropagation(); return; }
  const element = event.target.closest('[data-action]'); if (!element) return;
  const action = element.dataset.action;
  if (action === 'ignore') return;
  if (action === 'closeModal' && event.target !== element && element.classList.contains('overlay')) return;
  try {
    if (studioAction(studioEnv(), action, element)) return;
    switch (action) {
      case 'home': state.albumId = null; state.onlyFavorites = false; state.modal = ''; state.mobileNav = false; render(); break;
      case 'selectAlbum': state.albumId = element.dataset.id; state.onlyFavorites = false; state.modal = ''; state.mobileNav = false; state.search = ''; render(); break;
      case 'favorites': state.onlyFavorites = true; state.modal = ''; state.mobileNav = false; state.search = ''; render(); break;
      case 'newAlbum': state.modal = 'newAlbum'; render(); $('[name="title"]')?.focus(); break;
      case 'importAlbum': pick('#albumPicker'); break;
      case 'addPhotos': pick('#imagePicker'); break;
      case 'exportAlbum': await exportPortable(); break;
      case 'previewExport': openExportPreview(); break;
      case 'previewPrev': shiftExportPreview(-1); break;
      case 'previewNext': shiftExportPreview(1); break;
      case 'exportPdf': await createPdf(); break;
      case 'albumDetails': state.modal = 'albumDetails'; render(); break;
      case 'settings': state.modal = 'settings'; state.albumId = null; state.onlyFavorites = false; state.mobileNav = false; render(); break;
      case 'openPhoto': state.photoId = element.dataset.id; state.modal = 'photo'; state.editTab = 'details'; state.edit = freshEdit(); state.editPast = []; state.editFuture = []; render(); break;
      case 'closeModal': closeModal(); break;
      case 'tabDetails': state.editTab = 'details'; render(); break;
      case 'tabEdit': state.editTab = 'edit'; render(); break;
      case 'applyEdit': await applyImageEdit(); break;
      case 'viewGrid': state.view = 'grid'; render(); break;
      case 'viewList': state.view = 'list'; render(); break;
      case 'toggleNav': state.mobileNav = !state.mobileNav; render(); break;
      case 'themeLight': state.prefs.theme = 'light'; savePrefs(); break;
      case 'themeDark': state.prefs.theme = 'dark'; savePrefs(); break;
      case 'deleteAlbum': if (confirm(t('confirmDelete'))) { await invoke('delete_album', { id: state.albumId }); state.albumId = null; state.modal = ''; await refresh(); } break;
      case 'deletePhoto': if (confirm(t('confirmDelete'))) { const id = state.photoId; await invoke('delete_photo', { id }); thumbs.delete(id); originals.delete(id); closeModal(); await refresh(); } break;
    }
  } catch (e) { report(e); }
});
app.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target, values = new FormData(form);
  try {
    if (form.id === 'newAlbumForm') {
      const created = await invoke('create_album', { title: values.get('title'), style: state.prefs.pdfStyle });
      state.albumId = created.id; state.onlyFavorites = false; state.modal = ''; await refresh();
    } else if (form.id === 'albumForm') {
      const custom = values.get('pdfMode') === 'custom';
      await invoke('update_album', albumPayload(album(), {
        title: values.get('title'), description: values.get('description'), hideTitle: false,
        pdfCustom: custom, style: values.get('pdfStyle'), pdfFontFamily: values.get('pdfFontFamily'),
        pdfFontSize: Number(values.get('pdfFontSize')) || 16, pdfFontColor: values.get('pdfFontColor'),
        showPageCount: values.has('showPageCount'),
      }));
      state.modal = ''; await refresh();
    } else if (form.id === 'photoForm') {
      const patch = { name: photo()?.name || 'Photo', description: values.get('description'), location: values.get('location'),
        takenAt: values.get('takenAt'), tags: String(values.get('tags') || '').split(',').map(s => s.trim()).filter(Boolean), favorite: values.has('favorite'), showDate: values.has('showDate'), textAlignment: values.get('textAlignment'), style: photo()?.style || 'modern' };
      await invoke('update_photo', { id: state.photoId, patch }); closeModal(); await refresh();
    }
    toast(t('ready'));
  } catch (e) { report(e); }
});
function savePrefs() { localStorage.setItem('storily-prefs', JSON.stringify(state.prefs)); render(); }
app.addEventListener('change', async event => {
  const el = event.target;
  try {
    if (el.id === 'imagePicker') { await addSelectedFiles(el.files); el.value = ''; }
    if (el.id === 'albumPicker') { if (el.files[0]) await importPortable(el.files[0]); el.value = ''; }
    if (el.id === 'sort') { state.sort = el.value; render(); }
    if (['lang', 'pdfStyle', 'fontFamily', 'fontSize', 'fontColor', 'showPageCount'].includes(el.id)) {
      state.prefs[el.id] = el.id === 'fontSize' ? Number(el.value) : el.id === 'showPageCount' ? el.checked : el.value;
      savePrefs();
    }
    if (el.name === 'pdfMode') { $('#albumPdfFields')?.classList.toggle('is-disabled', el.value !== 'custom'); drawPdfPreviews(); }
    if (['pdfStyle', 'pdfFontFamily', 'pdfFontColor', 'showPageCount'].includes(el.name)) drawPdfPreviews();
  } catch (e) { report(e); }
});
app.addEventListener('input', event => {
  if (event.target.id === 'search') {
    const pos = event.target.selectionStart; state.search = event.target.value; render();
    const search = $('#search'); if (search) { search.focus(); search.setSelectionRange(pos, pos); }
  }
  if (event.target.dataset.edit && studioInput(studioEnv(), event.target)) return;
  if (event.target.name === 'pdfFontSize') {
    const label = event.target.parentElement?.querySelector('strong');
    if (label) label.textContent = `${event.target.value}px`;
  }
  if (event.target.id === 'fontSize') {
    const label = event.target.parentElement?.querySelector('strong');
    if (label) label.textContent = `${event.target.value}px`;
  }
  if (['fontSize', 'fontColor', 'pdfStyle', 'fontFamily'].includes(event.target.id) || ['pdfFontSize', 'pdfFontColor', 'pdfStyle', 'pdfFontFamily'].includes(event.target.name)) drawPdfPreviews();
});
function fileDrag(event) {
  const types = event.dataTransfer?.types;
  if (!types) return false;
  return typeof types.includes === 'function' ? types.includes('Files') : types.contains?.('Files');
}
function albumCanTakeFiles() { return Boolean(state.albumId) && !state.modal && !pointerDrag; }
function showFileDrop(on) { $('.content')?.classList.toggle('dragging', on && albumCanTakeFiles()); }
async function addDroppedPaths(paths) {
  if (!state.albumId) { toast(t('chooseAlbum'), true); return; }
  if (state.modal || pointerDrag) return;
  try {
    const imported = await invoke('add_image_paths', { albumId: state.albumId, paths });
    await refresh(); toast(`${imported} images added successfully.`);
  } catch (e) { report(e); await refresh(); }
}
app.addEventListener('dragenter', event => { if (pointerDrag || !fileDrag(event) || !albumCanTakeFiles()) return; event.preventDefault(); showFileDrop(true); });
app.addEventListener('dragover', event => { if (pointerDrag || !fileDrag(event)) return; if (albumCanTakeFiles()) { event.preventDefault(); showFileDrop(true); } });
app.addEventListener('dragleave', event => { if (!event.relatedTarget || !app.contains(event.relatedTarget)) showFileDrop(false); });
app.addEventListener('drop', event => {
  if (pointerDrag || !fileDrag(event)) return;
  event.preventDefault(); showFileDrop(false);
  // Tauri delivers OS file drops through onDragDropEvent, not dataTransfer.
  if (isTauri() || !albumCanTakeFiles()) return;
  addSelectedFiles(event.dataTransfer.files);
});
if (isTauri()) {
  getCurrentWebview().onDragDropEvent(event => {
    const kind = event.payload?.type;
    if (kind === 'enter' || kind === 'over') { showFileDrop(true); return; }
    showFileDrop(false);
    if (kind === 'drop') addDroppedPaths(event.payload.paths || []);
  }).catch(error => console.error(error));
}
document.addEventListener('keydown', event => {
  if (studioKey(studioEnv(), event)) return;
  if (state.modal === 'exportPreview' && event.key === 'ArrowLeft') { event.preventDefault(); shiftExportPreview(-1); return; }
  if (state.modal === 'exportPreview' && event.key === 'ArrowRight') { event.preventDefault(); shiftExportPreview(1); return; }
  if (event.key === 'Escape' && state.modal) closeModal();
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); state.modal = 'newAlbum'; render(); }
});
function openStudioDemo() {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 640;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 960, 640);
  gradient.addColorStop(0, '#ffd6ef');
  gradient.addColorStop(0.45, '#6d4dff');
  gradient.addColorStop(1, '#142033');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 960, 640);
  ctx.fillStyle = '#ffe08a';
  ctx.beginPath();
  ctx.arc(760, 170, 74, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 72px sans-serif';
  ctx.fillText('Storily', 72, 250);
  ctx.font = '28px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.fillText('Edit studio', 76, 310);
  const url = canvas.toDataURL('image/jpeg', 0.92);
  const now = new Date().toISOString();
  state.lib = {
    albums: [{ id: 'demo', title: 'Demo', description: 'Studio demo', order: 0, createdAt: now, style: 'modern' }],
    photos: [{ id: 'demo-photo', albumId: 'demo', name: 'Demo', description: '', location: 'Baghdad', takenAt: '2024-07-01', tags: [], favorite: false, showDate: true, textAlignment: 'left', style: 'modern', width: 960, height: 640, createdAt: now, order: 0 }],
  };
  state.albumId = 'demo';
  state.onlyFavorites = false;
  state.photoId = 'demo-photo';
  state.modal = 'photo';
  state.editTab = 'edit';
  state.edit = freshEdit();
  state.editPast = [];
  state.editFuture = [];
  originals.set('demo-photo', url);
  thumbs.set('demo-photo', url);
  render();
}
if (import.meta.env.DEV) {
  window.__openStudioDemo = openStudioDemo;
  window.__bakeEdit = bakeEdit;
  window.__freshEdit = freshEdit;
}
(async function boot() {
  try { await refresh(); }
  catch (e) { console.error(e); $('#app').innerHTML = `<div class="startup-error"><h2>Unable to start Storily</h2><p>${esc(e.message || e)}</p><small>Open this app with Tauri (npm run tauri dev), not as a regular website.</small></div>`; }
})();
