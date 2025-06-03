import {
    Source,
    Manga, // Anime için de bu kullanılır
    Chapter, // Bölüm (Episode) için
    ChapterDetails, // Bölüm detayları (Video linkleri için)
    HomeSection,
    MangaTile,
    PagedResults,
    SearchRequest, // Arama isteği için
    Request,
    Response,
    MangaStatus, // Anime durumu için (Ongoing, Completed vb.)
    TagSection, // Filtreleme ve etiketler için
    LanguageCode,
    ContentRating,
    SourceInfo,
    Page, // Video kaynaklarını temsil etmek için
    RequestManager,
    HomeSectionType
} from 'sora-paperback-extensions-common'; // Gerçek import yolu uygulamanıza göre değişebilir

// Sora'nın sağladığı fabrika fonksiyonlarını import ettiğimizi varsayalım
// Bu importlar genellikle 'sora-paperback-extensions-common' içinde bulunur
import {
    createMangaTile,
    createHomeSection,
    createManga,
    createChapter,
    createChapterDetails,
    createPage,
    createPagedResults,
    createRequestObject,
    createSearchRequest, // Kullanılacaksa
    createTagSection     // Kullanılacaksa
} from 'sora-paperback-extensions-common';

const ANMCX_BASE_URL = "https://anm.cx";

export const AnmCxInfo: SourceInfo = {
    // JSON dosyasındaki bilgiler buraya da eklenebilir veya JSON'dan okunabilir.
    // Sora'nın yapısına göre bu bilgiler genellikle Info.plist veya benzeri bir dosyadan gelir.
    // Şimdilik JSON'daki bilgilerin geçerli olduğunu varsayalım.
    // Bu kısım Sora'nın tam entegrasyonuna göre ayarlanmalıdır.
    id: "AnmCx",
    name: "Anm.cx",
    author: "Yapay Zeka",
    authorWebsite: "https://github.com/GoogleCloudPlatform/generative-ai",
    version: "1.0.1",
    description: "Anm.cx sitesinden Türkçe altyazılı ve dublaj anime izlemek için kaynak.",
    icon: "anmcx.png", // Bu dosyanın pakette olması gerekir
    websiteBaseURL: ANMCX_BASE_URL,
    contentRating: ContentRating.EVERYONE,
    language: LanguageCode.TURKISH,
    sourceTags: [
        { text: "Türkçe", type: "info" },
        { text: "Anime", type: "success" }
    ]
};

export class AnmCx extends Source {
    // RequestManager ve Cheerio genellikle Source sınıfından miras alınır veya constructor'da inject edilir.
    // Sora'nın güncel yapısına göre this.requestManager ve this.cheerio kullanılabilir olmalıdır.
    // Eğer Source sınıfında tanımlı değilse, constructor'a eklenmelidir.
    // constructor(cheerio: CheerioAPI, requestManager: RequestManager) {
    //     super(cheerio);
    //     this.requestManager = requestManager;
    // }

    // SourceInfo metadata'sı
    override getSourceInfo(): SourceInfo {
        return AnmCxInfo;
    }

    override getCloudflareBypassRequired(): boolean {
        return false; // anm.cx Cloudflare kullanmıyorsa veya bypass gerektirmiyorsa
    }

    // Base URL
    get baseUrl(): string {
        return ANMCX_BASE_URL;
    }

