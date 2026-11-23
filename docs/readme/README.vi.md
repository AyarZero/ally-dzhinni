**Languages:** [Русский](../../README.md) · [English](./README.en.md) · [简体中文](./README.zh-CN.md) · [Українська](./README.uk.md) · **Tiếng Việt** · [हिन्दी](./README.hi.md) · [日本語](./README.ja.md) · [Deutsch](./README.de.md) · [Français](./README.fr.md) · [עברית](./README.he.md) · [العربية](./README.ar.md) · [Español](./README.es.md) · [Português (BR)](./README.pt-BR.md) · [한국어](./README.ko.md) · [Türkçe](./README.tr.md) · [Bahasa Indonesia](./README.id.md)

> 📖 **Ứng dụng hướng dẫn tương tác (16 ngôn ngữ, bố cục PDF & lịch sử phiên bản):** `AllY-Guide.exe` · [../index.html?lang=vi](../index.html?lang=vi)

# AllY · Djinni (v0.1)

Ứng dụng desktop cục bộ cho Windows, kết hợp nhiều mô hình AI trong một cửa sổ với lịch sử trò chuyện chung, bộ nhớ cục bộ trên ổ đĩa, hàng đợi tác vụ và công cụ theo dõi hạn mức.

*Ngày sinh của AllY · Djinni — ngày 23 tháng 11 năm 2026. Giấy phép: MIT.*

---

## Ứng dụng này là gì và giải quyết vấn đề nào

Khi thường xuyên làm việc với AI, các tác vụ nhanh chóng phân tán qua nhiều tab trình duyệt, cửa sổ dòng lệnh và khóa riêng lẻ. Khi một mô hình hết hạn mức 5 giờ, bạn phải mở mô hình khác rồi giải thích lại ngữ cảnh dự án.

**AllY · Djinni** giải quyết bốn nhu cầu thực tế:

- **Ngữ cảnh thống nhất giữa các mô hình.** Lịch sử trò chuyện và bộ quy tắc của bạn được lưu cục bộ trong các tệp Markdown (`pamyat/`). Bạn có thể đổi hệ thống AI, mô hình hoặc độ sâu suy luận ngay tại ô nhập để mô hình tiếp theo tiếp tục tác vụ từ đúng chỗ đang dở.
- **Theo dõi rõ hoạt động của tác nhân CLI.** Trong terminal thông thường, khó kịp thấy bước hiện tại của tác nhân và can thiệp khi đang chạy. Trong AllY, bên trái hiển thị quả cầu trạng thái và dòng hoạt động hiện tại, ngăn với bên phải bằng đường phân cách dọc có thể kéo để điều chỉnh chiều rộng; bên phải là cuộc trò chuyện và hàng đợi tác vụ, hỗ trợ bổ sung chỉ dẫn ngay khi đang xử lý (`live-steer`), sửa hàng đợi và ưu tiên thông điệp quan trọng.
- **Theo dõi hạn mức và cửa sổ ngữ cảnh.** Tiện ích **“Tài nguyên”** hiển thị hệ thống AI chính, mức sử dụng ngữ cảnh (với ngưỡng `350k`), hạn mức 5 giờ và hằng tuần của các gói đăng ký; tab **“Trợ lý”** tổng hợp số dư của các kết nối còn lại. Các chỉ số được đọc cục bộ, không phát sinh lệnh gọi nền có tính phí.
- **Kiểm soát dữ liệu và kết nối trực tiếp.** Cuộc trò chuyện, ghi chú `pamyat/`, kỹ năng `.claude/skills/` và thiết lập cục bộ `.ally-data/` đều ở trên máy tính của bạn. Bạn dùng trực tiếp gói đăng ký và khóa của mình với nhà cung cấp đã chọn.

---

## Ứng dụng dành cho ai

- **Lập trình viên và người lập trình theo kiểu vibe coding**, đang làm dự án qua Claude Code, Codex, Antigravity hoặc DeepSeek và muốn theo dõi các bước của tác nhân, hàng đợi và mức sử dụng ngữ cảnh trong một cửa sổ dễ kiểm soát.
- **Người viết, doanh nhân và chuyên gia**, cần bộ nhớ cục bộ thống nhất cho các dự án trên PC của mình.
- **Người dùng Windows 10/11**, cần công cụ cục bộ có bố cục tùy chỉnh theo công việc và có thể góp ý cho các bản phát hành tiếp theo qua tính năng phản hồi tích hợp.

---

## Những gì thực sự hoạt động trong phiên bản 0.1

