# DESIGN.md – Pod okny

> Zdroj pravdy pro vzhled a texty aplikace **Pod okny**. Platí pro lidi i pro AI agenty, kteří na aplikaci pracují.
> Vychází z facelift varianty **N** (plátno „Moje čtvrť“, stránka *Facelift — varianty*) a hlavní barvy **#6f41bc**.
> Stav: **nasazeno 26. 10. 2026** (`docs/style.css` – tokeny v `:root`, vrstva „Facelift N“ na konci souboru).

---

## 1. Produkt

**Kapesní pomocník pro příjemné bydlení.**

Pod okny ukazuje, co se děje na konkrétní adrese v Praze 9 a Praze 14: odstávky vody, tepla a elektřiny, svozy a kontejnery, uzavírky a nehody, stavby a řízení, akce, lékaře a školy v okolí. Lidé přes něj také nahlašují závady, zapojují se do participativního rozpočtu a sdílejí informace se sousedy.

## 2. Pro koho

Obyvatelé Prahy 9 a Prahy 14 – bez dalšího zúžení na konkrétní skupinu. Návrh tedy musí fungovat pro člověka, který aplikaci otevře poprvé, i pro toho, kdo ji otevírá denně.

## 3. Hlavní práce

**Člověk má po otevření vědět, co se děje na jeho adrese.**

Každá obrazovka se posuzuje podle toho, jak rychle na tuhle otázku odpoví. Co nepomáhá odpovědět, má nižší prioritu.

## 4. Vlastnosti stylu

Všech šest platí současně:

1. **Důvěryhodný** – informace působí ověřeně, ne senzačně.
2. **Čistý** – málo prvků, hodně vzduchu, jasná hierarchie.
3. **Komunitní** – je vidět, že v tom člověk není sám (sousedé, „U mě taky“, sdílení).
4. **Příjemný** – měkké tvary, klidné barvy, nic neruší.
5. **Hřejivý** – teplý tón textů, žádná úřednost.
6. **Hodný soused od vedle** – poradí, upozorní, nestraší a nepoučuje.

## 5. Co design nikdy nesmí

- Nepoužívat výrazné vizuální prvky: **ilustrace, fotky, maskoty, velké dekorace**. (Výjimka: obrázky staveb a akcí, které jsou obsahem.)
- **Neměnit hlavičku** (eyebrow s názvem adresy, adresa se šipkou jako jediné ovládání, mapa čtvrti v pozadí).
- **Nepřidávat řadu kategorií / kulatých zkratek** pod hlavičku. Rozcestník zůstává jako dlaždice „Ve vašem okolí“ dole na Domů.
- Žádný **tmavý režim** jako hlavní vzhled, žádný **novinový** styl (patkové nadpisy, linky místo karet), žádný **brutalismus** (černé obrysy, tvrdé stíny), žádné **křiklavé barvy** ani barevné bloky přes celou šířku.
- Nepoužívat hlavní fialovou pro stavy (probíhá, plánováno, v pořádku) – stavy mají vlastní barvy (viz 6.2).
- Nestrašit: žádné vykřičníky v textu, žádná CAPS LOCK upozornění, červená jen pro to, co opravdu právě probíhá.

## 6. Tokeny

Hodnoty z varianty N + hlavní barva #6f41bc. Kontrasty jsou proti bílé (#fff), pokud není uvedeno jinak.

### 6.1 Barvy – základ