    // Helper: URL'yi mutlak hale getirir
    private _absUrl(url: string | undefined): string {
        if (!url) return "";
        if (url.startsWith("//")) {
            return "https://" + url.substring(2);
        }
        if (url.startsWith("/")) {
            return this.baseUrl + url;
        }
        if (!url.toLowerCase().startsWith("http")) {
            return this.baseUrl + "/" + url.replace(/^\//, '');
        }
        return url;
    }

    // Helper: Anime durumunu eşleştirir
    private _parseStatus(statusText: string | undefined): MangaStatus {
        const s = statusText?.toLowerCase() ?? "";
        if (s.includes("devam ediyor")) return MangaStatus.ONGOING;
        if (s.includes("tamamlandı")) return MangaStatus.COMPLETED;
        if (s.includes("yakında")) return MangaStatus.ONGOING; // Veya UNKNOWN
        return MangaStatus.UNKNOWN;
    }

    // Ana Sayfa Bölümleri
    override async getHomePageSections(sectionCallback: (section: HomeSection) => void): Promise<void> {
        const sectionsConfig = [
            { id: "son_eklenen_bolumler", title: "Son Eklenen Bölümler", type: HomeSectionType.LATEST },
            { id: "populer_animeler", title: "Popüler Animeler", type: HomeSectionType.FEATURED },
            { id: "yeni_eklenen_animeler", title: "Yeni Eklenen Animeler", type: HomeSectionType.NEW }
        ];

        const request = createRequestObject({
            url: this.baseUrl,
            method: 'GET'
        });
        const response: Response = await this.requestManager.schedule(request, 1);
        const $ = this.cheerio.load(response.data);

        for (const sectionConfig of sectionsConfig) {
            const sectionTitleElement = Array.from($("div.fbaslik h2")).find(el => $(el).text().trim() === sectionConfig.title);
            if (!sectionTitleElement) continue;

            const itemsContainer = $(sectionTitleElement).closest('div.fbaslik').next('div.row.fbbox');
            if (!itemsContainer) continue;

            const animeTiles: MangaTile[] = [];
            itemsContainer.find("div.anime").each((_, animeElement) => {
                const anchor = $(animeElement).find("div.adata a");
                const img = $(animeElement).find("div.aimg img");
                const episodeSpan = $(animeElement).find("div.adata span.bolum");

                if (anchor.length && img.length) {
                    const titleText = anchor.attr('title') || anchor.text().trim();
                    // URL'den ID'yi alırken new URL().pathname kullanmak daha güvenli
                    const href = anchor.attr('href');
                    if (!href) return;
                    
                    let id: string;
                    try {
                        id = new URL(this._absUrl(href)).pathname;
                    } catch (e) {
                        console.error(`Invalid URL for tile: ${href}`);
                        return; // Geçersiz URL ise atla
                    }

                    const image = this._absUrl(img.attr('data-src') || img.attr('src'));
                    let subtitleText: string | undefined = undefined;

                    if (sectionConfig.id === "son_eklenen_bolumler" && episodeSpan.length) {
                        subtitleText = episodeSpan.text().trim();
                    }
                    
                    animeTiles.push(createMangaTile({
                        id: id,
                        title: { text: titleText },
                        image: image,
                        subtitleText: subtitleText ? { text: subtitleText } : undefined
                    }));
                }
            });

            if (animeTiles.length > 0) {
                const homeSection = createHomeSection({
                    id: sectionConfig.id,
                    title: sectionConfig.title,
                    items: animeTiles,
                    type: sectionConfig.type,
                    view_more: false // anm.cx ana sayfa bölümlerinde "daha fazla göster" linki yok gibi
                });
                sectionCallback(homeSection);
            }
        }
    }
    
    // Anime/Manga Listesi (Arama ve Genel Liste)
    override async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const page = metadata?.page ?? 1; // Sora PagedResults metadata'dan sonraki sayfayı alabilir
        let url: string;

        if (query.title) { // query.title arama terimini içerir
            url = `${this.baseUrl}/search.php?kelime=${encodeURIComponent(query.title)}&sayfa=${page}`;
        } else {
            // query.includedTags vb. filtreleme için kullanılabilir, anm.cx için basit liste
            url = `${this.baseUrl}/anime-listesi?sayfa=${page}`;
        }

        const request = createRequestObject({ url, method: 'GET' });
        const response: Response = await this.requestManager.schedule(request, 1);
        const $ = this.cheerio.load(response.data);
        const animeTiles: MangaTile[] = [];

        const itemsContainer = $(".film-listesi, div.col-md-9 > div.row, div.row.animeler");

        itemsContainer.find("div.anime, div.animeler-liste-mod").each((_, animeElement) => {
            const anchor = $(animeElement).find("div.adata a, a.name, .data a");
            const img = $(animeElement).find("div.aimg img, figure img");

            if (anchor.length && img.length) {
                const titleText = anchor.attr('title') || anchor.text().trim();
                const href = anchor.attr('href');
                if (!href) return;

                let id: string;
                try {
                    id = new URL(this._absUrl(href)).pathname;
                } catch (e) {
                    console.error(`Invalid URL for search result tile: ${href}`);
                    return;
                }
                const image = this._absUrl(img.attr('data-src') || img.attr('src'));
                
                animeTiles.push(createMangaTile({
                    id: id,
                    title: { text: titleText },
                    image: image
                }));
            }
        });
        
        // Sayfalandırma kontrolü (anm.cx'te belirgin bir "son sayfa" işareti yoksa,
        // dönen sonuç sayısına göre karar verilebilir veya her zaman bir sonraki sayfa denenir)
        let nextPageMetadata: any = undefined;
        if (animeTiles.length > 0) { // Eğer sonuç varsa, bir sonraki sayfayı deneyebiliriz.
                                    // Daha iyi bir kontrol: Eğer sitede "sonraki sayfa" butonu varsa ve aktifse.
                                    // anm.cx'te sayfa numaraları var, son sayfaya ulaşıldığında linkler biter.
                                    // Şimdilik, sonuç varsa bir sonraki sayfayı varsayalım.
            nextPageMetadata = { page: page + 1 };
        }


        return createPagedResults({
            results: animeTiles,
            metadata: nextPageMetadata
        });
    }