### 1. Kết nối và chế độ “Tự động”
Chỉ cần thiết lập ít nhất một kết nối để bắt đầu. Trong chế độ **“Tự động”**, hệ thống tự chọn công cụ thực thi đang khả dụng:

| Kết nối | Cách hoạt động | Khả năng trong v0.1 |
|---|---|---|
| **Claude Code** | CLI chính thức qua gói đăng ký Anthropic Pro / Max | Tác vụ phức tạp, mã nguồn, văn bản, lập kế hoạch và tự động nén ngữ cảnh |
| **Codex** | CLI chính thức qua gói đăng ký ChatGPT Plus / Pro | Làm việc với kho mã và bổ sung chỉ dẫn ngay khi đang trả lời (`live-steer`) |
| **Antigravity** | CLI chính thức của Google AI | Phân tích với ngữ cảnh lớn (ngưỡng cửa sổ `350k`) và theo dõi hạn mức |
| **DeepSeek Harness** | Cấu hình headless cục bộ `dsh`, sử dụng số dư DeepSeek | Công cụ thực thi dự phòng, tiết kiệm chi phí; kiểm tra số dư trong tab “Trợ lý” |
| **Bộ tổng hợp API (OpenRouter)** | Bất kỳ cổng tương thích Anthropic nào, qua Base URL và khóa | Kết nối mô hình bên ngoài qua tiến trình Claude Code CLI cục bộ (không cần gói đăng ký Anthropic) |
| **Qoder CLI** | CLI cục bộ (phát hiện và đăng nhập) | Được trình hướng dẫn kết nối nhận diện (bao gồm đăng nhập ngay trong cửa sổ); vai trò chính trong trò chuyện sẽ có ở bản cập nhật tiếp theo |

### 2. Không gian làm việc và giao diện
- **Màn hình khởi đầu:** bên trái là **“Trò chuyện”** với quả cầu trạng thái gọn sạch và luồng bước thực thi; bên phải gồm **“Tài nguyên” / “Trợ lý”** (trên) và **“Máy tính”** (dưới), cho phép kéo giãn kích thước mượt mà.
- **Thanh trên cùng (từ phải sang trái):** đồng hồ ở mép phải, khung **phản hồi rộng (con bọ)** cho văn bản và tệp đính kèm, **cọ vẽ** (kéo thả, chỉnh kích thước khối và đặt lại bố cục), **chủ đề** (mặc định **Than chì**, cùng Ngọc lam, Nửa đêm, Tối, Sáng), **biểu tượng sách (Hướng dẫn & Lịch sử phiên bản tích hợp)** và **tia sét** (trình hướng dẫn 3 bước với **“Chế độ đọc”** toàn khung).
- **Lưu trữ cục bộ:** `pamyat/` (bộ nhớ Markdown cục bộ), `.claude/skills/` (kỹ năng cục bộ), `.ally-data/` (khóa và bố cục cửa sổ, được loại trừ khỏi Git).

## Cài đặt và khởi chạy (Windows 10/11)

**Trước khi cài đặt, hãy bảo đảm hệ thống đã cài và có thể truy cập qua `PATH`:**
1. **Node.js 24+** (hỗ trợ mô-đun tích hợp `node:sqlite`)
2. **Python 3**
3. **Git**
4. Kết nối internet trong lần dựng đầu tiên (`npm ci` và tải Electron), cùng ít nhất một bộ máy AI đã kết nối hoặc một khóa.

Chọn một trong ba cách cài đặt thuận tiện sau:

### Cách 1 — dùng tệp nén và tệp `.exe` quen thuộc
1. Tải tệp ZIP của kho mã và giải nén vào đường dẫn ngắn, không có ký tự Cyrillic, chẳng hạn `C:\AllY`.
2. Nhấp đúp vào **`AllY.exe`** — ở lần chạy đầu tiên, tệp sẽ kiểm tra `node` 24+, `python` và `git`, cài các phần phụ thuộc, tải Electron, dựng **`programma\Dzhinni.exe`**, tạo lối tắt **`AllY`** trên màn hình desktop và tự mở cửa sổ ứng dụng.
  *Nếu Windows SmartScreen cảnh báo tệp `.exe` mới chưa ký số, chọn **More info → Run anyway** (mã nguồn bộ khởi chạy công khai tại `docs/launchers/`, hoặc chạy trực tiếp `.\ustanovka.ps1`).*