| Token | Hodnota | Role | Použití | Zákaz |
|---|---|---|---|---|
| `--brand` | `#6f41bc` | Hlavní barva značky | Primární tlačítka (`.link`, `.btn-ext`), ikona a popisek aktivní položky navigace, šipka u adresy v hlavičce, odkazy (`.hlink`, `a`), časy v „Dnes a zítra“, zapnuté chipy, ikony v dlaždicích, focus ring. Kontrast s bílou 6,65 : 1. | Nikdy pro stavy (probíhá / plánováno / OK), nikdy jako plocha pozadí větší než tlačítko. |
| `--brand-tint` | `#f0ebff` | Světlý podklad značky | Světlé podklady značky (štítky, přepínače). Text `--brand` na něm má 5,71 : 1. | Nepoužívat jako pozadí karet ani sekcí. |
| `--ink` | `#1c1c1e` | Hlavní text | Nadpisy, názvy v kartách, text v tlačítkách bez barvy. 17 : 1. | Nepoužívat čistou černou `#000`. |
| `--muted` | `#5f636c` | Vedlejší text | Popisy v kartách, adresy, podtitulky. 6,0 : 1. | Ne pro nadpisy a ne pro klikatelný text. |
| `--faint` | `#686c76` | Nejslabší text | Eyebrow, poznámky, zdroje, patička. 4,7 : 1 na `--bg`. | Nesvětlit – světlejší odstín (`#767a84`) na `--bg` nesplní AA. |
| `--danger` | `#b42318` | Destruktivní akce | Ikona/text destruktivního tlačítka (odebrat, smazat). Na `--danger-tint` 5,7 : 1, na bílé 6,6 : 1. | Nikdy pro stav „probíhá“ (to je pozadí `--state-now`), nikdy jako hlavní akce obrazovky. |
| `--danger-tint` | `#ffeaea` | Podklad destruktivní akce | Pozadí destruktivního tlačítka. | Nepoužívat na karty – pro kartu „probíhá“ je `--state-now` (stejná hodnota, jiná role). |
| `--bg` | `#f1f2f5` | Pozadí aplikace | Celá plocha za kartami. | Nepoužívat bílou jako pozadí aplikace (karty by zmizely). |
| `--bg-map` | skutečná mapa okolí zvolené adresy (OpenStreetMap, dlaždice `docs/data/mapa/`), ulice linkami, domy jako světlé plochy `#e8e1fc`, celé na 40 % (ztlumeno o 60 %), bez špendlíku, maska: plná do 90 px, zmizí do 210 px (jen za adresou, obsah pod ní je na čistém podkladu); pod ní `linear-gradient(180deg, #f5f2fe 0, #f1f2f5 380px)` | Pozadí hlavičky | Jen v horní části obrazovek s hlavičkou adresy (Domů, Doprava, Bydlení, Akce, Okolí), dolů plynule mizí. Mění se s přepnutím adresy. | Nezesilovat, nepřidávat špendlík ani popisky, nedávat do detailů; není interaktivní (na to je Okolí → Mapa). |
| `--surface` | `#ffffff` | Karta | Všechny karty, dlaždice, řádky dne. | – |
| `--line` | `#eceef2` | Oddělovač | Linky mezi řádky uvnitř karty (`.hrw`, `.tydr1`). | Nepoužívat jako rámeček karty – karty jsou bez rámečku. |

### 6.2 Barvy – stavy

Stavy mají přednost před značkou. Fialová se ve stavech nikdy neobjevuje.

| Token | Pozadí | Role | Použití | Zákaz |
|---|---|---|---|---|
| `--state-now` | `#ffeaea` | Právě probíhá | Podklad hlavičky hlavní karty `.hhero.now` a ikony u `.hal.now` – voda nebo proud teď. Text `--fg` na něm min. 4,5 : 1. | Ne pro plánované věci, ne pro dekoraci. |
| `--state-plan` | `#fff3e2` | Plánováno | Hlavička / ikona u plánované věci (`.hal.plan`, `.hhero.plan`). | Ne pro „pozor“ bez data. |
| `--state-info` | `#ffffff` | Informace | `.hal.info` – stavba, řízení, nehoda v okolí; barva ikony a štítku podle tématu. | – |
| `--state-help` | `#e7eef8` | Pátrání / prosba o pomoc | `.hal.help`, `.hhero.help` (policie pátrá). | Ne pro běžné informace. |
| `--state-ok` | `#e6f1e9` | Vyřešeno / v pořádku | `.hal.found`, potvrzení. | Ne jako barva značky. |

Barvy štítků („Probíhá“, „Zítra“…) a ikon kategorií zůstávají z produkce – nejsou součástí faceliftu.

