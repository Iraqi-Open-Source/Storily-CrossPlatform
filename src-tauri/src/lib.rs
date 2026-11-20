use base64::{engine::general_purpose::STANDARD, Engine as _};
use chrono::Utc;
use image::{imageops::FilterType, ImageFormat};
use serde::{Deserialize, Serialize};
use std::{
    fs, io::Cursor, path::{Path, PathBuf}, sync::Mutex,
};
use tauri::{Manager, State};
use uuid::Uuid;

const MAX_IMAGE_BYTES: usize = 40 * 1024 * 1024;
const MAX_ARCHIVE_BYTES: usize = 500 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Album {
    id: String,
    title: String,
    #[serde(default)] description: String,
    #[serde(default = "now")] created_at: String,
    #[serde(default = "now")] updated_at: String,
    #[serde(default = "default_style")] style: String,
    #[serde(default)] order: i32,
    #[serde(default)] hide_title: bool,
    /// When false, PDF export uses the app-wide defaults from the client.
    #[serde(default)] pdf_custom: bool,
    #[serde(default)] pdf_font_family: String,
    #[serde(default)] pdf_font_size: u32,
    #[serde(default)] pdf_font_color: String,
    /// Page number on each PDF page. Defaults on for albums saved before this field existed.
    #[serde(default = "default_true")] show_page_count: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Photo {
    id: String,
    album_id: String,
    name: String,
    #[serde(default)] description: String,
    #[serde(default)] location: String,
    #[serde(default)] taken_at: String,
    #[serde(default)] tags: Vec<String>,
    #[serde(default)] favorite: bool,
    #[serde(default = "default_true")] show_date: bool,
    #[serde(default = "default_alignment")] text_alignment: String,
    #[serde(default = "default_style")] style: String,
    #[serde(default)] order: i32,
    #[serde(default)] width: u32,
    #[serde(default)] height: u32,
    #[serde(default = "now")] created_at: String,
    file_name: String,
    #[serde(default = "default_mime")] mime_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Library {
    #[serde(default = "version")] version: u32,
    #[serde(default)] albums: Vec<Album>,
    #[serde(default)] photos: Vec<Photo>,
}
impl Default for Library {
    fn default() -> Self { Self { version: 2, albums: Vec::new(), photos: Vec::new() } }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UploadedImage { name: String, data: String, #[serde(default)] mime_type: String }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PhotoPatch {
    name: String, description: String, location: String, taken_at: String,
    tags: Vec<String>, favorite: bool, show_date: bool, text_alignment: String, style: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PortablePhoto {
    photo: Photo,
    data_base64: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PortableAlbum {
    format: String,
    album: Album,
    photos: Vec<PortablePhoto>,
}

struct Repository { root: PathBuf, library: Mutex<Library> }

fn now() -> String { Utc::now().to_rfc3339() }
fn version() -> u32 { 2 }
fn default_style() -> String { "modern".into() }
fn default_true() -> bool { true }
fn default_alignment() -> String { "center".into() }
fn default_mime() -> String { "image/jpeg".into() }
fn new_id() -> String { Uuid::new_v4().to_string() }
const PDF_STYLES: [&str; 6] = ["classic", "vintage", "modern", "artistic", "minimal", "poster"];
fn valid_style(style: &str) -> String {
    if PDF_STYLES.contains(&style) { style.to_string() } else { default_style() }
}
fn valid_font(value: &str) -> String {
    if matches!(value, "Arial, sans-serif" | "Georgia, serif" | "Tahoma, sans-serif") { value.to_string() }
    else if value.is_empty() { String::new() }
    else { "Arial, sans-serif".into() }
}
fn valid_color(value: &str) -> String {
    let v = value.trim();
    if v.is_empty() { return String::new(); }
    let hex = v.len() == 7 && v.starts_with('#') && v[1..].chars().all(|c| c.is_ascii_hexdigit());
    if hex { v.to_string() } else { "#222036".into() }
}
fn next_album_order(lib: &Library) -> i32 {
    lib.albums.iter().map(|a| a.order).max().unwrap_or(-1) + 1
}
fn next_photo_order(lib: &Library, album_id: &str) -> i32 {
    let mut orders = lib.photos.iter().filter(|p| p.album_id == album_id).map(|p| p.order);
    let Some(first) = orders.next() else { return 0 };
    let (mut min, mut max) = (first, first);
    for order in orders { min = min.min(order); max = max.max(order); }
    // Untouched albums stay newest-first. After a manual reorder, new photos append.
    if min == max { min - 1 } else { max + 1 }
}
fn make_album(id: String, title: String, description: String, style: String, order: i32) -> Album {
    Album {
        id, title, description, created_at: now(), updated_at: now(), style, order,
        hide_title: false, pdf_custom: false, pdf_font_family: String::new(),
        pdf_font_size: 0, pdf_font_color: String::new(), show_page_count: true,
    }
}
fn valid_title(title: &str) -> Result<String, String> {
    let cleaned = title.trim();
    if cleaned.is_empty() || cleaned.chars().count() > 120 { return Err("A title between 1 and 120 characters is required".into()); }
    Ok(cleaned.to_string())
}
fn to_err(e: impl std::fmt::Display) -> String { e.to_string() }

impl Repository {
    fn new(root: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(root.join("photos")).map_err(to_err)?;
        fs::create_dir_all(root.join("thumbs")).map_err(to_err)?;
        let file = root.join("library.json");
        let lib = if file.exists() {
            serde_json::from_slice(&fs::read(&file).map_err(to_err)?).map_err(to_err)?
        } else { Library::default() };
        Ok(Self { root, library: Mutex::new(lib) })
    }
    fn save(&self, lib: &Library) -> Result<(), String> {
        let bytes = serde_json::to_vec_pretty(lib).map_err(to_err)?;
        let temp = self.root.join("library.json.tmp");
        fs::write(&temp, bytes).map_err(to_err)?;
        // On Windows replace_existing is not supported by rename, so preserve previous state
        // in .bak and restore on failure.
        let target = self.root.join("library.json");
        let backup = self.root.join("library.json.bak");
        if target.exists() {
            let _ = fs::remove_file(&backup);
            fs::rename(&target, &backup).map_err(to_err)?;
        }
        if let Err(error) = fs::rename(&temp, &target) {
            if backup.exists() { let _ = fs::rename(&backup, &target); }
            return Err(error.to_string());
        }
        Ok(())
    }
    fn photo_path(&self, id: &str) -> PathBuf { self.root.join("photos").join(format!("{id}.img")) }
    fn thumb_path(&self, id: &str) -> PathBuf { self.root.join("thumbs").join(format!("{id}.jpg")) }
    fn add_one(&self, lib: &mut Library, album_id: &str, name: String, bytes: Vec<u8>, mime: String, order: i32) -> Result<Photo, String> {
        if bytes.is_empty() || bytes.len() > MAX_IMAGE_BYTES { return Err("Image is empty or exceeds 40 MiB".into()); }
        let image = image::load_from_memory(&bytes).map_err(|_| "Unsupported or damaged image".to_string())?;
        let (width, height) = (image.width(), image.height());
        if width == 0 || height == 0 || width as u64 * height as u64 > 150_000_000 {
            return Err("Image dimensions are too large".into());
        }
        let id = new_id();
        let thumb = image.resize(560, 560, FilterType::Triangle).to_rgb8();
        let mut out = Cursor::new(Vec::new());
        image::DynamicImage::ImageRgb8(thumb).write_to(&mut out, ImageFormat::Jpeg).map_err(to_err)?;
        // Native Swift Storily embedded TIFF images; normalize unsupported WebView
        // formats to PNG while keeping JPEG/PNG/WebP byte-perfect.
        let (stored_bytes, stored_mime) = match image::guess_format(&bytes).map_err(to_err)? {
            ImageFormat::Jpeg => (bytes, "image/jpeg".to_string()),
            ImageFormat::Png => (bytes, "image/png".to_string()),
            ImageFormat::WebP => (bytes, "image/webp".to_string()),
            _ => {
                let mut output = Cursor::new(Vec::new());
                image.write_to(&mut output, ImageFormat::Png).map_err(to_err)?;
                (output.into_inner(), "image/png".to_string())
            }
        };
        let _ = mime;
        fs::write(self.photo_path(&id), &stored_bytes).map_err(to_err)?;
        if let Err(e) = fs::write(self.thumb_path(&id), out.into_inner()) {
            let _ = fs::remove_file(self.photo_path(&id));
            return Err(e.to_string());
        }
        let photo = Photo {
            id, album_id: album_id.into(), name, description: String::new(),
            location: String::new(), taken_at: String::new(), tags: vec![], favorite: false,
            show_date: true, text_alignment: "center".into(), style: "modern".into(), order,
            width, height, created_at: now(), file_name: String::new(), mime_type: stored_mime,
        };
        lib.photos.push(photo.clone());
        Ok(photo)
    }
}

fn with_library<R>(repo: &Repository, action: impl FnOnce(&mut Library) -> Result<R, String>) -> Result<R, String> {
    let mut lib = repo.library.lock().map_err(to_err)?;
    // Mutations commit only after storage succeeds, preventing in-memory / disk divergence.
    let mut draft = lib.clone();
    let result = action(&mut draft)?;
    repo.save(&draft)?;
    *lib = draft;
    Ok(result)
}

#[tauri::command]
fn load_library(repo: State<'_, Repository>) -> Result<Library, String> {
    repo.library.lock().map(|l| l.clone()).map_err(to_err)
}
#[tauri::command]
fn create_album(repo: State<'_, Repository>, title: String, style: Option<String>) -> Result<Album, String> {
    let title = valid_title(&title)?;
    let style = valid_style(style.as_deref().unwrap_or("modern"));
    with_library(&repo, |lib| {
        let album = make_album(new_id(), title, String::new(), style, next_album_order(lib));
        lib.albums.push(album.clone());
        Ok(album)
    })
}
#[tauri::command]
fn update_album(
    repo: State<'_, Repository>, id: String, title: String, description: String, style: String,
    hide_title: bool, pdf_custom: bool, pdf_font_family: String, pdf_font_size: u32, pdf_font_color: String,
    show_page_count: bool,
) -> Result<(), String> {
    let title = valid_title(&title)?;
    with_library(&repo, |lib| {
        let album = lib.albums.iter_mut().find(|a| a.id == id).ok_or("Album not found")?;
        album.title = title;
        album.description = description;
        album.style = valid_style(&style);
        album.hide_title = hide_title;
        album.pdf_custom = pdf_custom;
        album.pdf_font_family = valid_font(&pdf_font_family);
        album.pdf_font_size = if pdf_font_size == 0 { 0 } else { pdf_font_size.clamp(12, 24) };
        album.pdf_font_color = valid_color(&pdf_font_color);
        album.show_page_count = show_page_count;
        album.updated_at = now();
        Ok(())
    })
}
#[tauri::command]
fn reorder_albums(repo: State<'_, Repository>, ids: Vec<String>) -> Result<(), String> {
    with_library(&repo, |lib| {
        for (index, id) in ids.iter().enumerate() {
            if let Some(album) = lib.albums.iter_mut().find(|a| &a.id == id) {
                album.order = index as i32;
            }
        }
        lib.albums.sort_by_key(|a| a.order);
        Ok(())
    })
}
#[tauri::command]
fn reorder_photos(repo: State<'_, Repository>, album_id: String, ids: Vec<String>) -> Result<(), String> {
    with_library(&repo, |lib| {
        if !lib.albums.iter().any(|a| a.id == album_id) { return Err("Album not found".into()); }
        for (index, id) in ids.iter().enumerate() {
            if let Some(photo) = lib.photos.iter_mut().find(|p| p.id == *id && p.album_id == album_id) {
                photo.order = index as i32;
            }
        }
        Ok(())
    })
}
#[tauri::command]
fn delete_album(repo: State<'_, Repository>, id: String) -> Result<(), String> {
    let ids = with_library(&repo, |lib| {
        if !lib.albums.iter().any(|a| a.id == id) { return Err("Album not found".into()); }
        lib.albums.retain(|a| a.id != id);
        let ids: Vec<String> = lib.photos.iter().filter(|p| p.album_id == id).map(|p| p.id.clone()).collect();
        lib.photos.retain(|p| p.album_id != id);
        Ok(ids)
    })?;
    for photo_id in ids { let _ = fs::remove_file(repo.photo_path(&photo_id)); let _ = fs::remove_file(repo.thumb_path(&photo_id)); }
    Ok(())
}
fn dropped_image_title(path: &Path) -> String {
    let stem = path.file_stem().map(|value| value.to_string_lossy().into_owned()).unwrap_or_default();
    let title: String = stem.trim().chars().take(120).collect();
    if title.is_empty() { "Photo".into() } else { title }
}
fn import_dropped_paths(repo: &Repository, album_id: &str, paths: Vec<String>) -> Result<usize, String> {
    if paths.len() > 100 { return Err("Please import at most 100 images per batch".into()); }
    let mut images = Vec::new();
    for raw in paths {
        let path = PathBuf::from(&raw);
        let Ok(meta) = fs::metadata(&path) else { continue };
        if !meta.is_file() || meta.len() == 0 || meta.len() > MAX_IMAGE_BYTES as u64 { continue; }
        let Ok(bytes) = fs::read(&path) else { continue };
        if image::guess_format(&bytes).is_err() { continue; }
        images.push((dropped_image_title(&path), bytes));
    }
    if images.is_empty() { return Err("No supported image files (40 MiB maximum).".into()); }
    with_library(repo, |lib| {
        if !lib.albums.iter().any(|a| a.id == album_id) { return Err("Album not found".into()); }
        let mut count = 0usize;
        for (name, bytes) in images {
            let order = next_photo_order(lib, album_id);
            if repo.add_one(lib, album_id, name, bytes, String::new(), order).is_ok() { count += 1; }
        }
        if count == 0 { return Err("No supported image files (40 MiB maximum).".into()); }
        Ok(count)
    })
}
#[tauri::command]
fn add_image_paths(repo: State<'_, Repository>, album_id: String, paths: Vec<String>) -> Result<usize, String> {
    import_dropped_paths(&repo, &album_id, paths)
}
#[tauri::command]
fn add_images(repo: State<'_, Repository>, album_id: String, images: Vec<UploadedImage>) -> Result<usize, String> {
    if images.len() > 100 { return Err("Please import at most 100 images per batch".into()); }
    with_library(&repo, |lib| {
        if !lib.albums.iter().any(|a| a.id == album_id) { return Err("Album not found".into()); }
        let mut count = 0;
        for item in images {
            let b64 = item.data.rsplit_once(',').map(|(_, b)| b).unwrap_or(&item.data);
            let bytes = STANDARD.decode(b64).map_err(to_err)?;
            let mime = if item.mime_type.starts_with("image/") { item.mime_type } else { "image/jpeg".into() };
            let order = next_photo_order(lib, &album_id);
            repo.add_one(lib, &album_id, item.name, bytes, mime, order)?;
            count += 1;
        }
        Ok(count)
    })
}
#[tauri::command]
fn image_data(repo: State<'_, Repository>, photo_id: String, thumbnail: bool) -> Result<String, String> {
    let lib = repo.library.lock().map_err(to_err)?;
    let photo = lib.photos.iter().find(|p| p.id == photo_id).ok_or("Photo not found")?;
    let (path, mime) = if thumbnail { (repo.thumb_path(&photo.id), "image/jpeg") }
        else { (repo.photo_path(&photo.id), photo.mime_type.as_str()) };
    let bytes = fs::read(path).map_err(to_err)?;
    Ok(format!("data:{};base64,{}", mime, STANDARD.encode(bytes)))
}
#[tauri::command]
fn update_photo(repo: State<'_, Repository>, id: String, patch: PhotoPatch) -> Result<(), String> {
    with_library(&repo, |lib| {
        let photo = lib.photos.iter_mut().find(|p| p.id == id).ok_or("Photo not found")?;
        photo.name = valid_title(&patch.name)?;
        photo.description = patch.description;
        photo.location = patch.location;
        photo.taken_at = patch.taken_at;
        photo.tags = patch.tags.into_iter().take(30).collect();
        photo.favorite = patch.favorite;
        photo.show_date = patch.show_date;
        photo.text_alignment = patch.text_alignment;
        photo.style = patch.style;
        Ok(())
    })
}
#[tauri::command]
fn delete_photo(repo: State<'_, Repository>, id: String) -> Result<(), String> {
    with_library(&repo, |lib| {
        if !lib.photos.iter().any(|p| p.id == id) { return Err("Photo not found".into()); }
        lib.photos.retain(|p| p.id != id); Ok(())
    })?;
    let _ = fs::remove_file(repo.photo_path(&id));
    let _ = fs::remove_file(repo.thumb_path(&id));
    Ok(())
}
#[tauri::command]
fn replace_image(repo: State<'_, Repository>, id: String, data: String) -> Result<(), String> {
    let b64 = data.rsplit_once(',').map(|(_, b)| b).unwrap_or(&data);
    let bytes = STANDARD.decode(b64).map_err(to_err)?;
    if bytes.len() > MAX_IMAGE_BYTES { return Err("Edited image exceeds 40 MiB".into()); }
    let image = image::load_from_memory(&bytes).map_err(to_err)?;
    if image.width() as u64 * image.height() as u64 > 150_000_000 { return Err("Image dimensions too large".into()); }
    let mut out = Cursor::new(Vec::new());
    image::DynamicImage::ImageRgb8(image.resize(560, 560, FilterType::Triangle).to_rgb8()).write_to(&mut out, ImageFormat::Jpeg).map_err(to_err)?;
    let path = repo.photo_path(&id);
    let backup = path.with_extension("bak");
    with_library(&repo, |lib| {
        let photo = lib.photos.iter_mut().find(|p| p.id == id).ok_or("Photo not found")?;
        // Keep a one-level backup so a failed image write is recoverable.
        if path.exists() { fs::copy(&path, &backup).map_err(to_err)?; }
        fs::write(&path, &bytes).map_err(to_err)?;
        fs::write(repo.thumb_path(&id), out.into_inner()).map_err(to_err)?;
        photo.width = image.width(); photo.height = image.height(); photo.mime_type = "image/png".into();
        Ok(())
    })?;
    let _ = fs::remove_file(backup);
    Ok(())
}
#[tauri::command]
fn export_album(repo: State<'_, Repository>, id: String) -> Result<String, String> {
    let lib = repo.library.lock().map_err(to_err)?;
    let album = lib.albums.iter().find(|a| a.id == id).ok_or("Album not found")?.clone();
    let mut photos = Vec::new();
    for photo in lib.photos.iter().filter(|p| p.album_id == id) {
        let data = STANDARD.encode(fs::read(repo.photo_path(&photo.id)).map_err(to_err)?);
        photos.push(PortablePhoto { photo: photo.clone(), data_base64: data });
    }
    serde_json::to_string(&PortableAlbum { format: "storily-v2".into(), album, photos }).map_err(to_err)
}
fn import_swift_album(repo: &Repository, content: &str, file_name: &str) -> Result<Album, String> {
    let entries: Vec<serde_json::Value> = serde_json::from_str(content).map_err(to_err)?;
    if entries.len() > 10_000 { return Err("Too many items in legacy archive".into()); }
    let name = Path::new(file_name).file_stem().and_then(|s| s.to_str()).unwrap_or("Imported Album");
    let title = valid_title(name)?;
    // Reject archives depending on external absolute paths. Don't silently
    // import an album with missing images.
    for (i, item) in entries.iter().enumerate() {
        if item.get("imageData").and_then(|x| x.as_str()).filter(|s| !s.is_empty()).is_none() {
            return Err(format!("Legacy image {} has no embedded imageData; re-save it as a self-contained album in the original macOS app", i + 1));
        }
    }
    with_library(repo, |lib| {
        let id = new_id();
        let album = make_album(id.clone(), title, "Imported from original macOS Storily".into(), "classic".into(), next_album_order(lib));
        lib.albums.push(album.clone());
        for (idx, entry) in entries.iter().enumerate() {
            let encoded = entry["imageData"].as_str().ok_or("Missing imageData")?;
            let bytes = STANDARD.decode(encoded).map_err(to_err)?;
            let image_path = entry["imagePath"].as_str().unwrap_or("");
            let name = Path::new(image_path).file_name().and_then(|v| v.to_str()).filter(|s| !s.is_empty())
                .map(|s| s.to_string()).unwrap_or_else(|| format!("Image {}", idx + 1));
            let new = repo.add_one(lib, &id, name, bytes, "image/tiff".into(), idx as i32)?;
            if let Some(photo) = lib.photos.iter_mut().find(|p| p.id == new.id) {
                photo.description = entry["descriptionText"].as_str().unwrap_or("").to_string();
                photo.location = entry["location"].as_str().unwrap_or("").to_string();
                photo.show_date = entry["showDate"].as_bool().unwrap_or(true);
                photo.style = entry["style"].as_str().unwrap_or("classic").to_string();
                photo.text_alignment = entry["textAlignment"].as_str().unwrap_or("center").to_string();
                // Apple reference date (2001-01-01 00:00:00 UTC) offset.
                if let Some(secs) = entry["date"].as_f64() {
                    let millis = ((secs + 978_307_200.0) * 1000.0) as i64;
                    if let Some(date) = chrono::DateTime::<Utc>::from_timestamp_millis(millis) {
                        photo.taken_at = date.format("%Y-%m-%d").to_string();
                    }
                } else if let Some(text) = entry["date"].as_str() {
                    photo.taken_at = text.chars().take(10).collect();
                }
            }
        }
        Ok(album)
    })
}

#[tauri::command]
fn export_album_legacy(repo: State<'_, Repository>, id: String) -> Result<String, String> {
    let lib = repo.library.lock().map_err(to_err)?;
    if !lib.albums.iter().any(|a| a.id == id) { return Err("Album not found".into()); }
    let mut entries = Vec::new();
    for photo in lib.photos.iter().filter(|p| p.album_id == id) {
        let bytes = fs::read(repo.photo_path(&photo.id)).map_err(to_err)?;
        let date = chrono::NaiveDate::parse_from_str(&photo.taken_at, "%Y-%m-%d").ok()
            .and_then(|d| d.and_hms_opt(12, 0, 0))
            .map(|d| (d.and_utc().timestamp() - 978_307_200) as f64).unwrap_or(0.0);
        entries.push(serde_json::json!({
            "id": photo.id, "imagePath": photo.name, "descriptionText": photo.description,
            "location": photo.location, "date": date, "showDate": photo.show_date,
            "style": photo.style, "textAlignment": photo.text_alignment,
            "imageData": STANDARD.encode(bytes)
        }));
    }
    serde_json::to_string_pretty(&entries).map_err(to_err)
}

#[tauri::command]
fn import_album(repo: State<'_, Repository>, content: String, file_name: String) -> Result<Album, String> {
    if content.len() > MAX_ARCHIVE_BYTES { return Err("Archive exceeds 500 MiB".into()); }
    // The original Swift app writes a top-level [ImageMetadata] as JSON. Swift
    // JSONEncoder uses base64 Data and seconds since 2001-01-01 for Date.
    if content.trim_start().starts_with('[') {
        return import_swift_album(&repo, &content, &file_name);
    }
    let payload: PortableAlbum = serde_json::from_str(&content)
        .map_err(|_| "Unrecognized Storily archive format".to_string())?;
    if payload.format != "storily-v2" { return Err("Unsupported .storily archive format".into()); }
    if payload.photos.len() > 10_000 { return Err("Too many photos in archive".into()); }
    let title = valid_title(&payload.album.title)?;
    with_library(&repo, |lib| {
        let id = new_id();
        let mut album = make_album(id.clone(), title, payload.album.description, valid_style(&payload.album.style), next_album_order(lib));
        album.hide_title = payload.album.hide_title;
        album.pdf_custom = payload.album.pdf_custom;
        album.pdf_font_family = valid_font(&payload.album.pdf_font_family);
        album.pdf_font_size = if payload.album.pdf_font_size == 0 { 0 } else { payload.album.pdf_font_size.clamp(12, 24) };
        album.pdf_font_color = valid_color(&payload.album.pdf_font_color);
        album.show_page_count = payload.album.show_page_count;
        lib.albums.push(album.clone());
        for entry in payload.photos {
            let bytes = STANDARD.decode(&entry.data_base64).map_err(to_err)?;
            let order = next_photo_order(lib, &id);
            let mut photo = repo.add_one(lib, &id, entry.photo.name.clone(), bytes, entry.photo.mime_type, order)?;
            if let Some(stored) = lib.photos.iter_mut().find(|p| p.id == photo.id) {
                stored.description = entry.photo.description;
                stored.location = entry.photo.location;
                stored.taken_at = entry.photo.taken_at;
                stored.tags = entry.photo.tags;
                stored.favorite = entry.photo.favorite;
                stored.show_date = entry.photo.show_date;
                stored.text_alignment = entry.photo.text_alignment;
                stored.style = entry.photo.style;
                stored.order = entry.photo.order;
                photo = stored.clone();
            }
            let _ = photo;
        }
        Ok(album)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bad_title_rejected() { assert!(valid_title("  ").is_err()); assert_eq!(valid_title(" Album ").unwrap(), "Album"); }
    #[test]
    fn library_serialization_roundtrip() {
        let value = serde_json::to_string(&Library::default()).unwrap();
        assert_eq!(serde_json::from_str::<Library>(&value).unwrap().version, 2);
    }
    #[test]
    fn legacy_album_fixture_can_be_imported() {
        let root = std::env::temp_dir().join(format!("storily-test-{}", new_id()));
        let repo = Repository::new(root.clone()).unwrap();
        let fixture = include_str!("../../fixtures/sample_legacy.storily");
        let album = import_swift_album(&repo, fixture, "My Old Album.storily").unwrap();
        assert_eq!(album.title, "My Old Album");
        let library = repo.library.lock().unwrap();
        assert_eq!(library.photos.len(), 1);
        assert_eq!(library.photos[0].album_id, album.id);
        assert!(repo.photo_path(&library.photos[0].id).exists());
        drop(library);
        drop(repo);
        let _ = fs::remove_dir_all(root);
    }
    #[test]
    fn portable_format_can_be_serialized() {
        let album = make_album(new_id(), "Test".into(), "".into(), "modern".into(), 0);
        let value = serde_json::to_string(&PortableAlbum { format: "storily-v2".into(), album, photos: vec![] }).unwrap();
        assert!(value.contains("storily-v2"));
    }
    #[test]
    fn older_album_json_defaults_new_fields() {
        let raw = r#"{"id":"a","title":"T","description":"","createdAt":"x","updatedAt":"x","style":"vintage"}"#;
        let album: Album = serde_json::from_str(raw).unwrap();
        assert_eq!(album.style, "vintage");
        assert_eq!(album.order, 0);
        assert!(!album.hide_title);
        assert!(!album.pdf_custom);
        assert!(album.pdf_font_family.is_empty());
        assert!(album.show_page_count);
    }
    #[test]
    fn dropped_png_is_imported_and_text_file_is_skipped() {
        let root = std::env::temp_dir().join(format!("storily-drop-{}", Uuid::new_v4()));
        let repo = Repository::new(root.clone()).unwrap();
        let album = with_library(&repo, |lib| {
            let album = make_album(new_id(), "Trip".into(), String::new(), "modern".into(), 0);
            lib.albums.push(album.clone());
            Ok(album)
        }).unwrap();
        let image_path = root.join("beach.png");
        let mut bytes = Vec::new();
        image::DynamicImage::ImageRgb8(image::RgbImage::from_pixel(8, 8, image::Rgb([20, 40, 200])))
            .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)
            .unwrap();
        fs::write(&image_path, &bytes).unwrap();
        let text_path = root.join("notes.txt");
        fs::write(&text_path, b"not an image").unwrap();
        let count = import_dropped_paths(&repo, &album.id, vec![
            text_path.to_string_lossy().into_owned(),
            image_path.to_string_lossy().into_owned(),
        ]).unwrap();
        assert_eq!(count, 1);
        let lib = repo.library.lock().unwrap();
        assert_eq!(lib.photos.len(), 1);
        assert_eq!(lib.photos[0].name, "beach");
        assert_eq!(lib.photos[0].album_id, album.id);
        drop(lib);
        let _ = fs::remove_dir_all(root);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let root = app.path().app_data_dir()?;
            app.manage(Repository::new(root).map_err(std::io::Error::other)?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_library, create_album, update_album, delete_album, reorder_albums, reorder_photos,
            add_images, add_image_paths, image_data, update_photo, delete_photo, replace_image,
            export_album, export_album_legacy, import_album
        ])
        .run(tauri::generate_context!())
        .expect("Storily failed to start");
}