3. Những lần sau, hãy khởi chạy ứng dụng bằng cách nhấp đúp **`AllY.exe`**, lối tắt **`AllY`** trên desktop hoặc trực tiếp **`programma\Dzhinni.exe`**. Để mở tài liệu và lịch sử phiên bản trong cửa sổ ứng dụng riêng, hãy chạy **`AllY-Guide.exe`**.
4. Ở lần chạy đầu tiên, trình hướng dẫn khởi động 3 bước sẽ mở — kết nối hệ thống AI bạn cần rồi gửi tin nhắn đầu tiên.

### Cách 2 — dùng lệnh trong terminal (PowerShell / cmd)
Mở PowerShell và chạy lần lượt:

```powershell
git clone https://github.com/AyarZero/ally-dzhinni.git C:\AllY
cd C:\AllY
.\AllY.exe
```

Sau đó, bạn có thể kiểm tra bản dựng đã sẵn sàng bằng lệnh:

```powershell
.\AllY.exe -Proverka
```

Khởi chạy từ terminal:

```powershell
.\AllY.exe
```

### Cách 3 — lời nhắc soạn sẵn cho AI cục bộ của bạn
Nếu máy tính của bạn đã có Claude Code, Codex, Antigravity hoặc một trợ lý AI khác đang hoạt động, hãy sao chép toàn bộ nội dung sau và gửi cho trợ lý đó:

```text
Hãy cài đặt và chuẩn bị khởi chạy ứng dụng desktop cục bộ AllY · Djinni (v0.1) trên PC Windows này từ kho mã https://github.com/AyarZero/ally-dzhinni:
1. Kiểm tra trong terminal xem đã có `git`, `python` (Python 3) và `node` chưa (cần phiên bản Node.js 24+ và lệnh kiểm tra `node -e "require('node:sqlite')"` phải chạy thành công). Nếu thiếu thành phần nào hoặc phiên bản Node thấp hơn 24, hãy báo cho tôi và hỗ trợ cài bổ sung trước khi dựng.
2. Sao chép kho mã vào đường dẫn ngắn, không có ký tự Cyrillic và dấu cách, chẳng hạn `C:\AllY`, rồi chuyển vào thư mục đó.
3. Chạy cài đặt: `powershell -NoProfile -ExecutionPolicy Bypass -File .\ustanovka.ps1` và đợi dựng xong `programma\Dzhinni.exe`.
4. Kiểm tra bản dựng bằng lệnh `powershell -NoProfile -ExecutionPolicy Bypass -File .\ustanovka.ps1 -Proverka`.
5. Kiểm tra những bộ máy CLI nào (Claude Code, Codex, Antigravity, DeepSeek Harness, Qoder) hoặc khóa OpenRouter đã có sẵn trong hệ thống, rồi cho tôi biết ngắn gọn những gì đã sẵn sàng.
6. Khởi chạy `programma\Dzhinni.exe` (hoặc `.\AllY.exe`) và báo cho tôi rằng có thể mở cửa sổ AllY để bắt đầu làm việc.
```

*Lưu ý: các công cụ thực thi CLI đã kết nối làm việc trực tiếp với tệp trong thư mục làm việc đang mở mà không hỏi lại mỗi lần đọc hoặc sửa — hãy dùng Git để quản lý các dự án quan trọng.*

---

## Phản hồi và tham gia phát triển dự án

Ở bên phải thanh đầu trang (bên trái đồng hồ) có nút **biểu tượng con bọ — “Phản hồi”**. Ngay trong giao diện, bạn có thể dùng nút này để:

- báo lỗi, sự cố giao diện hoặc vấn đề khởi chạy;
- đính kèm tối đa **3 tệp** minh họa: nhật ký văn bản `.txt` / `.md` (tối đa `2 MB`), ảnh chụp màn hình `.png` / `.jpg` / `.jpeg` / `.webp` / `.gif` (tối đa `10 MB`) hoặc video ngắn `.mp4` / `.webm` / `.mov` (tối đa `25 MB`, tổng cộng tối đa `30 MB`);
- đề xuất mô-đun, kỹ năng hoặc tình huống sử dụng mới.

**Chỉ nội dung biểu mẫu và những tệp bạn chọn** được gửi đi — cuộc trò chuyện, ghi chú cá nhân và khóa vẫn được lưu cục bộ. Phản hồi của nhà phát triển sẽ được gửi về cuộc trò chuyện trong ứng dụng. Dự án mã nguồn mở theo giấy phép MIT: bạn có thể tạo kỹ năng riêng trong `.claude/skills/` và tham gia cải tiến phần lõi.

---

## Các vấn đề và giới hạn đã biết của v0.1 đang được xử lý

