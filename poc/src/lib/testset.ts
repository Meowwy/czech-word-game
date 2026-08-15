// Hand-authored, hand-labeled Czech test set.
//
// Accuracy is only meaningful against negatives that are HARD. Random gibberish
// (N1) is trivially rejected by anything that does a real lookup -- the class that
// actually separates a dictionary from a heuristic is N2, pseudo-words that obey
// Czech phonotactics and morphology but are not words.
//
// `expected` is my label. Every label was cross-checked against MorphoDiTa and
// eight of my first-pass labels turned out to be wrong (see the P2/N3 notes); the
// benchmark still prints all disagreements so labels stay auditable.
//
// NOTE: comments must stay OUTSIDE the template literals below, or their own
// words get split in as test items.

export type Klass = 'P1' | 'P2' | 'N1' | 'N2' | 'N3';

export const CLASS_INFO: Record<Klass, { expected: boolean; label: string }> = {
  P1: { expected: true, label: 'P1 common words, inflected, all POS' },
  P2: { expected: true, label: 'P2 rare-but-real / long / derived' },
  N1: { expected: false, label: 'N1 random gibberish' },
  N2: { expected: false, label: 'N2 plausible Czech pseudo-words' },
  N3: { expected: false, label: 'N3 misspellings / stripped diacritics' },
};

// --- P1: everyday vocabulary across every part of speech, heavily inflected ----
export const P1 = `
strom stromy stromu stromem stromě kočka kočky kočkami kočce pes psa psem psi
dům domu domy domem voda vodou vody město městě města ruka rukou ruce oko oči
muž muže žena ženy ženou dítě děti dětem škola školy škole kniha knihy knize
stůl stolu stolem okno okna oknem chléb chleba mléko mléka práce práci prací
čas času časem rok roku roky den dne dnem noc noci nocí přítel přátelé bratr
bratra sestra sestry velký velká velké velkého malý malému dobrý dobrá dobré
nejlepší nejlepšímu krásný krásná červený modrý starý nový mladý silný slabý
být jsem jsi jsme jsou mít mám máš dělat dělám dělá jít jdu jde šel šla
psát píšu číst čtu vidět vidím vědět vím chtít chci můžu přijít přišel
strč strčit rychle pomalu dobře špatně dnes včera zítra tady vždy nikdy
já ty ona my vy oni můj tvůj jeho náš jeden dva tři čtyři pět deset sto tisíc
na do od pro přes mezi před ale nebo protože když nazdar ahoj jejda asi snad
`.trim().split(/\s+/);

// --- P2: real, but the kind of word an over-aggressive filter would drop -------
// The final line was adjudicated OUT of N2/N3 after MorphoDiTa confirmed the words
// are real: vodárnička is a legal diminutive, stolovat/kočkovat/knihovat are real
// verbs, bobrovina a real material noun, and `stul` the imperative of `stulit`.
export const P2 = `
žížala krkovička zmrzlinář zmrzlináře pštros pštrosím obhospodařovávatelný
nejneobhospodařovávatelnějšímu blahobyt blahobytu chrastítko kolotoč kolotoče
vodopád mravenec mravence ježek ježka veverka netopýr netopýra jestřáb
chameleon žirafa nosorožec hroch velbloud tučňák volavka slavík jezevec
vydra bobr srnec kanec rys medvěd liška zajíc křeček morče papoušek kanárek
zmrzlinářství vodohospodářský přírodovědec sebeurčení znovuobnovení
velkomyslnost dobrodružství spravedlnost nespravedlnost zodpovědnost
blahopřání novomanželé prapradědeček tchýně švagrová sourozenec
vodárnička kočkovat knihovat stolovat bobrovina stul stulit
`.trim().split(/\s+/);

// --- N1: keyboard mash. The easy negative -- and Korektor already fails it -----
export const N1 = `
gfjzisjv zzzz qwrtplk xkcdvbn mnbvcxz ghjkljh pqrstv zxcvbn fghjkl wertyui
asdfgh jklqwe bnmzxc poiuyt lkjhgf vbnmqw tyuiop rewqas dfghjk cvbnmk
hjklqw uiopas ghjklz xcvbnm qazwsx edcrfv tgbyhn ujmikl plokij wsxedc
rfvtgb yhnujm ikolpm qwedfr zsxdcf vgbhnj mkolpi azsxdc fvgbhn jmkolp
wsedrf tgyhuj nmiklo pqazws xedcrf vtgbyh nujmik olpqaz wsxedr fvtgby
hnujmi kolpqa zwsxed crfvtg byhnuj mikolp gjkzwq vbnhjk trewqz
`.trim().split(/\s+/);

// --- N2: THE REAL TEST. Czech-looking, morphologically legal, but not words ----
// Built from real stems plus suffixes that are productive in Czech but simply
// were never applied to this stem. Five first-pass entries were removed after
// MorphoDiTa confirmed they are in fact real words.
export const N2 = `
blbouncita stromiště kočkovina zmrzlivec chlebovina mlékovec
oknatel stolovina knihovatel městovina školovina stromovina stromatel
stromovník kočkatel kočkoun psatel psovník vodovina vodatel vodoun
mlékovina mlékatel chlebatel knihovina knihoun oknovina stolatel
městatel školatel žížalovina žížalatel pštrosovina pštrosatel veverkovina
ježkovina mravencovina kolotočovina vodopádovina hrochovina žirafovina
stromovat oknovat chlebovat mlékovat městovat psovat vodovat
žížalovat pštrosovat veverkovat ježkovat mravencovat
zmrzlovina kolotočatel vodopádatel hrochovník žirafovník velbloudovina
netopýrovina jestřábovina chameleonovina nosorožcovina tučňákovina
vydrovina srncovina kancovina rysovina liškovina zajícovina
`.trim().split(/\s+/);

// --- N3: near misses. Under the strict-diacritics rule these must be rejected --
// Every entry is a real word with its diacritics stripped, or a common typo.
// Avoids strips that land on another real word: `ze` (from že) is a preposition,
// `stul` is the imperative of stulit, and blahobyt/spravedlnost carry no
// diacritics at all -- all four were removed after adjudication.
export const N3 = `
kocka zizala strc prijmeni mesto zena dite skola cas pritel dobre
vcera zitra muj tvuj krasny cerveny nejlepsi velky maly mlady silny
zirafa jezek netopyr tucnak pstros zmrzlinar krkovicka kolotoc
vodopad mravencu jestrab prirodovedec zodpovednost
prijmení příjmeni strmo stroom kniyha psaa kockaa
citít piísmo kráasný mestó bězet chibný nazdaar ahój
`.trim().split(/\s+/);

export const ALL: { word: string; klass: Klass; expected: boolean }[] = (
  [['P1', P1], ['P2', P2], ['N1', N1], ['N2', N2], ['N3', N3]] as const
).flatMap(([klass, words]) =>
  [...new Set(words)].map((word) => ({ word, klass, expected: CLASS_INFO[klass].expected })),
);