    // Manga yerine getMangas kullanılabilir, Sora dökümanına göre SearchRequest alır.
    // getMangas(query: MangaQuery, metadata: any): Promise<PagedResults>;
    // Eğer getMangas'ı implemente ediyorsanız, SearchRequest'i MangaQuery'ye dönüştürmeniz gerekebilir.
    // Şimdilik getSearchResults'ü kullanıyoruz.

    // Anime/Manga Detayları
    override async getMangaDetails(mangaId: string): Promise<Manga> { // mangaId = /anime/spy-x-family
        const url = this.baseUrl + mangaId;
        const request = createRequestObject({ url, method: 'GET' });
        const response: Response = await this.requestManager.schedule(request, 1);
        const $ = this.cheerio.load(response.data);

        const title = $("h1.film-title, h1.title, .single-anime-title").first().text().trim();
        const image = this._absUrl($("div.film-poster img, .poster img, .anime-cover img").first().attr('src'));
        const description = $("div.film-ozet > p, .summary > p, .description-text").first().text().trim();

        const genres: string[] = [];
        $("div.film-bilgiler ul li, .anime-info li").each((_, li) => {
            const strongText = $(li).find("strong").text().trim().toLowerCase();
            if (strongText === "tür:" || strongText === "türü:") {
                $(li).find("a").each((__, a) => genres.push($(a).text().trim()));
            }
        });
        
        let statusText = "";
        const statusElement = Array.from($("div.film-bilgiler ul li, .anime-info li"))
            .find(li => $(li).find("strong").text().trim().toLowerCase().startsWith("durum"));
        if (statusElement) {
            statusText = $(statusElement).text().replace(/Durum:|Durumu:/i, "").trim();
        }
        const status = this._parseStatus(statusText);

        // Bölümler (Chapters)
        const chapters: Chapter[] = [];
        $("div.bolumler ul#bolumler-listesi li a, .episode-list .episode-item a, .episodes-list li a").each((i, epAnchor) => {
            const name = $(epAnchor).text().trim();
            const href = $(epAnchor).attr('href');
            if (!href) return;

            let id: string;
            try {
                id = new URL(this._absUrl(href)).pathname;
            } catch (e) {
                console.error(`Invalid URL for chapter: ${href}`);
                return;
            }
            
            const numberMatch = name.match(/(\d+(\.\d+)?)\.?\s*Bölüm/i);
            const chapNum = numberMatch ? parseFloat(numberMatch[1]) : i + 1; // Eşleşme yoksa sıra numarası

            chapters.push(createChapter({
                id: id, // Bölümün URL yolu (örn: /izle/spy-x-family-1-bolum)
                mangaId: mangaId, // Ana anime/manga ID'si
                name: name,
                chapNum: chapNum,
                langCode: LanguageCode.TURKISH, // Veya JSON'dan gelen dil
                // time: uploadDate // Eğer sitede varsa eklenebilir
            }));
        });
        // Bölümleri numarasına göre ters sırala (genellikle en yeni üstte istenir)
        chapters.sort((a, b) => (b.chapNum ?? 0) - (a.chapNum ?? 0));


        return createManga({
            id: mangaId,
            titles: [title],
            image: image,
            desc: description,
            genres: genres,
            status: status,
            // author: yazarAdi, // Sitede varsa
            // artist: cizerAdi, // Sitede varsa
            chapters: chapters // Sora'da Manga objesi Chapter'ları içerebilir
        });
    }