Chúng tôi ghi rõ những giới hạn hiện có và những phần đang được hoàn thiện:

1. **Phải cài sẵn các thành phần môi trường:** để cài `v0.1`, cần có sẵn `Node.js 24+`, `Python 3` và `Git` — bộ cài `.exe` độc lập, trọn gói, không cần chuẩn bị phần mềm thủ công vẫn đang được phát triển.
2. **Nhập liệu bằng giọng nói và đọc thành tiếng bị ẩn trong bản dựng ứng dụng v0.1:** các nút micrô và giọng nói tạm thời được gỡ trong khi hoàn thiện nhận dạng giọng nói cục bộ (`GigaAM`) và bộ cài của tính năng này.
3. **Nhật ký (“Trò chuyện chân thành”) được ẩn trong bản dựng v0.1:** tính năng đa nền tảng AI đang được hoàn thiện và sẽ mở lại ở bản cập nhật sắp tới.
4. **Cầu nối nền tắt trễ sau khi đóng cửa sổ:** khi đóng cửa sổ, máy chủ cầu nối cục bộ có thể chỉ kết thúc sau thời gian chờ không hoạt động (tối đa khoảng 9 phút), nếu bạn mở lại ngay một phiên bản khác.
5. **Qoder đang được tích hợp:** trình hướng dẫn kết nối nhận diện CLI Qoder cục bộ và trạng thái đăng nhập, nhưng việc dùng Qoder làm công cụ chính trong trò chuyện vẫn chưa được mở cho đến bản phát hành tiếp theo.
6. **Máy chủ đang được cập nhật để nhận tệp đính kèm lớn trong phản hồi:** nếu máy chủ phản hồi báo lỗi kích thước hoặc từ chối tệp khi gửi ảnh chụp màn hình hay video trước khi hoàn tất cập nhật backend, bạn có thể gửi ngay biểu mẫu chỉ có văn bản mà không mất bản nháp.
7. **Nền tảng:** chỉ được kiểm thử và dựng cho **Windows 10/11**.

---

## Lộ trình và thời gian dự kiến

Các mốc thời gian chỉ mang tính dự kiến — những bản phát hành gần nhất được lên lịch theo tuần, các bản xa hơn dùng khoảng thời gian rộng hơn và có thể điều chỉnh theo phản hồi thực tế của người dùng:

| Thời gian dự kiến | Nội dung dự kiến phát hành |
|---|---|
| **Cuối tháng 11 — đầu tháng 12 năm 2026** *(1–2 tuần)* | Sửa lỗi theo những phản hồi đầu tiên gửi từ giao diện, hỗ trợ đầy đủ phía máy chủ cho ảnh/video đính kèm trong phản hồi, kết thúc cầu nối nền ngay khi đóng cửa sổ |
| **Nửa cuối tháng 12 năm 2026** | Công cụ theo dõi **“Tác vụ và Dự án”** tích hợp (trọng tâm trong ngày, bảng, lịch, thẻ) và tab **“Nhật ký”** hoạt động qua bất kỳ bộ máy nào được chọn |
| **Tháng 1 năm 2027** | Đưa **chế độ giọng nói cục bộ** trở lại (nhập liệu giọng nói ngoại tuyến, không qua đám mây + đọc câu trả lời) và bộ cài đơn giản hơn, không cần cài `Node.js` và `Git` thủ công |
| **Tháng 2 — tháng 3 năm 2027** | Mục **“Học tập”** (thư viện bài học ngay trong cửa sổ và khóa nhập môn miễn phí về AllY và chuẩn bị bản phát hành), công cụ tạo tiện ích tùy chỉnh và các mô-đun rà soát/nội dung |
| **Tháng 4 — tháng 5 năm 2027** | **Đồ thị tri thức** tương tác của không gian làm việc, bảng **“Sức khỏe dự án”** (độ bao phủ liên kết và các nút lỗi thời) cùng khả năng dùng Qoder đầy đủ làm trợ lý đọc mã |
| **Tháng 6 — tháng 7 năm 2027** | Bản beta của **ứng dụng Android**, kết nối với PC tại nhà qua kênh bảo mật, không cần cơ sở dữ liệu thứ hai + điều chỉnh ứng dụng desktop cho macOS và Linux |
| **Từ tháng 8 năm 2027 trở đi** | Bản phát hành ổn định `v1.0`, danh mục kỹ năng dùng chung của cộng đồng và đồng bộ không gian làm việc giữa nhiều thiết bị của người dùng |