### 6.2a Fialová vs. zelená – sladění (schváleno)

Všechna místa, kde produkce používá zelenou **jako barvu značky**, přechází na `--brand` (`#6f41bc`) a `--brand-tint` (`#f0ebff`). V kódu to znamená `--green: var(--brand)` a nahrazení natvrdo zapsaných `#1f4d36` / `#e9f0e9` / `#2f8a57`, pokud nenesou význam.

| Na fialovou (značka) | Zůstává zelená (význam) |
|---|---|
| časy v „Dnes a zítra“ a v Akcích (`.hrw .hw`, `.aktime`) | „U vás je klid“ (`.hok`) a karta „Teď se vás nic netýká“ |
| ikony v dlaždicích, špendlíky (`.htile`, `.pin`, `.near`) | „Nalezen“ (`.hal.found`, `.vchip.found`) |
| štítek „dnes“ (`.hdnes`), „Zdarma“ (`.akfree`), `.spadtag`, `.parted` | BIO (`.hbio`) |
| vybraný den a tečky akcí v kalendáři (`.akdb`, `.akkd`, `.akkleg`) | hotové stavby (`.f-hot`) |
| záložky, segmenty, filtry, chipy (`.tab.on`, `.akseg`, `.seg2`, `.fopt`, `.chip.on`, `.mapachip.on`, `.adrchip.on`, `.oktaby`) | tečka „Právě probíhá“ (`.akdot`) |
| šipky kalendáře (`.akkalnav`), odkazy (`.aklink`, `.aktxt`, `.tydvic`, `.adradd`, `.vlink`, `.spadlink`) | barvy typů odpadu, stavy (6.2), kategorie lékařů a akcí |
| postup řízení a časová osa (`.krok`, `.tl`) | |
| tlačítko 158 (`.btn-158`), cisterny (`.vcis`), „U mě taky“ (`.umth`) | |
| kruh okruhu na mapě a mapové ovládání (`.mja`) | |

Pravidlo pro nová místa: **ovládá to člověk nebo to ukazuje „tady jste / tohle jste vybrali“ → fialová. Říká to „je to v pořádku / je to hotové / je to živé“ → zelená.**

### 6.3 Typografie

| Token | Hodnota |
|---|---|
| `--font` | `'Plus Jakarta Sans', system-ui, -apple-system, sans-serif` (řezy 400–800, latin + latin-ext) |
| Navigace | stejné písmo, 10,5 px / 700 |

| Úroveň | Velikost / řez | Kde |
|---|---|---|
| Adresa v hlavičce | 22 px / 800 | jen hlavička (beze změny) |
| Nadpis sekce (`.hsec b`, `.label`) | 19 px / 700, `letter-spacing:-.02em` | „Upozornění pro vaši adresu“, „Dnes a zítra“, „Voda, elektřina a teplo“ |
| Název v kartě (`.t1`, `.ht`, `.hn`, `.akt`, `.cn`…) | 15–15,5 px / **800** | první řádek karty – vždy 800 |
| Doplňující text (`.t2`, `.akm`, `.cm`, `small` v kartě) | 12–14 px / **500** | hodnota, čas, adresa, vzdálenost |
| Popis (`.hs`, `.hm`, `.note`, `.dnote`) | 12,5–13 px / **500**, `--muted` | vysvětlení pod názvem |
| Delší text (`.ptext`, `.ntext`, popis akce) | 14,5–15 px / **400** | odstavce |
| Eyebrow / štítek (`.eyebrow`, `.dtitle`, `.hl`) | 11,5–12 px / **800**, verzálky | nad názvem, nadpis bloku v detailu |
| Zdroj (`.t3`, patička) | 11–12 px / 500, `--faint` | „Ověřeno dnes…“ |

Tloušťky jsou jen čtyři: **800** názvy a štítky, **700** nadpisy sekcí a tlačítka, **500** doplňující text a popisy, **400** delší odstavce. Jiné řezy se nepoužívají.

