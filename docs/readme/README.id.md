**Languages:** [Русский](../../README.md) · [English](./README.en.md) · [简体中文](./README.zh-CN.md) · [Українська](./README.uk.md) · [Tiếng Việt](./README.vi.md) · [हिन्दी](./README.hi.md) · [日本語](./README.ja.md) · [Deutsch](./README.de.md) · [Français](./README.fr.md) · [עברית](./README.he.md) · [العربية](./README.ar.md) · [Español](./README.es.md) · [Português (BR)](./README.pt-BR.md) · [한국어](./README.ko.md) · [Türkçe](./README.tr.md) · **Bahasa Indonesia**

> 📖 **Aplikasi panduan interaktif (16 bahasa, tata letak PDF & riwayat versi):** `AllY-Guide.exe` · [../index.html?lang=id](../index.html?lang=id)

# AllY · Jin (v0.1)

Antarmuka desktop lokal untuk Windows yang menyatukan beberapa AI dalam satu jendela dengan riwayat percakapan bersama, memori lokal di disk, antrean tugas, dan pemantauan batas penggunaan.

*Ulang tahun AllY · Jin — 23 November 2026. Lisensi: MIT.*

---

## Apa aplikasi ini dan masalah apa yang diselesaikannya

Saat rutin bekerja dengan AI, tugas cepat tersebar di berbagai tab browser, jendela konsol, dan kunci akses terpisah. Ketika batas penggunaan lima jam suatu model habis, Anda harus membuka model lain dan menjelaskan ulang konteks proyek.

**AllY · Jin** menangani empat kebutuhan praktis:

- **Konteks bersama antarmodel.** Riwayat percakapan dan kumpulan aturan Anda disimpan secara lokal dalam file Markdown (`pamyat/`). Anda dapat mengganti AI, model, atau kedalaman penalaran langsung dari kolom input agar model berikutnya melanjutkan tugas dari titik yang sama.
- **Aktivitas agen CLI yang transparan.** Di terminal biasa, sulit memantau langkah agen saat ini dan melakukan intervensi tepat waktu. Di AllY, sisi kiri menampilkan bola status dan aliran aktivitas terkini di balik pembatas vertikal halus yang dapat digeser untuk mengatur lebar, sedangkan sisi kanan menampilkan percakapan dan antrean tugas dengan dukungan klarifikasi saat proses berjalan (`live-steer`), penyuntingan antrean, dan prioritas untuk pesan penting.
- **Pemantauan batas penggunaan dan jendela konteks.** Widget **“Sumber Daya”** menampilkan AI utama, penggunaan konteks (dengan ambang `350k`), serta kuota langganan 5 jam dan mingguan, sementara tab **“Asisten”** merangkum saldo koneksi lainnya. Metrik dibaca secara lokal tanpa panggilan latar belakang berbayar.
- **Kontrol data dan koneksi langsung.** Percakapan, catatan `pamyat/`, keterampilan `.claude/skills/`, dan pengaturan lokal `.ally-data/` tetap berada di komputer Anda. Anda menggunakan langganan dan kunci sendiri langsung dengan penyedia yang dipilih.

---

## Untuk siapa aplikasi ini dibuat

- **Pengembang dan pelaku vibe coding** yang mengelola proyek melalui Claude Code, Codex, Antigravity, atau DeepSeek dan ingin memantau langkah agen, antrean, serta penggunaan konteks dalam satu jendela yang mudah dikendalikan.
- **Penulis, pengusaha, dan profesional** yang memerlukan memori lokal terpadu untuk proyek mereka di PC sendiri.
- **Pengguna Windows 10/11** yang membutuhkan alat lokal dengan tata letak yang dapat disesuaikan untuk tugas mereka serta kesempatan memengaruhi rilis berikutnya melalui umpan balik bawaan.

---

## Yang benar-benar berfungsi di versi 0.1

