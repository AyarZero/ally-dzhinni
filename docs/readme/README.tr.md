**Languages:** [Русский](../../README.md) · [English](./README.en.md) · [简体中文](./README.zh-CN.md) · [Українська](./README.uk.md) · [Tiếng Việt](./README.vi.md) · [हिन्दी](./README.hi.md) · [日本語](./README.ja.md) · [Deutsch](./README.de.md) · [Français](./README.fr.md) · [עברית](./README.he.md) · [العربية](./README.ar.md) · [Español](./README.es.md) · [Português (BR)](./README.pt-BR.md) · [한국어](./README.ko.md) · **Türkçe** · [Bahasa Indonesia](./README.id.md)

> 📖 **Etkileşimli masaüstü rehber uygulaması (16 dil, PDF düzeni ve sürüm geçmişi):** `AllY-Guide.exe` · [../index.html?lang=tr](../index.html?lang=tr)

# AllY · Genie (v0.1)

Birden fazla yapay zekâ modelini ortak konuşma geçmişi, diskte yerel bellek, görev kuyruğu ve limit kontrolü ile tek pencerede birleştiren Windows için yerel masaüstü kabuğu.

*AllY · Genie'nin doğum günü: 23 Kasım 2026. Lisans: MIT.*

---

## Bu uygulama nedir ve hangi sorunu çözer

Yapay zekâ ile düzenli çalışırken görevler kısa sürede farklı tarayıcı sekmelerine, konsol pencerelerine ve ayrı anahtarlara dağılır. Bir modelin beş saatlik limiti dolduğunda başka bir model açıp proje bağlamını baştan anlatmak gerekir.

**AllY · Genie** dört pratik ihtiyacı karşılar:

- **Modeller arasında ortak bağlam.** Konuşma geçmişi ve kural tabanınız yerel olarak Markdown dosyalarında (`pamyat/`) saklanır. Bir sonraki modelin göreve kaldığı yerden devam edebilmesi için yapay zekâ motorunu, modeli veya akıl yürütme derinliğini doğrudan giriş satırından değiştirebilirsiniz.
- **Şeffaf CLI ajanı çalışması.** Standart bir terminalde ajanın mevcut adımını zamanında görmek ve süreç içinde müdahale etmek zordur. AllY'de sol tarafta genişliği ayarlanabilir akıcı bir dikey ayırıcının arkasında durum küresi ve anlık eylem akışı yer alır; sağ tarafta ise anlık yönlendirme (`live-steer`), kuyruk düzenleme ve önemli mesajı öne alma desteğiyle sohbet ve görev kuyruğu bulunur.
- **Limit ve bağlam penceresi kontrolü.** **"Kaynaklar"** bileşeni ana yapay zekâyı, bağlam doluluğunu (`350k` eşiğiyle), 5 saatlik ve haftalık abonelik kotalarını gösterir; **"Yardımcılar"** sekmesi ise diğer bağlantıların bakiyelerini bir araya getirir. Göstergeler ücretli arka plan çağrıları olmadan yerel olarak okunur.
- **Veri kontrolü ve doğrudan bağlantılar.** Sohbetler, `pamyat/` notları, `.claude/skills/` becerileri ve `.ally-data/` yerel ayarları bilgisayarınızda kalır. Kendi aboneliklerinizi ve anahtarlarınızı doğrudan seçtiğiniz sağlayıcılarla kullanırsınız.

---

## Uygulama kimler için tasarlandı

- **Geliştiriciler ve vibe coder'lar** — projelerini Claude Code, Codex, Antigravity veya DeepSeek üzerinden yönetip ajan adımlarını, kuyruğu ve bağlam tüketimini tek bir yönetilebilir pencerede takip etmek isteyenler.
- **Yazarlar, girişimciler ve uzmanlar** — kendi bilgisayarlarında projeleri için ortak bir yerel belleğe ihtiyaç duyanlar.
- **Windows 10/11 kullanıcıları** — iş akışlarına göre düzeni özelleştirilebilen yerel bir araç ve yerleşik geri bildirim üzerinden sonraki sürümlere yön verebilme imkânı arayanlar.

---

## v0.1 sürümünde fiilen çalışan özellikler

### 1. Bağlantılar ve "Oto" modu
Başlamak için en az bir seçeneği bağlamanız yeterlidir. **"Oto"** modunda sistem uygun yürütücüyü kendisi seçer:

| Bağlantı | Çalışma yöntemi | v0.1 sürümündeki yetenekleri |
|---|---|---|
| **Claude Code** | Anthropic Pro / Max aboneliğiyle resmi CLI | Karmaşık görevler, kod, metinler, planlama ve otomatik bağlam sıkıştırma |
| **Codex** | ChatGPT Plus / Pro aboneliğiyle resmi CLI | Depolar üzerinde çalışma ve yanıt sırasında anlık yönlendirme (`live-steer`) |
| **Antigravity** | Resmi Google AI CLI | Büyük bağlamlı analizler (`350k` pencere eşiği) ve kota takibi |
| **DeepSeek Harness** | DeepSeek bakiyesiyle çalışan yerel headless `dsh` profili | Yedek ve ekonomik yürütücü, "Yardımcılar" sekmesinde bakiye kontrolü |
| **API Toplayıcı (OpenRouter)** | Base URL ve anahtar ile Anthropic uyumlu herhangi bir ağ geçidi | Yerel Claude Code CLI süreci üzerinden harici modellerin bağlanması (Anthropic aboneliği gerekmeden) |
| **Qoder CLI** | Yerel CLI (algılama ve oturum açma) | Bağlantı sihirbazı tarafından algılanır (pencere içinden giriş dahil); sohbette ana model rolü bir sonraki güncellemede eklenecektir |

### 2. Çalışma alanı ve arayüz
- **Başlangıç ekranı:** Solda temiz durum küresi, canlı adım akışı ve akıcı ayırıcısı ile **"Sohbet"** yer alır; sağda üstte **"Kaynaklar" / "Yardımcılar"**, altta **"Dizüstü"** izleyicisi bulunur ve yükseklikleri serbestçe ayarlanır.
- **Üst çubuk (sağdan sola):** Sağda saat, geniş **geri bildirim paneli (böcek)**, **fırça** (bileşen taşıma, boyutlandırma ve düzen sıfırlama), **temalar** (varsayılan **Grafit** ile Turkuaz, Gece Yarısı, Koyu, Açık), uygulama içi **kitap simgesi (Rehber ve Sürüm Geçmişi)** ve tam genişlikli **"Okuma Modu"** içeren 3 adımlı **şimşek** sihirbazı.
- **Yerel depolama:** `pamyat/` (yerel Markdown belleği), `.claude/skills/` (yerel beceriler), `.ally-data/` (anahtarlar ve pencere düzeni; Git kapsamı dışındadır).

## Kurulum ve başlatma (Windows 10/11)

**Kurulumdan önce sisteminizde aşağıdakilerin kurulu olduğundan ve `PATH` içinde erişilebilir olduğundan emin olun:**
1. **Node.js 24+** (yerleşik `node:sqlite` modülü desteğiyle)
2. **Python 3**
3. **Git**
4. İlk derleme sırasında (`npm ci` ve Electron indirmesi için) internet erişimi ve en az bir bağlı yapay zekâ motoru veya anahtarı.

Size uygun üç kurulum yönteminden birini seçin:

### Yöntem 1 — Arşiv ve alışıldık `.exe` dosyası ile
1. Deponun ZIP arşivini indirin ve Kiril veya özel karakter içermeyen kısa bir yola, örneğin `C:\AllY` dizinine çıkarın.
2. **`AllY.exe`** dosyasına çift tıklayın — ilk çalıştırmada `node` 24+, `python` ve `git` kurulumlarını kontrol eder, bağımlılıkları yükler, Electron'u indirir, **`programma\Dzhinni.exe`** dosyasını derler, masaüstünde **`AllY`** kısayolunu oluşturur ve pencereyi otomatik açar.
  *Windows SmartScreen imzasız yeni `.exe` için uyarı verirse **Ek bilgi → Yine de çalıştır** seçeneğine tıklayın (başlatıcı kaynak kodu `docs/launchers/` içinde açıktır veya doğrudan `.\ustanovka.ps1` çalıştırabilirsiniz).*
3. Daha sonra uygulamayı **`AllY.exe`**, masaüstündeki **`AllY`** kısayolu veya doğrudan **`programma\Dzhinni.exe`** üzerinden başlatabilirsiniz. Belgeleri ve sürüm geçmişini ayrı bir uygulama penceresinde açmak için **`AllY-Guide.exe`** dosyasını çalıştırın.
4. İlk çalıştırmada 3 adımlı başlangıç sihirbazı açılır — istediğiniz yapay zekâ motorunu bağlayın ve ilk mesajınızı gönderin.