**Rozhodovací logika:**
1. Odpovídá text na „co se děje na mé adrese“? → název v kartě (15/700). Jinak popis.
2. Je to nadpis skupiny karet? → nadpis sekce (19/700). Nikdy ne VERZÁLKY – sekce v N už nejsou verzálkové.
3. Je to metadata (zdroj, čas ověření, vzdálenost)? → eyebrow/popis, `--faint` nebo `--muted`.
4. Víc než tři úrovně v jedné kartě = karta je přeplněná, rozděl ji.
5. Čísla a časy mají stejné písmo – žádné monospace, žádné jiné rodiny.

### 6.4 Tvary, stíny, mezery

| Token | Hodnota | Použití | Zákaz |
|---|---|---|---|
| `--radius-card` | `22px` | karty, dlaždice, upozornění, řádek dne | Nemíchat s ostrými rohy. |
| `--radius-pill` | `999px` | tlačítka, chipy, „Kalendář akcí“, aktivní položka navigace | – |
| `--radius-icon` | `50%` | podklad ikon v kartách (`.hi`, `.tydi`, `.badge`) | Ne čtvercové podklady ikon. |
| `--shadow-card` | `0 1px 2px rgba(111,65,188,.06), 0 6px 20px rgba(111,65,188,.08)` – tónovaný do značky | všechny bílé karty | Karty nemají rámeček (`border:none`). Stavové karty (`now`, `plan`) jsou **bez stínu**. |
| `--shadow-nav` | `0 12px 32px rgba(28,28,30,.16)` + bílý vnitřní odlesk | plovoucí skleněná navigace a tlačítko Mapa/Seznam | – |
| `--space-page` | `20px` | boční okraj obsahu | – |
| `--space-stack` | `16px` | mezera mezi bloky | – |
| `--space-list` | `8px` | mezera mezi kartami v seznamu | – |
| Dotyková plocha | min. `44px` | každé tlačítko a odkaz | Nic menšího než 44 px. |

## 7. Komponenty podle použití