### 1. Koneksi dan mode “Otomatis”
Untuk memulai, cukup hubungkan setidaknya satu opsi. Dalam mode **“Otomatis”**, sistem memilih sendiri agen yang tersedia:

| Koneksi | Cara kerja | Kemampuan di v0.1 |
|---|---|---|
| **Claude Code** | CLI resmi dengan langganan Anthropic Pro / Max | Tugas kompleks, kode, teks, perencanaan, dan pemadatan konteks otomatis |
| **Codex** | CLI resmi dengan langganan ChatGPT Plus / Pro | Bekerja pada repositori dan menerima klarifikasi saat respons sedang berlangsung (`live-steer`) |
| **Antigravity** | CLI resmi Google AI | Analisis dengan konteks besar (ambang jendela `350k`) dan pemantauan kuota |
| **DeepSeek Harness** | Profil headless lokal `dsh` yang menggunakan saldo DeepSeek | Agen cadangan yang hemat biaya, pemeriksaan saldo di tab “Asisten” |
| **Agregator API (OpenRouter)** | Gateway apa pun yang kompatibel dengan Anthropic melalui Base URL dan kunci | Menghubungkan model eksternal melalui proses lokal Claude Code CLI (tanpa langganan Anthropic) |
| **Qoder CLI** | CLI lokal (deteksi dan login) | Terdeteksi oleh wizard koneksi (termasuk login dari jendela); peran sebagai agen utama dalam percakapan akan hadir pada pembaruan berikutnya |

### 2. Ruang kerja dan antarmuka
- **Layar awal:** di kiri terbuka **“Percakapan”** dengan bola status bersih tanpa teks dan alur langkah langsung; di kanan tersedia **“Sumber Daya” / “Asisten”** (atas) dan **“Laptop”** (bawah) yang dapat diubah tingginya secara bebas.
- **Panel atas (dari kanan ke kiri):** jam di kanan, panel **umpan balik lebar (serangga)**, **kuas** (geser & ubah ukuran widget, atur ulang tata letak), **tema** (**Grafit** secara default, serta Toska, Tengah Malam, Gelap, Terang), **ikon buku** (Panduan & Riwayat Versi di dalam aplikasi), dan **petir** (wizard 3 langkah dengan **“Mode Baca”** penuh).
- **Penyimpanan lokal:** `pamyat/` (memori Markdown lokal), `.claude/skills/` (keterampilan lokal), `.ally-data/` (kunci dan tata letak jendela, dikecualikan dari Git).

## Instalasi dan menjalankan aplikasi (Windows 10/11)

**Sebelum instalasi, pastikan komponen berikut sudah terinstal dan tersedia di `PATH`:**
1. **Node.js 24+** (dengan dukungan modul bawaan `node:sqlite`)
2. **Python 3**
3. **Git**
4. Akses internet selama build pertama (`npm ci` dan pengunduhan Electron), serta setidaknya satu mesin AI atau kunci yang sudah terhubung.

Pilih salah satu dari tiga cara instalasi berikut:

### Cara 1 — melalui arsip dan `.exe` yang familier
1. Unduh arsip ZIP repositori dan ekstrak ke jalur pendek tanpa karakter Kiril, misalnya `C:\AllY`.
2. Klik dua kali **`AllY.exe`** — saat pertama kali dijalankan, peluncur akan memeriksa `node` 24+, `python`, dan `git`, menginstal dependensi, mengunduh Electron, membangun **`programma\Dzhinni.exe`**, membuat pintasan **`AllY`** di desktop, lalu langsung membuka jendela.
  *Jika Windows SmartScreen menampilkan peringatan untuk `.exe` baru tanpa tanda tangan digital, klik **Info selengkapnya → Tetap jalankan** (kode sumber peluncur terbuka di `docs/launchers/`, atau jalankan `.\ustanovka.ps1` langsung).*