### Yöntem 2 — Terminal komutlarıyla (PowerShell / cmd)
PowerShell'i açın ve sırasıyla şu komutları çalıştırın:

```powershell
git clone https://github.com/AyarZero/ally-dzhinni.git C:\AllY
cd C:\AllY
.\AllY.exe
```

Derlemenin hazır olup olmadığını daha sonra şu komutla kontrol edebilirsiniz:

```powershell
.\AllY.exe -Proverka
```

Terminalden başlatma:

```powershell
.\AllY.exe
```

### Yöntem 3 — Yerel yapay zekânız için hazır kurulum istemi
Bilgisayarınızda hâlihazırda Claude Code, Codex, Antigravity veya başka bir yapay zekâ yardımcısı çalışıyorsa, aşağıdaki metnin tamamını kopyalayıp ona gönderin:

```text
Bu Windows bilgisayarda https://github.com/AyarZero/ally-dzhinni deposundan AllY · Genie (v0.1) yerel masaüstü uygulamasını kur ve çalıştırmaya hazır hale getir:
1. Terminalde `git`, `python` (Python 3) ve `node` (çalışan `node -e "require('node:sqlite')"` doğrulamasıyla Node.js 24+ sürümü gereklidir) kurulumlarının varlığını kontrol et. Eksik bir bileşen varsa veya Node sürümü 24'ün altındaysa bana bildir ve derlemeden önce kurmama yardımcı ol.
2. Depoyu boşluk ve özel/Kiril karakter içermeyen kısa bir yola, örneğin `C:\AllY` dizinine klonla ve bu klasöre geç.
3. Kurulumu başlat: `powershell -NoProfile -ExecutionPolicy Bypass -File .\ustanovka.ps1` ve `programma\Dzhinni.exe` dosyasının derlenmesini bekle.
4. Derlemeyi `powershell -NoProfile -ExecutionPolicy Bypass -File .\ustanovka.ps1 -Proverka` komutuyla doğrula.
5. Sistemde hangi CLI motorlarının (Claude Code, Codex, Antigravity, DeepSeek Harness, Qoder) veya OpenRouter anahtarlarının halihazırda erişilebilir olduğunu kontrol et ve nelerin hazır olduğunu bana kısaca özetle.
6. `programma\Dzhinni.exe` (veya `.\AllY.exe`) dosyasını başlat ve AllY penceresini açıp çalışmaya başlayabileceğimi söyle.
```

*Not: Bağlı CLI yürütücüleri, açık olan çalışma klasöründeki dosyalar üzerinde her okuma veya düzenleme için onay istemeden doğrudan çalışır — önemli projelerinizi Git altında tutun.*

---

## Geri bildirim ve projeye katkı

Üst çubuğun sağ tarafında (saatin solunda) **böcek simgeli "Geri Bildirim"** düğmesi bulunur. Bu düğme üzerinden doğrudan arayüzden şunları yapabilirsiniz:

