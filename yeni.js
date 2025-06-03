// anmcx.js

// Bu betik, bir uygulama ortamında çalışmak üzere tasarlanmıştır.
// this.request(url, options): Verilen URL'ye GET isteği yapar ve metin olarak yanıt döner.
// this.postRequest(url, body, options): Verilen URL'ye POST isteği yapar ve metin olarak yanıt döner.
// this.parseHtml(htmlString): HTML metnini ayrıştırır ve bir Document nesnesi döner.
// Bu yardımcı fonksiyonların uygulama tarafından sağlanması beklenir.

const ANMCX_BASE_URL = "https://anm.cx";

class AnmCx {

    constructor() {
        // baseUrl genellikle uygulama tarafından JSON dosyasından okunarak ayarlanır.
        // Ancak burada varsayılan olarak da tanımlanabilir.
        this.baseUrl = ANMCX_BASE_URL;
    }

    /**
     * URL'yi mutlak hale getirir.
     * @param {string} url Göreceli veya mutlak URL.
     * @returns {string} Mutlak URL.
     */
    _absUrl(url) {
        if (!url) return "";
        if (url.startsWith("//")) {
            return "https://" + url.substring(2);
        }
        if (url.startsWith("/")) {
            return this.baseUrl + url;
        }
        // Eğer http veya https ile başlamıyorsa ve / ile de başlamıyorsa,
        // sitenin göreceli URL'leri farklı şekilde kullandığı varsayılabilir.
        // Bu durum anm.cx için genellikle / ile başlayan URL'ler şeklindedir.
        if (!url.toLowerCase().startsWith("http")) {
             return this.baseUrl + "/" + url.replace(/^\//, ''); // Başta olası / kaldırılır
        }
        return url;
    }

    /**
     * Ana sayfa bölümlerini ve içerdikleri animeleri/bölümleri getirir.
     * @returns {Promise<HomePageSection[]>} Ana sayfa bölümlerinin listesi.
     * HomePageSection: { title: string, items: MangaTile[] }
     * MangaTile: { id: string (URL yolu), title: string, image: string, subtitle?: string }
     */
    async getHomePageSections() {
        const sectionsToFetch = [
            { id: "son-eklenen-bolumler", title: "Son Eklenen Bölümler", selector: "div.fbaslik h2:contains('Son Eklenen Bölümler')" },
            { id: "populer-animeler", title: "Popüler Animeler", selector: "div.fbaslik h2:contains('Popüler Animeler')" },
            { id: "yeni-eklenen-animeler", title: "Yeni Eklenen Animeler", selector: "div.fbaslik h2:contains('Yeni Eklenen Animeler')" }
        ];

        const html = await this.request(this.baseUrl);
        const doc = this.parseHtml(html);
        const homePageSections = [];

        for (const sectionConfig of sectionsToFetch) {
            const sectionTitleElement = Array.from(doc.querySelectorAll("div.fbaslik h2")).find(el => el.textContent.trim() === sectionConfig.title);
            if (!sectionTitleElement) continue;

            const itemsContainer = sectionTitleElement.closest('div.fbaslik').nextElementSibling;
            if (!itemsContainer || !itemsContainer.matches('div.row.fbbox')) continue;

            const items = [];
            itemsContainer.querySelectorAll("div.anime").forEach(animeElement => {
                const anchor = animeElement.querySelector("div.adata a");
                const img = animeElement.querySelector("div.aimg img");
                const episodeSpan = animeElement.querySelector("div.adata span.bolum");

                if (anchor && img) {
                    const title = anchor.getAttribute('title') || anchor.textContent.trim();
                    const id = new URL(this._absUrl(anchor.getAttribute('href'))).pathname; // Sadece path kısmını alırız
                    const image = this._absUrl(img.getAttribute('data-src') || img.getAttribute('src'));
                    let subtitle = null;

                    if (sectionConfig.id === "son-eklenen-bolumler" && episodeSpan) {
                        subtitle = episodeSpan.textContent.trim();
                    }
                     // Popüler ve Yeni eklenenlerde title zaten anime adı, subtitle'a gerek yok.
                     // Son eklenenlerde title anime adı, subtitle bölüm bilgisi oluyor.

                    items.push({ id, title, image, subtitle });
                }
            });
            homePageSections.push({ title: sectionConfig.title, items });
        }
        return homePageSections;
    }

    /**
     * Verilen sorgu veya filtrelerle anime listesini getirir.
     * @param {MangaRequest} mangaRequest Sayfa, sorgu ve filtre bilgilerini içerir.
     * MangaRequest: { page: number, query?: string, filters?: Filter[] }
     * @returns {Promise<MangaTile[]>} Anime karolarının listesi.
     */
    async getAnimeList(mangaRequest) {
        let url;
        const page = mangaRequest.page || 1;

        if (mangaRequest.query) {
            url = `${this.baseUrl}/search.php?kelime=${encodeURIComponent(mangaRequest.query)}&sayfa=${page}`;
        } else {
            // Filtreler şu an için desteklenmiyor, sadece genel liste.
            // Gelişmiş filtreleme için /tur/{genre} veya /durum/{status} gibi sayfalar incelenmeli.
            url = `${this.baseUrl}/anime-listesi?sayfa=${page}`;
        }

        const html = await this.request(url);
        const doc = this.parseHtml(html);
        const animeTiles = [];

        // Arama sonuçları ve anime listesi genellikle aynı yapıyı kullanır.
        // Ana içerik alanı genellikle .col-md-9 veya benzeri bir class içinde olur.
        const itemsContainer = doc.querySelector(".film-listesi") || doc.querySelector("div.col-md-9 > div.row") || doc.querySelector("div.row.animeler");


        if (itemsContainer) {
            itemsContainer.querySelectorAll("div.anime, div.animeler-liste-mod").forEach(animeElement => {
                const anchor = animeElement.querySelector("div.adata a, a.name, .data a"); // Farklı olası seçiciler
                const img = animeElement.querySelector("div.aimg img, figure img");

                if (anchor && img) {
                    const title = anchor.getAttribute('title') || anchor.textContent.trim();
                    const id = new URL(this._absUrl(anchor.getAttribute('href'))).pathname;
                    const image = this._absUrl(img.getAttribute('data-src') || img.getAttribute('src'));
                    animeTiles.push({ id, title, image });
                }
            });
        }
        return animeTiles;
    }

    /**
     * Belirli bir animenin detaylarını getirir.
     * @param {string} animeId Anime'nin URL yolu (örn: /anime/spy-x-family).
     * @returns {Promise<Anime>} Anime detayları.
     * Anime: { id: string, title: string, image: string, description?: string, genres?: string[], status?: string, episodes?: Episode[] }
     * Episode: { id: string (URL yolu), name: string, number: number }
     */
    async getAnimeDetails(animeId) {
        const url = this.baseUrl + animeId;
        const html = await this.request(url);
        const doc = this.parseHtml(html);

        const title = doc.querySelector("h1.film-title, h1.title, .single-anime-title")?.textContent.trim() || "";
        const image = this._absUrl(doc.querySelector("div.film-poster img, .poster img, .anime-cover img")?.getAttribute('src'));
        const description = doc.querySelector("div.film-ozet > p, .summary > p, .description-text")?.textContent.trim();

        const genres = [];
        doc.querySelectorAll("div.film-bilgiler ul li, .anime-info li").forEach(li => {
            const strongText = li.querySelector("strong")?.textContent.trim().toLowerCase();
            if (strongText === "tür:" || strongText === "türü:") {
                li.querySelectorAll("a").forEach(a => genres.push(a.textContent.trim()));
            }
        });
        
        let status = "";
        const statusElement = Array.from(doc.querySelectorAll("div.film-bilgiler ul li, .anime-info li"))
            .find(li => li.querySelector("strong")?.textContent.trim().toLowerCase().startsWith("durum"));
        if (statusElement) {
            status = statusElement.textContent.replace(/Durum:|Durumu:/i, "").trim();
        }


        const episodes = [];
        doc.querySelectorAll("div.bolumler ul#bolumler-listesi li a, .episode-list .episode-item a, .episodes-list li a").forEach(epAnchor => {
            const name = epAnchor.textContent.trim();
            const id = new URL(this._absUrl(epAnchor.getAttribute('href'))).pathname;
            // Bölüm numarasını başlıktan çıkarmaya çalışalım
            const numberMatch = name.match(/(\d+(\.\d+)?)\.?\s*Bölüm/i);
            const number = numberMatch ? parseFloat(numberMatch[1]) : 0; // Eşleşme yoksa 0 veya başka bir varsayılan
            episodes.push({ id, name, number });
        });
        // Bölümleri numarasına göre sırala (genellikle zaten sıralıdır ama garanti olsun)
        episodes.sort((a, b) => a.number - b.number);


        return { id: animeId, title, image, description, genres, status, episodes };
    }

    /**
     * Bir bölüm için mevcut video sunucularını getirir.
     * @param {string} episodeId Bölümün URL yolu (örn: /izle/spy-x-family-1-bolum).
     * @returns {Promise<VideoServer[]>} Video sunucularının listesi.
     * VideoServer: { name: string, url: string (player iframe URL) }
     */
    async getVideoServers(episodeId) {
        const url = this.baseUrl + episodeId;
        const html = await this.request(url);
        const doc = this.parseHtml(html);
        const servers = [];

        const serverAnchors = doc.querySelectorAll("ul.alternatifler li a, .server-list .server-item a");

        for (const anchor of serverAnchors) {
            const name = anchor.textContent.trim();
            const onclickAttr = anchor.getAttribute("onclick");

            if (onclickAttr && onclickAttr.includes("get_video_player")) {
                // onclick="get_video_player('NjY3NjQ=','standard');" gibi bir yapı bekleniyor
                const match = onclickAttr.match(/get_video_player\s*\(\s*'([^']*)'\s*,\s*'([^']*)'\s*\)/);
                if (match && match.length === 3) {
                    const videoInternalId = match[1];
                    const videoType = match[2];
                    
                    try {
                        const ajaxUrl = `${this.baseUrl}/ajax/get_video_player.php`;
                        const postData = `id=${videoInternalId}&type=${videoType}`;
                        
                        const playerResponseJson = await this.postRequest(ajaxUrl, postData, {
                            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                            'X-Requested-With': 'XMLHttpRequest' // Gerekli olabilir
                        });
                        const playerResponse = JSON.parse(playerResponseJson);

                        if (playerResponse.status === "ok" && playerResponse.player_url) {
                            servers.push({ name, url: this._absUrl(playerResponse.player_url) });
                        }
                    } catch (e) {
                        console.error(`Error fetching player URL for ${name}:`, e);
                    }
                }
            } else if (anchor.hasAttribute('data-src')) { // Alternatif bir yapı için
                 servers.push({ name, url: this._absUrl(anchor.getAttribute('data-src')) });
            }
        }
        return servers;
    }

    /**
     * Verilen sunucu URL'sinden gerçek video dosyasının URL'sini alır.
     * @param {VideoRequest} videoRequest Sunucu URL'sini içerir.
     * VideoRequest: { url: string (player iframe URL) }
     * @returns {Promise<Video>} Video detayları.
     * Video: { url: string (direkt video linki), quality: string, format: "HLS" | " adaptación" }
     */
    async getVideo(videoRequest) {
        const playerUrl = videoRequest.url; // Bu zaten getVideoServers'dan gelen mutlak URL olmalı
        const html = await this.request(playerUrl);
        // anm.cx player sayfasında genellikle şöyle bir yapı olur:
        // <script> ... var video = [{file:"...",label:"...",type:"..."}]; ... </script>
        
        const videoDataMatch = html.match(/var\s+video\s*=\s*(\[.*?\])\s*;/s);
        if (videoDataMatch && videoDataMatch[1]) {
            try {
                // JSON.parse doğrudan çalışmayabilir, çünkü bu bir JS nesnesi, saf JSON değil.
                // eval kullanmak risklidir. String manipülasyonu veya daha güvenli bir ayrıştırıcı gerekebilir.
                // Basitlik adına, string manipülasyonu ile 'file' ve 'label' çekmeye çalışalım.
                // VEYA, eğer yapı her zaman [{...}] ise ve tek elemanlıysa:
                const videoArrayString = videoDataMatch[1];
                
                // Geçici ve basit bir çözüm:
                // Bu kısım, videoArrayString'in tam yapısına göre daha sağlam hale getirilmeli.
                // Örneğin, new Function ile güvenli bir şekilde ayrıştırma denenebilir.
                // const videoArray = new Function(`return ${videoArrayString};`)();

                // Daha basit bir regex ile ilk 'file' ve 'label'ı çekmeye çalışalım:
                const fileMatch = videoArrayString.match(/file\s*:\s*"([^"]+)"/);
                const labelMatch = videoArrayString.match(/label\s*:\s*"([^"]+)"/);
                const typeMatch = videoArrayString.match(/type\s*:\s*"([^"]+)"/);


                if (fileMatch && fileMatch[1]) {
                    const videoUrl = this._absUrl(fileMatch[1]); // Bazen player içindeki URL de göreceli olabilir
                    const quality = labelMatch ? labelMatch[1] : "Default";
                    let format = " adaptación"; // Varsayılan
                    if (typeMatch && (typeMatch[1].toLowerCase() === 'hls' || typeMatch[1].toLowerCase() === 'm3u8')) {
                        format = "HLS";
                    } else if (videoUrl.includes(".m3u8")) {
                        format = "HLS";
                    }
                    
                    return { url: videoUrl, quality, format };
                }
            } catch (e) {
                console.error("Error parsing video data from player:", e);
                throw new Error("Player'dan video verisi ayrıştırılamadı.");
            }
        }
        throw new Error("Video dosyası bulunamadı veya player yapısı değişmiş.");
    }
}

// Uygulamanın bu kaynağı kullanabilmesi için bir örneğini dışa aktarırız.
// Uygulama genellikle `export const source = new AnmCx();` gibi bir yapıyı bekler.
// Veya `export default new AnmCx();`
// Kullanılan modül sistemine göre değişiklik gösterebilir.
// Tarayıcı ortamında doğrudan `window.AnmCxSource = new AnmCx();` da yapılabilir.
// Şimdilik sınıfı global'e atayalım veya modül sistemine uygun export edelim.
// Eğer bu bir modül ise:
// export default AnmCx; // Sınıfı dışa aktar
// export const source = new AnmCx(); // Örneği dışa aktar (yaygın kullanım)

// Eğer bu script doğrudan bir <script> tagı ile yükleniyorsa:
// window.AnmCx = AnmCx; // Sınıfı global scope'a ekle
// Ya da doğrudan bir örnek oluştur:
// window.anmcxSource = new AnmCx();