| Potřebuji… | Komponenta | Pravidla |
|---|---|---|
| upozornit na něco, co se týká adresy | **Hláška** `.hal` (`now` / `plan` / `info` / `help` / `found`) | Vždy bílá karta. Ikona v kulatém tónovaném podkladu vlevo, nad názvem štítek 11,5/800 VERZÁLKAMI v barvě tématu (PRÁVĚ TEĎ, ODSTÁVKA VODY, DOPRAVA · 530 M…), u věcí, které běží teď, pulzující tečka. Název 15/800, popis `--muted`, šipka vpravo. Vyřešené (`found`) mají místo šipky křížek – skryje hlášku. Prázdné stavy (U vás je klid, Dnes a zítra nic) stejnou kartou bez šipky (`.hal-e`). |
| ukázat, co říkají sousedé (hlasy, počty, zkušenosti) | **Vývěska sousedů** `.vyv` | Linkovaný papír `#fffdf7` se špendlíkem nahoře uprostřed, nadpis VÝVĚSKA SOUSEDŮ 13/800 hnědě `#7a6a45`, řádky 16 px s ikonou a počtem vpravo, patička vždy říká, jak se počítá („1 telefon = 1 hlas · jak ověřujeme“). Na papíře jsou jen data; akce (Jsem bez vody / Vodu mám, Přidat zkušenost) jsou pod papírem jako dvě rovnocenná obrysová tlačítka `.vyvb` – nic není předvybrané. Po připsání tlačítka zmizí, na papíře „**Vy** a 4 sousedé…“ a odkaz Změnit. Bílá karta = úřední data, vývěska = sousedé. Max. 1–2 vývěsky na obrazovce. |
| dvě akce v kartě (např. prázdný stav Akcí: Zobrazit nejbližší + Všechny akce) | **Tlačítka v kartě** | Nikdy dvě plná tlačítka vedle sebe. Hlavní akce tónovaná (`--brand-tint` pozadí, text `--brand`, 800), druhá jako textové tlačítko `--brand` bez pozadí. Plné fialové tlačítko jen jedno na obrazovce (např. Přidat do kalendáře). |
| upozornit na naléhavou věc | **Hlavní karta** `.hhero` | Jen jedna na Domů, vždy první. Dostane ji: pátrání blízko vás, voda / proud / teplá voda teď, plánovaná odstávka vody nebo proudu v den začátku. Bílá karta s barevnou hlavičkou (ikona, tečka, štítek, vpravo čas „obnovení za ~5 h“), název 20/800, popis, tlačítka: hlavní akce s tónovaným pozadím v barvě tématu (Cisterna, Popis osoby), druhá akce jako textové tlačítko (Podrobnosti, Sdílet). Bez progress baru. Další naléhavé věci jsou běžné `.hal`. |
| ukázat, co je dnes a zítra | **Den** `.hday` + řádky `.hrw` | Čas vlevo v `--brand` (54 px sloupec), název + místo vpravo. Max. 5 řádků, zbytek pod „Další“. |
| ukázat týden dopředu | **Týden** `.card.tyd` + `.tydr1` | Den vlevo, ikona, text. Max. 5 položek. |
| rozcestník do oblastí | **Dlaždice** `.htiles` / `.htile` | Mřížka 2×2 dole na Domů. Ikona v `--brand`, název, hodnota, podtext. Jinam nepřesouvat. |
| ukázat stavby kolem | **Karusel staveb** `.hcar` / `.hcc` | Obrázek je obsah, ne dekorace. |
| primární akce (mapa, web, odeslat) | **Tlačítko** `.link`, `.btn-ext` | Pilulka s jemným svislým přechodem `#7b4fd0 → #6237b0` (bílý text 5,4–7,8 : 1), **bez stínu**, ikona šipky ven u externích odkazů. Max. 2 vedle sebe, plné nejvýš jedno. |
| data sekce se nenačetla (výpadek zdroje) | **Výpadek dat** `.dempty` | Centrovaná bílá karta: ikona přeškrtnutého mráčku 30 px v kruhu 64 px `--brand-tint`, nadpis 18/800 „… se nepodařilo načíst“, věta 13,5/500 `--muted` s pravdivou příčinou (který zdroj neodpovídá), pod tím plné tlačítko „Zkusit znovu“ a textový odkaz na náhradní zdroj ↗. Části sekce s vlastním zdrojem (např. Parkování) se pod kartou zobrazují dál. Nikdy „připravuje se“, když jde o výpadek. |
| zrušit výběr ve filtru | **Zrušit výběr** `.shreset` | Textové tlačítko vedle hlavního „Zobrazit …“ (jako Podrobnosti / Sdílet): bez pozadí a bez podtržení, text `--brand` 700, dotyková plocha 44 px. Když není nic vybráno, text šedý `#a9adb6`. |
| vedlejší akce vedle hlavní (Změnit adresu, Přejmenovat) | **Sekundární tlačítko** `.btn-ext.btn-sec` | Pilulka, `--brand-tint` pozadí, text `--brand`. Když je víc akcí vedle sebe, plná je nejvýš jedna – ostatní sekundární. |
| odebrat / smazat | **Destruktivní tlačítko** `.btn-danger-ic` (ikona koše, kruh 44 px) nebo `.btn-danger` (pilulka s textem) | `--danger` na `--danger-tint`. Vždy **poslední** v řádku/skupině (`margin-left:auto`), ikonková varianta vždy s `aria-label` („Odebrat adresu Domov“). Nikdy plná červená, nikdy jako hlavní akce. Akce bez potvrzení musí jít snadno zopakovat/vrátit. |
| vedlejší akce v nadpisu sekce | **Odkaz sekce** `.hlink` | Bílá pilulka, text `--brand`. |
| sdílet detail sousedům | **Sdílení** `.btn-share-ic` | Kulaté bílé tlačítko 44 px s ikonou sdílení v `--brand` a fialovým stínem, **vpravo nahoře v hlavičce detailu naproti „Zpět“** (`.headrow`). Vždy s `aria-label="Sdílet sousedům"`. Stejné ve všech detailech (voda, elektřina, teplá voda, uzavírka, akce, stavba, řízení, EIA, pátrání, škola, lékař). Nedávat do řádku odkazů ani jako plné tlačítko s textem. |
| odkazy v detailu | **Pilulky** `.dlinks.lk-pills` | Mapa vždy první a jako jediná plná (`--brand` přechod), ostatní sekundární (`--brand-tint`), každá s ikonou podle druhu (mapa / PDF / dokument / web). Popisky se zkracují pevně: Otevřít v Google Mapách → Google Mapy, Otevřít na mapě PVK → Mapa PVK, Vyhláška/Oznámení/Opatření na úřední desce → Vyhláška/Oznámení/Opatření, Dokumenty na portálu EIA → Dokumenty EIA, … na webu policie → Web policie, Oznámení MČ Praha N → Oznámení MČ. Co se nevejde, spadne na další řádek; text, který zkrátit nejde, se zalomí uvnitř pilulky (max. šířka 100 %, zarovnání vlevo) – nikdy se neořezává. |
| odkazy a akce v kartě (Domů, Doprava, Bydlení…) | **Řádky odkazů** `.lk-rows` / `.lk-row` | Každý odkaz i akce uvnitř aplikace (např. Nejbližší vypnutí) je řádek 48 px: kulatá ikona druhu v `--brand-tint`, text `--ink`, u PDF štítek „PDF“, vpravo ve `--brand` šipka ↗ = otevře web, šipka › = otevře něco v aplikaci; žádná fialová tlačítka v kartách; řádky oddělené linkou `--line`, mapa první. Dlouhý text se zalomí uvnitř řádku, ikona a šipka zůstávají. Platí v celé aplikaci i pro jediný odkaz v kartě, včetně karet uvnitř detailu (např. „Web školy“ v kartě Termíny) – plná tlačítka s odkazem ven v kartách nejsou. Pilulky jsou jen v řádku odkazů pod nadpisem detailu. Nikdy víc plných tlačítek pod sebou. |
| rozbalit úpravy položky v seznamu | **Chevron** `.adrdots` | Šipka dolů = sbaleno, šipka nahoru = rozbaleno; `aria-expanded`. Nepoužívat tři tečky. |
| změnit / přepnout adresu | **Adresa v hlavičce** `#adrsw` | Adresa je jediné ovládání: text adresy + šipka dolů ve `--brand`, ťuknutí otevře panel Moje adresy. Samostatné tlačítko „Změnit“ už není (dělalo totéž). Šipka je vždy, i u jedné adresy. |
| otevřít nastavení | **Ikona Nastavení v hlavičce** `#nastbtn` | Kulaté skleněné tlačítko s ozubeným kolem vpravo v hlavičce všech hlavních záložek (P1). Vede na stránku Nastavení; v detailech není. |
| nastavení, pravidla, kontakt | **Nastavení** (LG1) | Jedno místo: sekce Moje (Moje adresy), Pomoc a pravidla (Pravidla a soukromí, Kontakt), O aplikaci (Zdroje dat, Verze). Řádky `.nrow` v kartě `.nlist`: barevná ikona, název, podtitul, šipka. Navigace se na stránce skrývá. Upozornění a Záloha přibudou až v nativní aplikaci. Kontakt a Nahlásit se ukáží, až bude kontaktní e-mail. |
| první spuštění | **Úvod** (O4) | Jedna obrazovka bez proklikávání: mapa okolí, koláž skutečných upozornění, heslo „Vaše čtvrť v jedné kapse.“, tlačítko Začít a „Bez registrace“. Jen při prvním spuštění; sdílený odkaz a Přidat adresu úvod přeskočí. |
| zadat adresu | **Kde bydlíte? s náhledem** (O5) | Po výběru adresy se místo našeptávače ukáže „Teď u vás“ (voda, uzavírky do 1 km, akce tento týden) a tlačítko Pokračovat. Přidání a změna adresy v Mých adresách náhled nemají. |
| přepnout pohled (Vše / Dnes a zítra…) | **Přepínač** `.akseg`, `.tabs` | Skoro neprůhledná bílá dráha `rgba(255,255,255,.82)` s vnitřním okrajem `#e6e0f8`; nevybrané `#4a4e57` (8 : 1); vybraná bílá, text `--brand`, fialový stín. |
| najít něco v okolí (Okolí) | **Kategorie + plovoucí Mapa/Seznam** `.okkat`, `.mapachips`, `.okpill` | Nejdřív kategorie – **zaškrtávátka** (klepnutí přidává/ubírá, „Vše“ výběr zruší, prázdný výběr = Vše): Vše · Lékaři · Školy · Stavby · Doprava · Voda a proud · Akce · Kontejnery – stejné v mapě i v seznamu. Pohled přepíná černé plovoucí tlačítko dole („Mapa“ / „Seznam“). Výchozí: Mapa + Vše. Při výběru kategorií se mapa oddálí na všechny jejich body. Samotní Lékaři / Školy / Stavby mají v seznamu vlastní filtry, jiné kombinace obecný seznam podle vzdálenosti. Filtry i přepínač mají v mapě i seznamu stejný vzhled a polohu. Nepřidávat druhý přepínač Mapa/Seznam nahoře. |
| filtrovat | **Chipy** `.chiprow` / `.chips` | Pilulky; zapnutý = `--brand` pozadí. Fungují jako zaškrtávátka, drží pozici scrollu. |
| přepínat hlavní oblasti | **Navigace** `.bnav` | Varianta A „Čočka s odleskem“: plovoucí lišta z tekutého skla (průhledná bílá, rozmazání 10 px, bílý okraj a odlesk) 14 px od okrajů a spodu, `--radius-pill`. Vybraná položka je bílá skleněná čočka na místě (bílý horní odlesk, jemný fialový vnitřní stín), ikona a text `--brand`. Neaktivní položky `#3f434b`. Plovoucí tlačítko Mapa/Seznam ve stejném skle. Bez podpory rozmazání: bílá 96 %. 5 položek: Domů, Doprava, Bydlení, Akce, Okolí. |
| nic se neděje / informace bez akce | **Prázdný a informační stav** `.card-dashed`, `.hal-e` | Stejná bílá karta jako hláška: ikona v kulatém podkladu 42 px vlevo (neutrální `#f2f3f6`, u „v pořádku“ zelená, u akcí fialová), název 15/800, krátká vlídná věta 13/600 `--muted` (viz 8). Žádné barevné ani čárkované pozadí – stav nese jen ikona. Karty vody a proudu v Bydlení (`.vkarta`) mají také bílé pozadí, barvu jen v ikoně. |
| doplňkový výběr | **Sheet** `.sheet` | Vyjíždí zespodu, `--radius-card` nahoře. |
| potvrzení akce | **Toast** `.toast` | Krátká věta, zmizí sám. |