- bir hatayı, arayüz bozulmasını veya başlatma sorununu bildirmek;
- mesaja kanıt olarak en fazla **3 dosya** eklemek: metin günlükleri `.txt` / `.md` (`2 MB`'a kadar), ekran görüntüleri `.png` / `.jpg` / `.jpeg` / `.webp` / `.gif` (`10 MB`'a kadar) veya kısa videolar `.mp4` / `.webm` / `.mov` (`25 MB`'a kadar, toplam en fazla `30 MB`);
- yeni bir modül, beceri veya kullanım senaryosu önermek.

Yalnızca **form metni ve seçtiğiniz dosyalar** gönderilir — sohbetleriniz, kişisel notlarınız ve anahtarlarınız yerel olarak cihazınızda kalır. Geliştirici yanıtları doğrudan uygulamanın sohbet ekranına geri döner. Proje MIT lisansı altında açık kaynaklıdır: `.claude/skills/` içinde kendi becerilerinizi oluşturabilir ve çekirdek geliştirmeye katkıda bulunabilirsiniz.

---

## Üzerinde çalıştığımız bilinen v0.1 sorunları ve kısıtlamaları

Henüz kısıtlı olan veya şu anda geliştirilmeye devam edilen noktaları şeffaf biçimde paylaşıyoruz:

1. **Ortam bağımlılıkları önceden kurulmalıdır:** `v0.1` kurulumu için `Node.js 24+`, `Python 3` ve `Git` yazılımlarının sistemde önceden kurulu olması gerekir — manuel yazılım hazırlığı gerektirmeyen tek parça bağımsız `.exe` kurulum dosyası henüz geliştirme aşamasındadır.
2. **v0.1 istemci derlemesinde sesli giriş ve seslendirme gizlenmiştir:** Yerel konuşma tanıma (`GigaAM`) ve kurucusunun son iyileştirmeleri tamamlanana kadar mikrofon ve ses düğmeleri geçici olarak kaldırılmıştır.
3. **Günlük ("Dürüst Sohbet") v0.1 istemci derlemesinde gizlenmiştir:** Tüm motorlar için destek tamamlanmakta olup sonraki güncellemede açılacaktır.
4. **Pencere kapatıldıktan sonra arka plan köprüsünün kademeli kapanması:** Pencere kapatıldığında hemen başka bir örnek yeniden açılırsa, yerel köprü sunucusu boşta kalma zaman aşımıyla (~9 dakikaya kadar) kapanabilir.
5. **Qoder entegrasyon aşamasındadır:** Bağlantı sihirbazı yerel Qoder CLI kurulumunu ve oturum durumunu algılar, ancak Qoder'in sohbette ana model olarak kullanılması bir sonraki sürüme kadar kapalıdır.
6. **Geri bildirimlerde büyük ekler için sunucu tarafı güncelleme süreci:** Arka uç güncellemesi tamamlanana kadar ekran görüntüsü veya video gönderirken geri bildirim sunucusu boyut ya da dosya reddi hatası döndürürse, taslağınızı kaybetmeden formu hemen yalnızca metin olarak gönderebilirsiniz.
7. **Platform:** Yalnızca **Windows 10/11** için test edilmiş ve derlenmiştir.

---

## Yol haritası ve tahmini takvim

Tarihler tahminidir — yakın sürümler haftalık olarak planlanmıştır, daha ileri tarihli sürümler ise geniş aralıklarla verilmiştir ve gerçek kullanıcı geri bildirimlerine göre güncellenir:

| Tahmini tarih | Yayımlanması planlanan özellikler |
|---|---|
| **Kasım sonu – Aralık 2026 başı** *(1–2 hafta)* | Arayüz üzerinden gelen ilk geri bildirimlere göre düzeltmeler, geri bildirimlerde fotoğraf/video eklerinin sunucu tarafında tam kabulü, pencere kapatıldığında arka plan köprüsünün anında sonlandırılması |
| **Aralık 2026'nın ikinci yarısı** | Yerleşik **"Görevler ve Projeler"** takipçisi (günlük odak, pano, takvim, kartlar) ve **"Günlük"** sekmesinin seçilen herhangi bir motor üzerinden çalışması |
| **Ocak 2027** | **Yerel ses modunun** geri dönmesi (bulut gerektirmeyen çevrimdışı dikte + yanıt seslendirme) ve manuel `Node.js` ve `Git` kurulumu gerektirmeyen basitleştirilmiş kurucu |
| **Şubat – Mart 2027** | **"Eğitim"** bölümü (pencere içi ders kütüphanesi ve AllY ile sürüm hazırlığına dair ücretsiz başlangıç kursu), özel bileşen oluşturucu ve denetim/içerik modülleri |
| **Nisan – Mayıs 2027** | Çalışma alanı için etkileşimli **bilgi grafiği**, **"Proje Sağlığı"** paneli (bağlantı kapsamı ve güncelliğini yitirmiş düğümler) ve Qoder'in kod okuma yardımcısı olarak tam kapsamlı çalışması |
| **Haziran – Temmuz 2027** | İkinci bir veritabanı olmadan güvenli kanal üzerinden ev bilgisayarına bağlanan **Android istemcisi** beta sürümü + masaüstü uygulamasının macOS ve Linux uyarlaması |
| **Ağustos 2027 ve sonrası** | Kararlı `v1.0` sürümü, topluluk ortak becerileri kataloğu ve kullanıcının birden fazla cihazı arasında çalışma alanı senkronizasyonu |
