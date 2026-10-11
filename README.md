# Bang Story CLI 🎬

> Ubah ide cerita menjadi video YouTube dengan AI langsung dari terminal Anda.

Versi Command Line Interface (CLI) independen dari **[Bang Story](https://github.com/bangtutorial/bang-story)** buatan **[Bang Tutorial](https://youtube.com/bangtutorial)**. Tanpa ketergantungan Electron atau Chromium GUI—sangat ringan, cepat, dan siap dijalankan di server VPS, Linux container, Docker, atau otomatisasi batch via cron job.

---

## 🌟 Fitur Utama

- **Terminal Wizard Interaktif (`bang-story create`):** Panduan langkah demi langkah yang ramah untuk memilih ide, durasi, gaya visual, aspek rasio, hingga narator suara.
- **Mode Otomatisasi Scriptable (`bang-story generate`):** Buat video dalam satu perintah terminal dengan opsi lengkap (cocok untuk bot, cron job YouTube Shorts otomatis, atau pipeline n8n).
- **Arsitektur BYOK (Bring Your Own Key):** Kunci API disimpan aman di file `.env` atau database SQLite lokal. Tidak ada biaya langganan aplikasi.
- **Konsistensi Visual & Suara:**
  - AI LLM menulis naskah per adegan dan merancang *Character Sheet* agar tokoh konsisten di setiap adegan.
  - Narasi suara TTS direkam dalam satu tarikan nafas (*one continuous take*) lalu dipotong otomatis di jeda jeda hening agar warna vokal seragam.
- **Caption Beranimasi Presisi (Whisper DTW):** Mendukung model Whisper lokal untuk menyelaraskan kata per kata dengan Dynamic Time Warping.
- **Ekspor MP4 Berkualitas Tinggi:** Menggunakan FFmpeg dengan filter gerak kamera `perspective` yang halus, transisi `xfade`, audio ducking otomatis, dan subtitle ASS tersinkronisasi.
- **Cross-Platform:** Berjalan di macOS, Linux, dan Windows (Node.js 20+).

---

## 📦 Instalasi

### Prasyarat
- **Node.js 20** atau lebih baru.
- **FFmpeg** (opsional, karena paket sudah menyertakan `ffmpeg-static`).
- **Whisper CLI** (opsional, untuk caption akurat kata per kata: di macOS pasang via `brew install whisper-cpp`).

### Pasang dari Repositori

```bash
git clone https://github.com/ridloabelian/bang-story-cli.git
cd bang-story-cli
npm install
npm run build
npm link    # Menjadikan perintah 'bang-story' dapat diakses dari mana saja
```

---

## 🔑 Konfigurasi Kunci API

Anda dapat mengisi kunci API lewat file `.env` di folder kerja Anda atau langsung menyimpannya ke database lokal aplikasi.

### Cara 1: File `.env` (Direkomendasikan)
Salin `.env.example` menjadi `.env`:
```bash
cp .env.example .env
```
Lalu isi kuncinya:
```env
# Wajib untuk gambar/video
HIGGSFIELD_API_KEY=your_key_here

# Wajib untuk naskah & narasi suara
GEMINI_API_KEY=your_gemini_key_here

# Opsional
ELEVENLABS_API_KEY=your_elevenlabs_key_here
OPENROUTER_API_KEY=your_openrouter_key_here
GROQ_API_KEY=your_groq_key_here
```

### Cara 2: Perintah CLI
```bash
bang-story config set-key higgsfield <kunci-api-higgsfield>
bang-story config set-key gemini <kunci-api-gemini>
bang-story config list
```

---

## 🚀 Cara Penggunaan

### 1. Mode Wizard Interaktif
Cukup ketik:
```bash
bang-story create
```
Terminal akan memandu Anda menjawab:
1. Ide cerita / sinopsis.
2. Target durasi (30s, 60s, 90s, 120s).
3. Format rasio (16:9 Landscape atau 9:16 Shorts/TikTok).
4. Gaya visual (16 pilihan: Stickman sejarah, Anime, Flat 2D, 3D, Dokumenter, dll.).
5. Narator suara (Gemini TTS atau ElevenLabs).
6. Apakah ingin dianimasikan menjadi video AI atau gambar bergerak halus.

---

### 2. Mode Otomatisasi (One-Shot Command)
Sangat cocok untuk script shell, bot otomatis, atau cron job harian:

```bash
# Membuat video cerita 60 detik bergaya stickman
bang-story generate \
  --idea "Kisah heroik perjuangan Pangeran Diponegoro dalam Perang Jawa" \
  --duration 60 \
  --style stickman \
  --aspect 16:9 \
  --output diponegoro.mp4

# Membuat YouTube Shorts 30 detik format 9:16
bang-story generate \
  --idea "3 Fakta unik tentang lubang hitam di luar angkasa" \
  --duration 30 \
  --style flat \
  --aspect 9:16 \
  --output shorts-blackhole.mp4
```

---

## 🛠️ Perintah Lainnya

| Perintah | Deskripsi |
|---|---|
| `bang-story create` | Jalankan interactive wizard untuk membuat video baru. |
| `bang-story generate` (alias: `run`) | Generate video otomatis non-interaktif dengan flags. |
| `bang-story config list` | Tampilkan status konfigurasi kunci API. |
| `bang-story config set-key <provider> <key>` | Simpan kunci API ke database lokal. |
| `bang-story whisper status` | Cek status biner Whisper dan model lokal. |
| `bang-story whisper download` | Unduh model Whisper Small (~488 MB) untuk caption akurat. |
| `bang-story styles` | Tampilkan daftar 16 gaya visual yang didukung. |
| `bang-story models` | Tampilkan katalog model LLM, Higgsfield, dan suara narator. |
| `bang-story projects list` | Tampilkan daftar proyek yang pernah dibuat. |
| `bang-story projects show <id>` | Tampilkan rincian naskah dan adegan dari ID proyek tertentu. |

---

## 🎨 16 Gaya Visual Siap Pakai

Gunakan perintah `bang-story styles` untuk melihat semua gaya:
- **2D:** `stickman` (Sejarah), `flat` (Edukasi & Sains), `whiteboard` (Tutorial), `collage` (Jurnalisme), `watercolor` (Buku anak), `anime` (Drama/Fiksi), `noir` (Horor/Kriminal), `pixel` (Gaming).
- **3D:** `animation3d` (Animasi keluarga), `clay` (Claymation), `lowpoly` (Sains & teknologi), `diorama` (Miniatur kota).
- **Realistis:** `cinematic` (Misteri sinematik), `documentary` (Foto dokumenter), `archival` (Arsip sejarah), `epic` (Fantasi mitologi).

---

## 📜 Lisensi & Atribusi

Proyek ini berlisensi **[MIT License](LICENSE)**.

- **Karya Asli:** [Bang Story](https://github.com/bangtutorial/bang-story) oleh **Bang Tutorial**.
- **Porting & Arsitektur CLI:** Dikembangkan oleh **[Ridlo Abelian](https://github.com/ridloabelian)**.
