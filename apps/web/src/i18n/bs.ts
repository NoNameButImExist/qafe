export const bs = {
  meta: {
    title: 'qafe – Naručivanje preko QR koda za kafiće',
  },
  nav: {
    howItWorks: 'Kako radi',
    forVenues: 'Za lokale',
    forGuests: 'Za goste',
    faq: 'Pitanja',
    staffLogin: 'Prijava osoblja',
    cta: 'Zatraži demo',
    menu: 'Meni',
    close: 'Zatvori',
    language: 'Jezik',
    palette: 'Paleta boja',
  },
  hero: {
    eyebrow: 'QR naručivanje za kafiće i restorane',
    titleA: 'Narudžba stiže',
    titleB: 'prije konobara.',
    subtitle:
      'Gost skenira QR kod na stolu, bira s menija i šalje. Konobar narudžbu vidi za manje od 2 sekunde, prihvata je jednim dodirom, a cijela ekipa odmah zna ko je preuzeo sto.',
    ctaPrimary: 'Zatraži demo',
    ctaSecondary: 'Pogledaj kako radi',
    badges: ['Bez aplikacije za goste', 'Bez novog hardvera', 'Bosanski i engleski'],
  },
  demo: {
    venue: 'Kafić Demo',
    table: 'Sto 7',
    items: [
      { name: 'Espresso', price: 2.5 },
      { name: 'Cappuccino', price: 3.5 },
      { name: 'Domaća limunada', price: 4 },
      { name: 'Kroasan', price: 3 },
    ],
    currency: 'KM',
    add: 'Dodaj',
    send: 'Pošalji narudžbu',
    callWaiter: 'Pozovi konobara',
    total: 'Ukupno',
    sent: 'Poslano',
    accepted: 'Prihvaćeno',
    staffTitle: 'Narudžbe',
    staffZone: 'Sve zone',
    newOrder: 'Nova narudžba',
    accept: 'Prihvati',
    acceptedBy: 'Prihvatio: Amar',
    waitingFor: 'upravo',
    guestPhone: 'Telefon gosta',
    staffPhone: 'Telefon konobara',
  },
  ticker: [
    'Sto 3 · 2× Espresso · prihvatio Amar',
    'Terasa 5 · traži račun',
    'Sto 12 · poziva konobara',
    'Sala 8 · Limunada, Kroasan · prihvatila Lejla',
    'Sto 1 · naplaćeno · sto slobodan',
    'Terasa 2 · 3× Cappuccino · prihvatio Emir',
  ],
  how: {
    eyebrow: 'Kako radi',
    title: 'Od QR koda do slobodnog stola.',
    subtitle: 'Četiri koraka. Bez mahanja preko sale i bez čekanja na pogled konobara.',
    steps: [
      {
        title: 'Skeniraj',
        body: 'Gost skenira QR kod na stolu. Meni lokala se otvara u browseru, bez instalacije i bez registracije.',
      },
      {
        title: 'Naruči',
        body: 'Bira artikle i dodatke, ostavlja napomenu i šalje. Konobara može pozvati i jednim dodirom.',
      },
      {
        title: 'Prihvati',
        body: 'Narudžba stiže svim konobarima uživo. Prvi koji je prihvati je preuzima, a ostali odmah vide ko je to.',
      },
      {
        title: 'Naplati',
        body: 'Gost traži račun, konobar naplati i zatvori sto. Sesija se zatvara, a sto je ponovo slobodan.',
      },
    ],
    screens: {
      scanHint: 'Usmjeri kameru na QR kod',
      orderSent: 'Narudžba poslana',
      acceptedBy: 'Prihvatio Amar',
      billRequested: 'Sto 7 traži račun',
      paid: 'Naplaćeno',
      tableFree: 'Sto 7 je slobodan',
    },
  },
  stats: {
    title: 'Brojevi koje osjeti svaka smjena.',
    items: [
      { prefix: '< ', value: 2, suffix: ' s', label: 'od slanja narudžbe do ekrana konobara' },
      { prefix: '', value: 0, suffix: '', label: 'dupliranih narudžbi, i kad gost klikne dvaput' },
      { prefix: '< ', value: 60, suffix: ' s', label: 'do prve narudžbe, bez ikakvog uputstva' },
      { prefix: '', value: 0, suffix: '', label: 'novih uređaja: dovoljni su telefoni osoblja' },
    ],
  },
  features: {
    eyebrow: 'Za lokale',
    title: 'Sve što lokalu treba. Ništa što smeta.',
    subtitle:
      'Vi postavljate meni, stolove i osoblje. qafe se brine da svaka narudžba stigne na pravo mjesto, u pravom trenutku.',
    items: [
      {
        key: 'live',
        title: 'Narudžbe uživo',
        body: 'Zvuk, vibracija i push notifikacija za svaku novu narudžbu, poziv konobara i zahtjev za račun.',
      },
      {
        key: 'claim',
        title: 'Jedna narudžba, jedan konobar',
        body: 'Kad neko prihvati narudžbu, svi vide ko. Niko ne trči do istog stola dvaput.',
      },
      {
        key: 'menu',
        title: 'Meni koji uređujete sami',
        body: 'Kategorije, dodaci, slike i cijene. Artikl koji je nestao označite kao nedostupan jednim klikom.',
      },
      {
        key: 'tables',
        title: 'Zone, stolovi i QR kodovi',
        body: 'Terasa, sala, šank. QR kodove izvezete u PDF za štampu, a svaki možete poništiti.',
      },
      {
        key: 'staff',
        title: 'Osoblje i uloge',
        body: 'Nalog za svakog konobara i PIN za zajednički uređaj. Vi odlučujete ko smije otkazati ili odbiti.',
      },
      {
        key: 'reports',
        title: 'Izvještaji',
        body: 'Promet po danu, konobaru, artiklu i satu, uz poređenje s prethodnim periodom. Izvoz u CSV, Excel i PDF.',
      },
      {
        key: 'safety',
        title: 'Zaštita od šale sa susjednog stola',
        body: 'Prva narudžba ide na potvrdu, novi uređaji traže odobrenje, a gost može označiti narudžbu kao „Nije naše“.',
      },
      {
        key: 'kds',
        title: 'Šank i kuhinja (KDS)',
        body: 'Opcioni ekran za pripremu, sa vremenom čekanja i bojom koja upozori kad nešto kasni.',
      },
    ],
  },
  guests: {
    eyebrow: 'Za goste',
    title: 'Sjedni. Skeniraj. Uživaj.',
    body: 'Bez aplikacije, bez registracije i bez mahanja preko sale. Naručite kad ste spremni i pratite narudžbu uživo.',
    points: [
      'Meni sa slikama, opisima i cijenama',
      'Status narudžbe uživo, od slanja do posluživanja',
      'Pozovi konobara ili traži račun jednim dodirom',
    ],
    venuesTitle: 'Gdje možete naručiti preko qafe',
    venuesEmpty: 'Prvi lokali uskoro stižu na qafe. Potražite qafe QR kod na svom stolu.',
    venuesOwnerCta: 'Imate lokal? Budite među prvima.',
  },
  faq: {
    eyebrow: 'Pitanja',
    title: 'Ono što vlasnici prvo pitaju.',
    items: [
      {
        q: 'Da li gost mora instalirati aplikaciju?',
        a: 'Ne. QR kod otvara meni u browseru telefona. Nema instalacije ni registracije.',
      },
      {
        q: 'Šta nam treba za početak?',
        a: 'Telefoni osoblja i odštampani QR kodovi. Aplikacija za osoblje radi u browseru i može se dodati na početni ekran.',
      },
      {
        q: 'Može li neko naručiti za tuđi sto?',
        a: 'Prva narudžba nove sesije ide na potvrdu konobaru, novi uređaji za stolom traže odobrenje, a sumnjivu narudžbu gost može prijaviti kao „Nije naše“. Konačnu riječ uvijek ima konobar.',
      },
      {
        q: 'Šta ako nestane interneta?',
        a: 'Aplikacija za osoblje prikazuje posljednje stanje i pamti akcije, a sinhronizuje ih čim se veza vrati.',
      },
      {
        q: 'Kako gost plaća?',
        a: 'Gost traži račun i bira gotovinu ili karticu, zavisno od toga šta lokal nudi. Konobar naplati i zatvori sto.',
      },
      {
        q: 'Jesu li podaci našeg lokala odvojeni od drugih?',
        a: 'Da. Svaki lokal vidi isključivo svoje podatke, a izolacija je zaključana na nivou baze podataka.',
      },
    ],
  },
  cta: {
    title: 'Neka narudžbe dolaze same.',
    body: 'Javite nam se i zajedno ćemo postaviti meni, stolove i QR kodove za vaš lokal.',
    primary: 'Zatraži demo',
    secondary: 'Pišite nam',
    mailSubject: 'qafe demo',
  },
  footer: {
    tagline: 'QR naručivanje za kafiće i restorane.',
    staffLogin: 'Prijava osoblja',
    panel: 'Panel lokala',
    rights: 'Sva prava zadržana.',
  },
};

export type Messages = typeof bs;