    // Bölüm Listesi (getMangaDetails içinde zaten alınıyor ama ayrı bir fonksiyon olarak da gerekebilir)
    override async getChapters(mangaId: string): Promise<Chapter[]> {
        // getMangaDetails zaten bölümleri aldığı için oradan çekebiliriz.
        // Veya aynı mantıkla tekrar fetch edebiliriz.
        // Sora genellikle getMangaDetails'ın chapters döndürmesini bekler.
        // Bu fonksiyon, sadece chapter listesini güncellemek için çağrılabilir.
        const mangaDetails = await this.getMangaDetails(mangaId);
        return mangaDetails.chapters ?? [];
    }

    // Bölüm Detayları (Video Linkleri)
    override async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
        // chapterId = /izle/spy-x-family-1-bolum (bölümün yolu)
        const episodeUrl = this.baseUrl + chapterId;
        const pages: Page[] = [];
        let pageIndex = 0;

        const initialRequest = createRequestObject({ url: episodeUrl, method: 'GET' });
        const initialResponse: Response = await this.requestManager.schedule(initialRequest, 1);
        const $initial = this.cheerio.load(initialResponse.data);

        const serverAnchors = $initial("ul.alternatifler li a, .server-list .server-item a");

        for (const el of serverAnchors.toArray()) {
            const serverAnchor = $initial(el);
            const serverName = serverAnchor.text().trim();
            const onclickAttr = serverAnchor.attr("onclick");
            let playerIframeUrl = this._absUrl(serverAnchor.attr('data-src')); // Doğrudan data-src varsa

            if (!playerIframeUrl && onclickAttr && onclickAttr.includes("get_video_player")) {
                const match = onclickAttr.match(/get_video_player\s*\(\s*'([^']*)'\s*,\s*'([^']*)'\s*\)/);
                if (match && match.length === 3) {
                    const videoInternalId = match[1];
                    const videoType = match[2];
                    const ajaxUrl = `${this.baseUrl}/ajax/get_video_player.php`;
                    const postData = `id=${videoInternalId}&type=${videoType}`;

                    const playerRequest = createRequestObject({
                        url: ajaxUrl,
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                            'X-Requested-With': 'XMLHttpRequest',
                            'Referer': episodeUrl // Referer önemli olabilir
                        },
                        data: postData
                    });
                    try {
                        const playerResponseObj: Response = await this.requestManager.schedule(playerRequest, 1);
                        const playerResponseData = JSON.parse(playerResponseObj.data); // Yanıtın JSON olduğunu varsayıyoruz
                        if (playerResponseData.status === "ok" && playerResponseData.player_url) {
                            playerIframeUrl = this._absUrl(playerResponseData.player_url);
                        }
                    } catch (e) {
                        console.error(`AJAX ile ${serverName} için player URL alınırken hata: ${e}`);
                        continue; 
                    }
                }
            }
            