## 8. Tón textů – vřelejší

Pravidla:
- **Vykáme** (rozhodnuto), ale mluvíme jako soused, ne jako úřad.
- Nejdřív **co to znamená pro člověka**, potom zdroj.
- Krátké věty. Žádné „ohlášené“, „předmětné“, „dotčené“.
- Dobrou zprávu řekneme s úsměvem, špatnou klidně a s tím, co dělat.
- Zdroj dat uvádíme vždy, ale v pozadí (`--faint`).

| Dnes | Nově |
|---|---|
| Vaší adresy se teď nic netýká. | U vás je teď všechno v pořádku. |
| Pro vaši adresu není ohlášené žádné plánované vypnutí. Hlídáme oznámení PREdistribuce na úředních deskách. | Elektřina u vás pojede bez přerušení. Oznámení PREdistribuce hlídáme za vás. |
| Dnes ani zítra u vás nic naplánovaného nevidíme. | Dnes ani zítra se u vás nic neplánuje – užijte si klid. |
| Pro vaši lokalitu teď žádná plánovaná odstávka není. | Teplá voda poteče jako obvykle. |
| Upozornění pro vaši adresu | Co se děje u vás |
| Něco tu není v pořádku? Nahlaste nepořádek, rozbitou lampu nebo díru v silnici | Všimli jste si něčeho? Nepořádek, rozbitá lampa, díra v silnici – pomůžeme vám to nahlásit |