3. Untuk penggunaan selanjutnya, jalankan aplikasi dengan mengeklik dua kali **`AllY.exe`**, pintasan **`AllY`** di desktop, atau langsung melalui **`programma\Dzhinni.exe`**. Untuk membuka panduan dan riwayat versi di jendela aplikasi tersendiri, jalankan **`AllY-Guide.exe`**.
4. Saat pertama kali dijalankan, wizard awal 3 langkah akan terbuka — hubungkan AI yang diinginkan dan kirim pesan pertama.

### Cara 2 — menggunakan perintah di terminal (PowerShell / cmd)
Buka PowerShell dan jalankan secara berurutan:

```powershell
git clone https://github.com/AyarZero/ally-dzhinni.git C:\AllY
cd C:\AllY
.\AllY.exe
```

Anda dapat memeriksa kesiapan build nanti dengan perintah:

```powershell
.\AllY.exe -Proverka
```

Menjalankan dari terminal:

```powershell
.\AllY.exe
```

### Cara 3 — prompt siap pakai untuk AI lokal Anda
Jika Claude Code, Codex, Antigravity, atau asisten AI lain sudah berjalan di komputer Anda, salin seluruh teks berikut dan kirimkan kepadanya:

```text
Instal dan siapkan aplikasi desktop lokal AllY · Jin (v0.1) agar siap dijalankan di PC Windows ini dari repositori https://github.com/AyarZero/ally-dzhinni:
1. Periksa di terminal apakah `git`, `python` (Python 3), dan `node` tersedia (diperlukan Node.js 24+ yang lolos pemeriksaan `node -e "require('node:sqlite')"`). Jika ada yang belum tersedia atau versi Node di bawah 24, beri tahu saya dan bantu instal komponen yang diperlukan sebelum build.
2. Klon repositori ke jalur pendek tanpa karakter Kiril dan spasi, misalnya `C:\AllY`, lalu masuk ke folder tersebut.
3. Jalankan instalasi: `powershell -NoProfile -ExecutionPolicy Bypass -File .\ustanovka.ps1` dan tunggu hingga build `programma\Dzhinni.exe` selesai.
4. Periksa build dengan perintah `powershell -NoProfile -ExecutionPolicy Bypass -File .\ustanovka.ps1 -Proverka`.
5. Periksa mesin CLI (Claude Code, Codex, Antigravity, DeepSeek Harness, Qoder) atau kunci OpenRouter yang sudah tersedia di sistem, lalu jelaskan secara singkat apa yang sudah siap.
6. Jalankan `programma\Dzhinni.exe` (atau `.\AllY.exe`) dan beri tahu saya bahwa jendela AllY sudah dapat dibuka untuk mulai bekerja.
```

*Catatan: agen CLI yang terhubung bekerja langsung dengan file di folder kerja yang terbuka tanpa meminta izin untuk setiap pembacaan atau penyuntingan — kelola proyek penting dengan Git.*

---

## Umpan balik dan partisipasi dalam pengembangan proyek

Di sisi kanan header (sebelah kiri jam) terdapat tombol dengan **ikon serangga — “Umpan Balik”**. Melalui tombol ini, langsung dari antarmuka Anda dapat:

- melaporkan bug, kerusakan antarmuka, atau masalah saat menjalankan aplikasi;
- melampirkan hingga **3 file** pendukung pada pesan: log teks `.txt` / `.md` (hingga `2 MB`), tangkapan layar `.png` / `.jpg` / `.jpeg` / `.webp` / `.gif` (hingga `10 MB`), atau video pendek `.mp4` / `.webm` / `.mov` (hingga `25 MB`, total hingga `30 MB`);
- mengusulkan modul, keterampilan, atau skenario penggunaan baru.

Yang dikirim **hanya teks formulir dan file yang Anda pilih** — percakapan, catatan pribadi, dan kunci tetap tersimpan secara lokal. Balasan pengembang akan masuk ke percakapan aplikasi. Proyek ini terbuka di bawah lisensi MIT: Anda dapat membuat keterampilan sendiri di `.claude/skills/` dan ikut mengembangkan inti aplikasi.

