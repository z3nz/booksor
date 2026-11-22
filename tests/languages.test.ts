// Every menu language: book names, references, search words, menus and search quality.
// Spanish has its own file (spanish.test.ts); the checks that cover every language are here.
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { bookAliases, bookName, homeUrl, messages, UI_LANGS, uiLang, type UiLang } from '../src/i18n/index.ts';
import { BOOKS } from '../src/lib/books.ts';
import { findBook, formatReference, parseReference } from '../src/lib/reference.ts';
import { buildIndex, search, verseKey } from '../src/lib/search.ts';
import { highlight, processTermFor } from '../src/lib/terms.ts';
import { defaultTranslationFor, TRANSLATION_LANGUAGES } from '../src/lib/translations.ts';
import type { SearchRow } from '../src/lib/types.ts';

describe('every language', () => {
  it('has a home page, a Bible, and every Bible language has menus', () => {
    for (const l of UI_LANGS) {
      expect(existsSync(l === 'en' ? 'src/pages/index.astro' : `src/pages/${l}/index.astro`), `${homeUrl(l)} page`).toBe(true);
      expect(TRANSLATION_LANGUAGES).toContain(l);
    }
    for (const l of TRANSLATION_LANGUAGES) expect(UI_LANGS).toContain(l);
  });

  it.each(UI_LANGS)('%s has every message', (l) => {
    const keys = (o: object, prefix = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
    expect(keys(messages(l)).sort()).toEqual(keys(messages('en')).sort());
  });

  it.each(UI_LANGS)('%s: every book name and abbreviation finds its own book', (l) => {
    const wrong = bookAliases(l)
      .filter(([alias, book]) => findBook(alias, l) !== book)
      .map(([alias, book]) => `${alias} → ${findBook(alias, l)?.name} (want ${book.name})`);
    expect(wrong).toEqual([]);
    for (const b of BOOKS) expect(parseReference(`${bookName(b, l)} 1`, l)?.book).toBe(b);
  });

  it('picks the menu language from a browser language code', () => {
    expect(uiLang('pt-BR')).toBe('pt');
    expect(uiLang('fr-CA')).toBe('fr');
    expect(uiLang('de-AT')).toBe('de');
    expect(uiLang('it')).toBe('it');
    expect(uiLang('ru-RU')).toBe('ru');
    expect(uiLang('id')).toBe('id');
    expect(uiLang('vi-VN')).toBe('vi');
    expect(uiLang('sw-KE')).toBe('sw');
    expect(uiLang('tl')).toBe('tl');
    expect(uiLang('zh-CN')).toBe('zh');
    expect(uiLang('zh-Hant-TW')).toBe('zh');
    expect(uiLang('ar-EG')).toBe('ar');
    expect(uiLang('hi-IN')).toBe('hi');
    expect(uiLang('nl-NL')).toBe('en');
    expect(uiLang(undefined)).toBe('en');
  });
});

const REFERENCES: Record<Exclude<UiLang, 'en' | 'es'>, [string, string][]> = {
  pt: [
    ['jo 3:16', 'João 3:16'],
    ['João 3.16', 'João 3:16'],
    ['joao 3,16', 'João 3:16'],
    ['Jó 1', 'Jó 1'],
    ['jn 1', 'Jonas 1'],
    ['Gn 1', 'Gênesis 1'],
    ['sl 23', 'Salmos 23'],
    ['1 Co 13:4-7', '1 Coríntios 13:4-7'],
    ['primeira de coríntios 13', '1 Coríntios 13'],
    ['at 2:38', 'Atos 2:38'],
    ['ap 21', 'Apocalipse 21'],
  ],
  fr: [
    ['Jn 3:16', 'Jean 3:16'],
    ['jean 3.16', 'Jean 3:16'],
    ['genese 1', 'Genèse 1'],
    ['Ps 23', 'Psaumes 23'],
    ['Es 53', 'Ésaïe 53'],
    ['isaie 53', 'Ésaïe 53'],
    ['1 Co 13:4-7', '1 Corinthiens 13:4-7'],
    ['première aux corinthiens 13', '1 Corinthiens 13'],
    ['Ac 2:38', 'Actes 2:38'],
    ['Ap 21', 'Apocalypse 21'],
  ],
  de: [
    ['Joh 3,16', 'Johannes 3:16'],
    ['johannes 3:16', 'Johannes 3:16'],
    ['1. Mose 1', '1. Mose 1'],
    ['1 mo 1', '1. Mose 1'],
    ['1mose 1', '1. Mose 1'],
    ['Ps 23', 'Psalmen 23'],
    ['1. Kor 13,4-7', '1. Korinther 13:4-7'],
    ['erster korinther 13', '1. Korinther 13'],
    ['Röm 8,28', 'Römer 8:28'],
    ['roem 8,28', 'Römer 8:28'],
    ['Apg 2,38', 'Apostelgeschichte 2:38'],
    ['offb 21', 'Offenbarung 21'],
    ['matthaus 5', 'Matthäus 5'],
  ],
  it: [
    ['Gv 3:16', 'Giovanni 3:16'],
    ['giovanni 3,16', 'Giovanni 3:16'],
    ['Sal 23', 'Salmi 23'],
    ['giosue 1', 'Giosuè 1'],
    ['1 Cor 13:4-7', '1 Corinzi 13:4-7'],
    ['prima corinzi 13', '1 Corinzi 13'],
    ['At 2:38', 'Atti 2:38'],
    ['Ap 21', 'Apocalisse 21'],
  ],
  ru: [
    ['ин 3:16', 'Иоанна 3:16'],
    ['Иоанна 3,16', 'Иоанна 3:16'],
    ['Быт 1', 'Бытие 1'],
    ['пс 23', 'Псалтирь 23'],
    ['1 Кор 13:4-7', '1 Коринфянам 13:4-7'],
    ['3 царств 1', '3 Царств 1'],
    ['1 самуила 1', '1 Царств 1'],
    ['Деян 2:38', 'Деяния 2:38'],
    ['откр 21', 'Откровение 21'],
    ['иисус навин 1', 'Иисус Навин 1'],
    ['песнь песней 2', 'Песнь песней 2'],
  ],
  id: [
    ['Yoh 3:16', 'Yohanes 3:16'],
    ['Kej 1', 'Kejadian 1'],
    ['mzm 23', 'Mazmur 23'],
    ['1 Kor 13:4-7', '1 Korintus 13:4-7'],
    ['pertama korintus 13', '1 Korintus 13'],
    ['Kis 2:38', 'Kisah Para Rasul 2:38'],
    ['why 21', 'Wahyu 21'],
    ['hakim-hakim 2', 'Hakim-hakim 2'],
    ['1 raja-raja 3', '1 Raja-raja 3'],
  ],
  vi: [
    ['Giăng 3:16', 'Giăng 3:16'],
    ['giang 3:16', 'Giăng 3:16'],
    ['Sáng-thế Ký 1', 'Sáng-thế Ký 1'],
    ['sang the ky 1', 'Sáng-thế Ký 1'],
    ['thi 23', 'Thi-thiên 23'],
    ['1 Cô-rinh-tô 13:4-7', '1 Cô-rinh-tô 13:4-7'],
    ['I Cô-rinh-tô 13', '1 Cô-rinh-tô 13'],
    ['đa-ni-ên 6', 'Đa-ni-ên 6'],
    ['khai 21', 'Khải-huyền 21'],
    ['công-vụ 2:38', 'Công-vụ các Sứ-đồ 2:38'],
  ],
  sw: [
    ['Yn 3:16', 'Yohana 3:16'],
    ['yohana 3:16', 'Yohana 3:16'],
    ['Mwa 1', 'Mwanzo 1'],
    ['zab 23', 'Zaburi 23'],
    ['1 Kor 13:4-7', '1 Wakorintho 13:4-7'],
    ['Mdo 2:38', 'Matendo ya Mitume 2:38'],
    ['ufu 21', 'Ufunuo 21'],
    ['mambo ya walawi 1', 'Mambo ya Walawi 1'],
  ],
  tl: [
    ['Juan 3:16', 'Juan 3:16'],
    ['jn 3:16', 'Juan 3:16'],
    ['Gen 1', 'Genesis 1'],
    ['awit 23', 'Mga Awit 23'],
    ['1 Cor 13:4-7', '1 Corinto 13:4-7'],
    ['unang corinto 13', '1 Corinto 13'],
    ['gawa 2:38', 'Mga Gawa 2:38'],
    ['pahayag 21', 'Pahayag 21'],
    ['awit ng mga awit 2', 'Awit ng mga Awit 2'],
  ],
  zh: [
    ['约 3:16', '约翰福音 3:16'],
    ['约翰福音3:16', '约翰福音 3:16'],
    ['約翰福音 3:16', '约翰福音 3:16'],
    ['约３：１６', '约翰福音 3:16'],
    ['创 1', '创世记 1'],
    ['诗 23', '诗篇 23'],
    ['林前 13:4-7', '哥林多前书 13:4-7'],
    ['约一 4', '约翰一书 4'],
    ['徒 2:38', '使徒行传 2:38'],
    ['启 21', '启示录 21'],
  ],
  ar: [
    ['يو 3:16', 'يوحنا 3:16'],
    ['يوحنا ٣:١٦', 'يوحنا 3:16'],
    ['تك 1', 'التكوين 1'],
    ['مز 23', 'المزامير 23'],
    ['1كو 13:4-7', 'كورنثوس الأولى 13:4-7'],
    ['كورنثوس الأولى 13', 'كورنثوس الأولى 13'],
    ['أع 2:38', 'أعمال الرسل 2:38'],
    ['رؤ 21', 'رؤيا يوحنا 21'],
    ['اشعياء 53', 'إشعياء 53'],
  ],
  hi: [
    ['यूह 3:16', 'यूहन्ना 3:16'],
    ['यूह. 3:16', 'यूहन्ना 3:16'],
    ['यूहन्ना ३:१६', 'यूहन्ना 3:16'],
    ['उत्प 1', 'उत्पत्ति 1'],
    ['भजन 23', 'भजन संहिता 23'],
    ['1 कुरि 13:4-7', '1 कुरिन्थियों 13:4-7'],
    ['प्रेरि 2:38', 'प्रेरितों के काम 2:38'],
    ['प्रका 21', 'प्रकाशितवाक्य 21'],
  ],
};

describe.each(Object.entries(REFERENCES))('%s references', (lang, cases) => {
  const ref = (q: string) => {
    const r = parseReference(q, lang);
    return r && formatReference(r, lang);
  };
  it.each(cases)('%s → %s', (q, want) => expect(ref(q)).toBe(want));
  it('still understands English book names', () => expect(ref('john 3:16')).toBe(`${bookName(42, lang)} 3:16`));
});

describe('English is unchanged', () => {
  it.each([
    ['jn 3:16', 'John 3:16'],
    ['job 1', 'Job 1'],
    ['1 cor 13:4-7', '1 Corinthians 13:4-7'],
    ['first john 4', '1 John 4'],
    ['ii tim 3:16', '2 Timothy 3:16'],
  ])('%s → %s', (q, want) => expect(formatReference(parseReference(q)!)).toBe(want));
});

describe('search words', () => {
  const same = (lang: string, a: string, b: string) => expect(processTermFor(lang)(a)).toBe(processTermFor(lang)(b));
  const skipped = (lang: string, w: string) => expect(processTermFor(lang)(w)).toBeNull();

  it('Portuguese: accents, plurals, -ões/-ão', () => {
    same('pt', 'coração', 'coracao');
    same('pt', 'corações', 'coração');
    same('pt', 'orações', 'oração');
    same('pt', 'pastores', 'pastor');
    same('pt', 'luzes', 'luz');
    same('pt', 'fontes', 'fonte');
    skipped('pt', 'de');
    skipped('pt', 'às');
  });

  it('French: accents, plurals, elisions', () => {
    same('fr', 'Éternel', 'eternel');
    same('fr', 'cieux', 'cieu');
    same('fr', 'brebis', 'brebi');
    same('fr', 'bergers', 'berger');
    skipped('fr', 'l');
    skipped('fr', 'qu');
    skipped('fr', 'les');
  });

  it('German: ß, umlauts, endings', () => {
    same('de', 'daß', 'dass');
    same('de', 'Hirte', 'Hirten');
    same('de', 'Liebe', 'lieben');
    same('de', 'Gottes', 'Gott');
    same('de', 'glauben', 'glaubet');
    same('de', 'mühselig', 'muhselig');
    skipped('de', 'der');
    skipped('de', 'und');
  });

  it('Italian: accents, singular and plural, elisions', () => {
    same('it', 'carità', 'carita');
    same('it', 'cielo', 'cieli');
    same('it', 'parola', 'parole');
    skipped('it', 'dell');
    skipped('it', 'il');
  });

  it('Russian: ё, endings', () => {
    same('ru', 'пастух', 'пастуха');
    same('ru', 'пастухи', 'пастух');
    same('ru', 'ёлка', 'елка');
    same('ru', 'Господь', 'господь');
    skipped('ru', 'и');
    skipped('ru', 'в');
  });

  it('Indonesian: particles', () => {
    same('id', 'kasihnya', 'kasih');
    same('id', 'dialah', 'dia');
    skipped('id', 'yang');
  });

  it('Vietnamese: tone marks and đ are optional', () => {
    same('vi', 'thương', 'thuong');
    same('vi', 'Đức', 'duc');
    skipped('vi', 'và');
  });

  it('Swahili and Tagalog: little words', () => {
    same('sw', 'Mungu', 'mungu');
    skipped('sw', 'na');
    skipped('tl', 'ang');
    skipped('tl', 'mga');
  });

  it('Chinese: single characters and pairs', () => {
    expect(processTermFor('zh')('神爱世人')).toEqual(['神', '神爱', '爱', '爱世', '世', '世人', '人']);
    expect(processTermFor('zh')('他的')).toEqual(['他', '他的']); // 的 only counts inside a pair
    expect(highlight('「 神爱世人，甚至', ['神爱', '爱世', '世人'], 'zh')).toBe('「 <mark>神爱世人</mark>，甚至');
    expect(highlight('爱是恒久忍耐', ['爱'], 'zh')).toBe('<mark>爱</mark>是恒久忍耐');
  });

  it('Arabic: vowel marks, alif forms, prefixes and suffixes', () => {
    same('ar', 'ٱللَّهُ', 'الله');
    same('ar', 'ٱلْمَحَبَّةُ', 'محبه');
    same('ar', 'وَٱلْأَرْضَ', 'الأرض');
    skipped('ar', 'فِي');
  });

  it('Hindi: endings, nukta', () => {
    same('hi', 'लोगों', 'लोग');
    same('hi', 'बातें', 'बात');
    same('hi', 'ज़मीन', 'जमीन');
    skipped('hi', 'और');
  });

  it('highlights with the original spelling kept', () => {
    expect(highlight('Der HERR ist mein Hirte', ['hirt'], 'de')).toBe('Der HERR ist mein <mark>Hirte</mark>');
    expect(highlight('Car Dieu a tant aimé le monde', ['aime'], 'fr')).toBe('Car Dieu a tant <mark>aimé</mark> le monde');
  });
});

// Search quality, when the data has been built (pnpm data). Queries use each translation's own wording.
const FAMOUS: Record<Exclude<UiLang, 'en' | 'es'>, [string, string][]> = {
  pt: [
    ['o SENHOR é meu pastor', 'Salmos 23:1'],
    ['Deus amou ao mundo de tal maneira', 'João 3:16'],
    ['posso todas as coisas em Cristo', 'Filipenses 4:13'],
    ['vinde a mim todos vós que estais cansados', 'Mateus 11:28'],
    ['o amor é paciente, é bondoso', '1 Coríntios 13:4'],
  ],
  fr: [
    ['le SEIGNEUR est mon berger', 'Psaumes 23:1'],
    ['Dieu a tant aimé le monde', 'Jean 3:16'],
    ['je peux tout par Christ qui me fortifie', 'Philippiens 4:13'],
    ['venez à moi vous tous qui êtes fatigués et chargés', 'Matthieu 11:28'],
    ['l’amour est patient', '1 Corinthiens 13:4'],
  ],
  de: [
    ['der HERR ist mein Hirte', 'Psalmen 23:1'],
    ['also hat Gott die Welt geliebt', 'Johannes 3:16'],
    ['ich vermag alles durch den der mich mächtig macht', 'Philipper 4:13'],
    ['kommet her zu mir alle die ihr mühselig und beladen seid', 'Matthäus 11:28'],
    ['die Liebe ist langmütig und freundlich', '1. Korinther 13:4'],
  ],
  it: [
    ['l’Eterno è il mio pastore', 'Salmi 23:1'],
    ['Iddio ha tanto amato il mondo', 'Giovanni 3:16'],
    ['io posso ogni cosa in Colui che mi fortifica', 'Filippesi 4:13'],
    ['venite a me voi tutti che siete travagliati', 'Matteo 11:28'],
    ['la carità è paziente, è benigna', '1 Corinzi 13:4'],
  ],
  ru: [
    ['Господь — мой пастух', 'Псалтирь 23:1'],
    ['Бог так полюбил мир', 'Иоанна 3:16'],
    ['я могу всё благодаря Христу', 'Филиппийцам 4:13'],
    ['придите ко Мне все, кто трудится и изнемогает', 'Матфея 11:28'],
    ['любовь терпелива', '1 Коринфянам 13:4'],
  ],
  id: [
    ['TUHAN adalah gembalaku', 'Mazmur 23:1'],
    ['Allah sangat mengasihi dunia ini', 'Yohanes 3:16'],
    ['aku dapat melakukan segala sesuatu', 'Filipi 4:13'],
    ['datanglah kepada-Ku semua yang letih lesu', 'Matius 11:28'],
    ['kasih itu bersabar', '1 Korintus 13:4'],
  ],
  vi: [
    ['Đức Giê-hô-va là Đấng chăn giữ tôi', 'Thi-thiên 23:1'],
    ['Đức Chúa Trời yêu thương thế gian', 'Giăng 3:16'],
    ['tôi làm được mọi sự nhờ Đấng ban thêm sức', 'Phi-líp 4:13'],
    ['hỡi những kẻ mệt mỏi và gánh nặng', 'Ma-thi-ơ 11:28'],
    ['tình yêu thương hay nhịn nhục', '1 Cô-rinh-tô 13:4'],
  ],
  sw: [
    ['Bwana ndiye mchungaji wangu', 'Zaburi 23:1'],
    ['Mungu aliupenda ulimwengu', 'Yohana 3:16'],
    ['naweza kuyafanya mambo yote', 'Wafilipi 4:13'],
    ['njooni kwangu ninyi nyote mnaotaabika', 'Mathayo 11:28'],
    ['upendo huvumilia, upendo hufadhili', '1 Wakorintho 13:4'],
  ],
  tl: [
    ['Si Yahweh ang aking pastol', 'Mga Awit 23:1'],
    ['labis na inibig ng Diyos ang sangkatauhan', 'Juan 3:16'],
    ['magagawa ko ang lahat ng mga bagay', 'Filipos 4:13'],
    ['lumapit kayo sa akin kayong lahat na nahihirapan', 'Mateo 11:28'],
    ['ang pag-ibig ay mapagpasensya', '1 Corinto 13:4'],
  ],
  zh: [
    ['耶和华是我的牧者', '诗篇 23:1'],
    ['神爱世人', '约翰福音 3:16'],
    ['我靠着那加给我力量的，凡事都能做', '腓立比书 4:13'],
    ['凡劳苦担重担的人', '马太福音 11:28'],
    ['爱是恒久忍耐', '哥林多前书 13:4'],
  ],
  ar: [
    ['الرب راعي فلا يعوزني شيء', 'المزامير 23:1'],
    ['هكذا أحب الله العالم', 'يوحنا 3:16'],
    ['أستطيع كل شيء في المسيح', 'فيلبي 4:13'],
    ['تعالوا إلي يا جميع المتعبين', 'متى 11:28'],
    ['المحبة تتأنى وترفق', 'كورنثوس الأولى 13:4'],
  ],
  hi: [
    ['यहोवा मेरा चरवाहा है', 'भजन संहिता 23:1'],
    ['परमेश्वर ने जगत से ऐसा प्रेम रखा', 'यूहन्ना 3:16'],
    ['मैं सब कुछ कर सकता हूँ', 'फिलिप्पियों 4:13'],
    ['हे सब परिश्रम करनेवालों और बोझ से दबे लोगों', 'मत्ती 11:28'],
    ['प्रेम धीरजवन्त है', '1 कुरिन्थियों 13:4'],
  ],
};

describe.each(Object.entries(FAMOUS))('%s search', (lang, cases) => {
  const tr = defaultTranslationFor(lang);
  const words = `public/search/words-${lang}.json`;
  const built = existsSync(words);
  let rows: SearchRow[];
  let display: Map<string, string>;
  let index: ReturnType<typeof buildIndex>;
  // Building a language's index takes a few seconds, longer on the deploy's build machine (it timed out the
  // first search there at vitest's 5 s default), so it's built once here with room to spare.
  beforeAll(() => {
    if (!built) return;
    rows = JSON.parse(readFileSync(words, 'utf8'));
    const shown: SearchRow[] = JSON.parse(readFileSync(`public/search/${tr}.json`, 'utf8'));
    display = new Map(shown.map((r) => [verseKey(r[0], r[1], r[2]), r[3]]));
    index = buildIndex(rows, lang);
  }, 120_000);
  it.skipIf(!built).each(cases)('“%s” finds %s', (q, want) => {
    const h = search(index, rows, display, q, 5, lang).hits[0];
    expect(h && `${bookName(h.b, lang)} ${h.c}:${h.v}`).toBe(want);
  });
});