*(Nasazeno spolu s faceliftem.)*

## 9. Do / Don't

**Do**
- Bílé karty bez rámečku na šedém `--bg`, jemný stín.
- Jedna hlavní barva (`#6f41bc`) jen na ovládacích prvcích.
- Stav vyjádřit pozadím karty, ne barvou textu.
- Nadpisy sekcí normálním písmem (19/700), ne verzálkami.
- U každé informace uvést zdroj a čas ověření.
- Odkazy v detailech všude ve stejném pořadí, mapa první.

**Don't**
- Neměnit hlavičku ani pořadí sekcí na Domů.
- Nepřidávat řadu kategorií, pozdrav („Dobrý večer…“) ani souhrnné widgety nad obsah.
- Nepřidávat ilustrace, fotky ani dekorativní přechody (jediná dekorace je ztlumená mapa čtvrti `--bg-map`).
- Nepoužít fialovou na stav ani zelenou jako barvu značky (rozdělení viz 6.2a).
- Nedávat rámečky a stíny zároveň; nemíchat ostré a kulaté rohy.
- Nedávat vedle sebe víc plných tlačítek; destruktivní akci nikdy jako text uprostřed řady.
- Sdílení nedávat do obsahu ani jako velké tlačítko – patří do hlavičky detailu jako ikona.
- Nepsat úředně, nestrašit, nepoužívat vykřičníky.