---

## Masalah yang diketahui dan batasan v0.1 yang sedang kami tangani

Kami mencatat secara terbuka hal-hal yang masih terbatas atau sedang disempurnakan:

1. **Dependensi lingkungan harus diinstal terlebih dahulu:** instalasi `v0.1` memerlukan `Node.js 24+`, `Python 3`, dan `Git` yang sudah terinstal — penginstal `.exe` mandiri terpadu tanpa persiapan perangkat lunak manual masih dikerjakan.
2. **Input suara dan pembacaan suara disembunyikan di build klien v0.1:** tombol mikrofon dan suara untuk sementara dihapus selama penyempurnaan pengenalan ucapan lokal (`GigaAM`) dan penginstalnya.
3. **Jurnal (“Percakapan Jujur”) disembunyikan pada build klien v0.1:** dukungan multi-mesin sedang diselesaikan dan tab akan dibuka pada pembaruan mendatang.
4. **Penghentian bertahap bridge latar belakang setelah jendela ditutup:** saat jendela ditutup, server bridge lokal dapat baru berhenti setelah batas waktu tidak aktif (hingga ~9 menit) jika instans lain langsung dibuka kembali.
5. **Qoder sedang diintegrasikan:** wizard koneksi mendeteksi CLI Qoder lokal dan status login, tetapi penggunaan Qoder sebagai agen utama dalam percakapan belum diaktifkan hingga rilis berikutnya.
6. **Pembaruan bertahap server untuk menerima lampiran besar dalam umpan balik:** jika saat mengirim tangkapan layar atau video server umpan balik mengembalikan kesalahan ukuran atau menolak file sebelum pembaruan backend selesai, formulir dapat langsung dikirim sebagai teks tanpa kehilangan draf.
7. **Platform:** hanya diuji dan dibangun untuk **Windows 10/11**.

---

## Peta jalan dan perkiraan jadwal

Jadwal bersifat perkiraan — rilis terdekat direncanakan per minggu, sedangkan rencana yang lebih jauh menggunakan rentang waktu lebih luas dan dapat bergeser sesuai umpan balik nyata pengguna:

| Perkiraan waktu | Rencana rilis |
|---|---|
| **Akhir November — awal Desember 2026** *(1–2 minggu)* | Perbaikan berdasarkan umpan balik awal dari antarmuka, dukungan penuh server untuk menerima lampiran foto/video dalam umpan balik, penghentian langsung bridge latar belakang saat jendela ditutup |
| **Paruh kedua Desember 2026** | Pelacak bawaan **“Tugas dan Proyek”** (fokus harian, papan, kalender, kartu) dan tab **“Jurnal”** yang dapat menggunakan mesin apa pun yang dipilih |
| **Januari 2027** | Kembalinya **mode suara lokal** (dikte offline tanpa cloud + pembacaan respons) dan penginstal yang lebih sederhana tanpa instalasi manual `Node.js` dan `Git` |
| **Februari — Maret 2027** | Bagian **“Pembelajaran”** (pustaka pelajaran di dalam jendela dan kursus pengantar gratis tentang AllY serta persiapan rilis), pembuat widget pengguna, dan modul audit/konten |
| **April — Mei 2027** | **Graf pengetahuan** ruang kerja yang interaktif, panel **“Kesehatan Proyek”** (cakupan hubungan dan simpul usang), serta dukungan penuh Qoder sebagai asisten pembacaan kode |
| **Juni — Juli 2027** | Rilis beta **klien Android** dengan koneksi ke PC rumah melalui saluran aman tanpa basis data kedua + adaptasi aplikasi desktop untuk macOS dan Linux |
| **Agustus 2027 dan seterusnya** | Rilis stabil `v1.0`, katalog keterampilan bersama komunitas, dan sinkronisasi ruang kerja di beberapa perangkat pengguna |