            if (!playerIframeUrl) continue;

            // Player iframe'inden video linkini al
            try {
                const videoPageRequest = createRequestObject({ 
                    url: playerIframeUrl, 
                    method: 'GET',
                    headers: { 'Referer': episodeUrl } // Player iframe'i için de referer gerekebilir
                });
                const videoPageResponse: Response = await this.requestManager.schedule(videoPageRequest, 1);
                const videoPageHtml = videoPageResponse.data;
                
                const videoDataMatch = videoPageHtml.match(/var\s+video\s*=\s*(\[.*?\])\s*;/s);
                if (videoDataMatch && videoDataMatch[1]) {
                    const videoArrayString = videoDataMatch[1];
                    // Güvenli ayrıştırma için regex veya daha dikkatli string işleme
                    // Örnek: [{file:"URL",label:"720p",type:"mp4"},{file:"URL2",label:"1080p"}]
                    const sourceRegex = /\{\s*file\s*:\s*"([^"]+)"\s*,\s*label\s*:\s*"([^"]+)"(?:,\s*type\s*:\s*"([^"]*)")?\s*\}/g;
                    let matchResult;
                    while ((matchResult = sourceRegex.exec(videoArrayString)) !== null) {
                        const directVideoUrl = this._absUrl(matchResult[1]);
                        const qualityLabel = matchResult[2]; // örn: "720p"
                        // const videoType = matchResult[3]; // örn: "mp4", "hls" (m3u8)

                        // Her kaliteyi ayrı bir "Page" olarak ekleyebiliriz.
                        // Uygulama tarafı bu Page'leri (video kaynaklarını) listeleyip kullanıcıya seçtirebilir.
                        // Page.page numarası yerine kaliteyi Page objesine eklemek daha mantıklı olabilir
                        // ama Sora'nın Page arayüzü buna doğrudan izin vermiyor.
                        // Şimdilik qualityLabel'i linke query parametresi olarak ekleyebilir veya
                        // uygulamanın özel bir şekilde işlemesini bekleyebiliriz.
                        // Veya her kalite için ayrı bir Page objesi oluşturulur.
                        pages.push(createPage({
                            page: pageIndex++, // Sıralama için veya sadece bir indeks
                            link: directVideoUrl, // Asıl video linki
                            // Sora'nın Page arayüzü quality için standart bir alan sunmuyorsa,
                            // bu bilgi linke eklenebilir veya `ChapterDetails`'in `metadata` alanında taşınabilir.
                            // Ya da uygulama tarafı linkten kaliteyi anlamaya çalışabilir.
                            // Şimdilik sadece linki veriyoruz.
                        }));
                    }
                } else {
                    // Bazen iframe doğrudan video kaynağı olabilir (örn: .mp4 linki)
                    // Bu durum için de kontrol eklenebilir.
                    // Veya player sayfasında farklı bir JS değişkeni olabilir.
                    console.warn(`Player sayfasında (${playerIframeUrl}) 'var video = ...' yapısı bulunamadı.`);
                }
            } catch (e) {
                console.error(`${playerIframeUrl} adresinden video linki alınırken/ayrıştırılırken hata: ${e}`);
            }
        }

        return createChapterDetails({
            id: chapterId,
            mangaId: mangaId,
            pages: pages, // Toplanan tüm video linkleri (farklı kaliteler/sunucular)
            longStrip: false // Video için geçerli değil
        });
    }

    // İsteğe bağlı: Filtreler / Etiketler (anm.cx için şu an basit)
    override async getSearchTags(): Promise<TagSection[]> {
        // anm.cx'te gelişmiş filtreleme arayüzü yok gibi, bu yüzden boş dönebiliriz.
        // Eğer türler vb. için filtreleme eklenecekse, burada tanımlanır.
        return [];
    }
}