## 10. Agent prompt guide

Když jako agent upravuješ UI Pod okny:

1. **Nejdřív plátno.** Každou vizuální změnu nejdřív nakresli na existující plátno projektu (ne nové plátno, ne PNG) a počkej na schválení. Teprve potom měň `docs/style.css` / `docs/app.js`.
2. **Tokeny, ne hodnoty.** Používej proměnné z kapitoly 6. Novou barvu, stín nebo radius nepřidávej – pokud chybí, zeptej se.
3. **Hlavička je zamčená.** `.head.addr` ani mapu v pozadí (`.hmapa`) neměň.
4. **Rozložení Domů je zamčené:** Upozornění → Dnes a zítra → Týden → Stavby → Ve vašem okolí (dlaždice) → zapojení/nahlášení.
5. **Stav vs. značka.** Fialová = ovládání. Červená/oranžová/modrá/zelená = stavy (6.2).
6. **Texty podle kapitoly 8**, česky, vykat, vlídně.
7. **Přístupnost:** text min. 4,5 : 1, dotyková plocha min. 44 px, `:focus-visible` v `--brand`.
8. **Dělej jen to, co je zadané.** Žádné „vylepšení navíc“.
9. Když si nejsi jistý, zeptej se jednou krátkou větou.

Šablona zadání pro agenta:
```
Uprav [obrazovka/komponenta] v aplikaci Pod okny podle DESIGN.md.
Cíl: [co má člověk zjistit / udělat].
Použij jen tokeny z kapitoly 6, komponenty z kapitoly 7 a tón z kapitoly 8.
Hlavičku a pořadí sekcí neměň. Nejdřív to nakresli na plátno.
```

## 11. Tři testovací výstupy

Na těchto zadáních ověříme, že DESIGN.md stačí k tomu, aby agent udělal správný návrh bez dalších instrukcí:

1. **Detail odstávky vody v průběhu** – stav `now`, cisterny, „U mě taky“, sdílení, odkazy (mapa první). Testuje stavy, tlačítka, tón špatné zprávy.
2. **Prázdný týden („Tento týden u vás“ bez událostí)** – testuje prázdný stav a vřelý tón dobré zprávy.
3. **Nová karta „Čištění ulice“ na Domů** – nová komponenta poskládaná jen z existujících tokenů a komponent. Testuje, že agent nepřidá nic mimo systém.

## 12. Otevřené otázky

- **Logo a ikona aplikace** – řešíme až s nativní aplikací.

