# qafe.ba – Specifikacija zahtjeva

Sep 30, 2026 · @Berin

## Uvod

qafe.ba je multi-tenant platforma za naručivanje preko QR koda na stolu. Jedna platforma opslužuje više lokala, a podaci svakog lokala su izolovani. Ovaj dokument definiše šta sistem radi za svaki od četiri tipa korisnika i koje kvalitativne uslove mora ispuniti.

| Tip korisnika | Ko je | Pristupa preko |
| --- | --- | --- |
| Administrator platforme | Tim qafe.ba (super admin) | Admin panel, desktop web |
| Šef lokala | Vlasnik ili menadžer lokala | Panel lokala, desktop i mobilni web |
| Konobar | Osoblje lokala, uključujući šankera | Staff PWA na telefonu, KDS na tabletu |
| Gost | Posjetilac lokala, bez naloga | Web u browseru, preko QR koda |

Oznake zahtjeva: FR-ADM, FR-SEF, FR-KON i FR-GOS za funkcionalne zahtjeve po tipu korisnika, NFR za nefunkcionalne.

Prioriteti:

- **MVP**: potrebno za prvo puštanje u rad u jednom lokalu.
- **V2**: prva nadogradnja, nakon provjere u praksi.
- **V3**: kasnije, zavisno od potražnje.
- **Modul**: funkcija postoji u sistemu, ali je administrator uključuje samo za lokale koji je traže.

Šef ima sve ovlasti konobara. Te ovlasti nisu ponovljene u njegovoj sekciji.

Sistem je fleksibilan na dva nivoa. Administrator uključuje module po lokalu, npr. šank i kuhinju (KDS). Šef uključuje opcije unutar lokala, npr. odbijanje narudžbi, smjene ili dodjelu zona. Sve što nije obavezno je po defaultu isključeno.

## 1. Administrator platforme

Administrator upravlja lokalima i korisnicima na nivou cijele platforme. Ne radi svakodnevne operacije lokala, osim kad pruža podršku.

### Lokali i korisnici

| ID | Područje | Zahtjev | Prioritet |
| --- | --- | --- | --- |
| FR-ADM-01 | Prijava | Prijava emailom i lozinkom, uz dvofaktorsku autentifikaciju (TOTP) koju admin uključuje u svom nalogu; platforma je može učiniti obaveznom (`ADMIN_MFA_REQUIRED`). | MVP |
| FR-ADM-02 | Lokali | Kreiranje lokala: naziv, slug (subdomen), JIB, PDV broj, adresa, kontakt, valuta i vremenska zona. | MVP |
| FR-ADM-03 | Lokali | Pri kreiranju lokala sistem automatski kreira uloge Šef i Konobar. Administrator kreira nalog šefa sa privremenom lozinkom, bez slanja emaila. | MVP |
| FR-ADM-04 | Lokali | Izmjena podataka lokala i promjena statusa: na čekanju, aktivan, suspendovan, zatvoren. Suspendovan lokal ne prima narudžbe. | MVP |
| FR-ADM-05 | Lokali | Lista svih lokala sa pretragom i filterima po statusu i gradu. | MVP |
| FR-ADM-06 | Moduli | Uključivanje opcionih modula po lokalu, npr. šank i kuhinja (KDS). Isključen modul se ne prikazuje ni šefu ni osoblju. | MVP |
| FR-ADM-07 | Meni | Uređivanje menija bilo kog lokala, radi pomoći pri postavljanju. | MVP |
| FR-ADM-08 | Meni | Uvoz menija iz CSV ili Excel fajla. | V2 |
| FR-ADM-09 | Korisnici | Pregled svih korisnika, blokiranje naloga i reset lozinke. | MVP |
| FR-ADM-10 | Audit | Pregled audit loga, sa filterima po lokalu, korisniku i vrsti akcije. | MVP |
| FR-ADM-11 | Podrška | Ulaz u panel lokala u ime šefa (impersonacija). Svaki ulaz se bilježi u audit log. | V2 |
| FR-ADM-12 | Podrška | Uloga "support" sa pravom samo čitanja, za članove tima bez punih ovlasti. | V2 |
| FR-ADM-13 | Ovlasti | Uređivanje globalnog kataloga ovlasti i podrazumijevanih uloga za nove lokale. | V2 |
| FR-ADM-14 | Statistika | Zbirni pregled: broj aktivnih lokala, narudžbi i prometa po danu. | V2 |
| FR-ADM-15 | Obavijesti | Slanje obavijesti svim lokalima, npr. o planiranom održavanju. | V3 |
| FR-ADM-16 | Pretplate | Planovi pretplate, naplata i fakture za lokale. | V3 |
| FR-ADM-22 | Tema | Izbor teme (palete boja) za admin, panel lokala i aplikaciju za osoblje, za cijelu platformu. Promjena se vidi bez ponovnog učitavanja. Svijetla ili tamna varijanta ostaje izbor korisnika. | MVP |
| FR-ADM-23 | Email | SMTP postavke platforme (server, port, zaštita veze, korisnik, šifrovana lozinka, pošiljalac) i slanje testnog emaila. | MVP |

### Nadzor mikroservisa

Administrator vidi stanje svakog servisa na jednom ekranu. Podaci se prikupljaju pasivno, iz metrika koje servisi ionako izvoze, bez dodatnih poziva servisima (vidi NFR-21).

| ID | Područje | Zahtjev | Prioritet |
| --- | --- | --- | --- |
| FR-ADM-17 | Stanje | Pregled svih servisa: dostupnost, verzija, vrijeme rada i broj instanci. | MVP |
| FR-ADM-18 | Latencija | Latencija po servisu i endpointu (p50, p95, p99), broj zahtjeva i stopa grešaka, za zadnji 1 h, 24 h i 7 dana. | MVP |
| FR-ADM-19 | Resursi | Potrošnja CPU-a i memorije po servisu i veličina redova poruka. | V2 |
| FR-ADM-20 | Tragovi | Pregled puta jednog zahtjeva kroz servise, npr. od slanja narudžbe do prikaza kod konobara. | V2 |
| FR-ADM-21 | Alarmi | Obavijest administratoru kad servis padne ili latencija pređe postavljeni prag. | V2 |

## 2. Šef lokala

Šef samostalno postavlja i vodi svoj lokal: prostor, meni, osoblje i izvještaje. Vidi samo podatke svog lokala.

| ID | Područje | Zahtjev | Prioritet |
| --- | --- | --- | --- |
| FR-SEF-01 | Prijava | Prijava korisničkim imenom i privremenom lozinkom koju dodijeli administrator. Promjena lozinke je obavezna pri prvoj prijavi, osim ako onaj ko postavlja lozinku to isključi. | MVP |
| FR-SEF-02 | Profil lokala | Uređivanje naziva, loga, boje, kontakta i radnog vremena. | MVP |
| FR-SEF-03 | Postavke | Uključivanje i isključivanje naručivanja gostiju i potvrde prve narudžbe. | MVP |
| FR-SEF-04 | Postavke | Dozvola odbijanja narudžbe. Po defaultu isključeno: konobar tada narudžbu može samo izmijeniti ili vratiti gostu. | MVP |
| FR-SEF-05 | Postavke | Izbor omogućenih načina plaćanja (gotovina, kartica) i podrazumijevanog načina. Po defaultu je omogućena gotovina. | MVP |
| FR-SEF-06 | Postavke | Uključivanje evidencije smjena. Po defaultu isključeno. | V2 |
| FR-SEF-07 | PDV | Jedna PDV stopa za cijeli lokal, podrazumijevano 17%, koja važi za sve artikle. Cijene u meniju uključuju PDV. | MVP |
| FR-SEF-08 | Osoblje | Kreiranje naloga osoblja direktno u panelu: ime, korisničko ime, lozinka ili PIN i uloga. Bez slanja emaila. | MVP |
| FR-SEF-09 | Osoblje | Deaktivacija naloga, reset lozinke ili PIN-a i promjena uloge. | MVP |
| FR-SEF-10 | Uloge | Kreiranje vlastitih uloga (npr. Šanker) uz izbor ovlasti. Uloga Šef se ne može obrisati niti ograničiti. | V2 |
| FR-SEF-11 | Prostor | Kreiranje zona (terasa, sala) i stolova, sa oznakom i brojem mjesta. | MVP |
| FR-SEF-12 | Prostor | Kreiranje stanica pripreme (šank, kuhinja), kad je KDS modul uključen. | Modul |
| FR-SEF-13 | Prostor | Opcionalna dodjela konobara zonama. Bez dodjele svaki konobar vidi sve zone. | V2 |
| FR-SEF-14 | Prostor | Vizuelni raspored stolova (tlocrt) povlačenjem mišem. | V3 |
| FR-SEF-15 | QR kodovi | Generisanje QR kodova i izvoz u PDF za štampu, više kodova po stranici, sa oznakom stola. | MVP |
| FR-SEF-16 | QR kodovi | Poništavanje QR koda jednog stola. Stari kod prestaje raditi. | MVP |
| FR-SEF-17 | Meni | Kategorije i artikli: naziv, opis, slika, cijena i redoslijed povlačenjem. | MVP |
| FR-SEF-18 | Meni | Grupe dodataka sa minimalnim i maksimalnim brojem izbora, i doplatom po opciji. | MVP |
| FR-SEF-19 | Meni | Označavanje artikla kao privremeno nedostupnog, jednim klikom. | MVP |
| FR-SEF-20 | Meni | Prevodi menija na više jezika. | V2 |
| FR-SEF-21 | Meni | Vremenski ograničeni meniji, npr. doručak ili happy hour. | V2 |
| FR-SEF-22 | Meni | Alergeni po artiklu, sa EU liste od 14 alergena. | V3 |
| FR-SEF-23 | Narudžbe | Pregled narudžbi svih zona, otkazivanje bilo koje narudžbe uz razlog. | MVP |
| FR-SEF-24 | Izvještaji | Promet i broj narudžbi po danu, konobaru, artiklu, kategoriji, satu i danu u sedmici, za odabrani period, uz poređenje sa prethodnim periodom. | MVP |
| FR-SEF-25 | Izvještaji | Izvoz svakog izvještaja u CSV, Excel i PDF. | MVP |
| FR-SEF-26 | Smjene | Pregled smjena osoblja i stanja kase, kad je evidencija smjena uključena. | V2 |
| FR-SEF-27 | Plaćanja | Pregled svih plaćanja i odobravanje povrata novca. | V2 |
| FR-SEF-28 | Audit | Pregled izmjena u lokalu: promjene cijena, otkazivanja, povrati. | V2 |
| FR-SEF-29 | Fiskalizacija | Povezivanje sa fiskalnim uređajem ili servisom, tako da svaka naplata izdaje fiskalni račun. | V3 |

## 3. Konobar

Konobar prima narudžbe, prati njihov status i naplaćuje. Radi na telefonu u staff PWA, a šank i kuhinja na KDS ekranu, kad je taj modul uključen.

### Staff aplikacija

| ID | Područje | Zahtjev | Prioritet |
| --- | --- | --- | --- |
| FR-KON-01 | Prijava | Prijava korisničkim imenom i lozinkom na svom telefonu, ili PIN-om na zajedničkom uređaju lokala. | MVP |
| FR-KON-02 | Rad | Nakon prijave jedan dodir na "Spreman za rad" aktivira zvučna upozorenja, jer browser traži interakciju prije zvuka. | MVP |
| FR-KON-03 | Smjena | Početak i kraj smjene, samo kad šef uključi evidenciju smjena. | V2 |
| FR-KON-04 | Narudžbe | Lista narudžbi u realnom vremenu, sa filterom po zoni i statusu. Nova narudžba se označava zvukom i vizuelno. | MVP |
| FR-KON-05 | Narudžbe | Push notifikacija za novu narudžbu i poziv konobara kad je aplikacija u pozadini. | MVP |
| FR-KON-06 | Narudžbe | Prihvatanje narudžbe jednim dodirom. | MVP |
| FR-KON-07 | Narudžbe | Izmjena narudžbe: uklanjanje ili zamjena stavke koja nije dostupna, uz kratku poruku gostu. Gost vidi status "Izmijenjeno". | MVP |
| FR-KON-08 | Narudžbe | Vraćanje narudžbe gostu na izmjenu, uz poruku. Gost je ispravlja i ponovo šalje. | MVP |
| FR-KON-09 | Narudžbe | Odbijanje narudžbe uz razlog, samo kad šef to dozvoli. | MVP |
| FR-KON-10 | Narudžbe | Dodavanje stavki na postojeću narudžbu, dok nije poslužena. | MVP |
| FR-KON-11 | Narudžbe | Promjena statusa: prihvaćeno, posluženo. Kad je KDS uključen, dostupni su i statusi u pripremi i spremno. | MVP |
| FR-KON-12 | Narudžbe | Ručni unos narudžbe za sto, za goste bez telefona. | MVP |
| FR-KON-13 | Narudžbe | Otkazivanje stavke, ako uloga ima tu ovlast. | MVP |
| FR-KON-14 | Narudžbe | Premještanje narudžbe na drugi sto i spajanje stolova. | V2 |
| FR-KON-15 | Stolovi | Pregled stolova sa statusom: slobodan, zauzet, čeka uslugu, traži račun. | MVP |
| FR-KON-16 | Sesije | Potvrda nove sesije stola i novih uređaja u sesiji (vidi Zaštita sesije stola). | MVP |
| FR-KON-17 | Sesije | Uklanjanje uređaja iz sesije i blokada tog uređaja u lokalu na 12 sati. Sve njegove nepotvrđene narudžbe se poništavaju. | MVP |
| FR-KON-18 | Zahtjevi | Prijem poziva konobara i zahtjeva za račun, uz potvrdu "vidio sam" i "riješeno". | MVP |
| FR-KON-19 | Naplata | Naplata cijelog stola. Nude se samo načini plaćanja koje je šef omogućio, a podrazumijevani je unaprijed odabran. | MVP |
| FR-KON-20 | Naplata | Djelimična naplata: izbor stavki koje jedan gost plaća. | V2 |
| FR-KON-21 | Naplata | Zatvaranje stola nakon naplate. Sesija se zatvara i gosti više ne mogu naručivati. | MVP |
| FR-KON-22 | Meni | Označavanje artikla kao nedostupnog, ako uloga ima tu ovlast. | MVP |
| FR-KON-23 | Pregled | Pregled vlastitog prometa i broja narudžbi za dan. | V2 |

### Šank i kuhinja (KDS), opcioni modul

KDS uključuje administrator po lokalu. Bez njega konobar sam vodi narudžbu od prihvatanja do posluživanja. Kad je uključen, KDS je pomoćni prikaz i nikad ne blokira tok narudžbe.

| ID | Područje | Zahtjev | Prioritet |
| --- | --- | --- | --- |
| FR-KON-24 | Prikaz | KDS prikazuje samo stavke svoje stanice pripreme, grupisane po narudžbi, sa stolom i vremenom čekanja. | Modul |
| FR-KON-25 | Prikaz | Kartica mijenja boju kad čekanje pređe prag koji šef postavi, npr. 5 i 10 minuta. | Modul |
| FR-KON-26 | Akcije | Označavanje stavke kao spremne jednim dodirom. Konobar dobija obavijest, ali može poslužiti i bez te oznake. | Modul |
| FR-KON-27 | Akcije | Poništavanje zadnje akcije u roku od 10 sekundi. | Modul |
| FR-KON-28 | Rad | Fullscreen način rada, ekran se ne gasi, zvuk za novu stavku. | Modul |
| FR-KON-29 | Rad | Pregled završenih narudžbi zadnjih 60 minuta, radi provjere. | Modul |

## 4. Gost

Gost naručuje sa svog telefona bez instalacije i bez registracije. Identifikuje se samo sesijom stola.

| ID | Područje | Zahtjev | Prioritet |
| --- | --- | --- | --- |
| FR-GOS-01 | Pristup | Skeniranje QR koda otvara meni lokala u browseru i otvara ili pridružuje sesiju stola. | MVP |
| FR-GOS-02 | Pristup | Poništen ili nepostojeći QR kod prikazuje jasnu poruku i ne dozvoljava naručivanje. | MVP |
| FR-GOS-03 | Pristup | Kad je lokal zatvoren ili je naručivanje isključeno, gost vidi meni, ali ne može naručiti. | MVP |
| FR-GOS-04 | Meni | Pregled kategorija i artikala sa slikom, opisom i cijenom. Nedostupni artikli su označeni i ne mogu se dodati. | MVP |
| FR-GOS-05 | Meni | Pretraga artikala po nazivu. | V2 |
| FR-GOS-06 | Meni | Izbor jezika menija. | V2 |
| FR-GOS-07 | Meni | Prikaz alergena po artiklu. | V3 |
| FR-GOS-08 | Korpa | Dodavanje artikla sa dodacima, izmjena količine, napomena po stavci. Korpa preživi osvježavanje stranice. | MVP |
| FR-GOS-09 | Narudžba | Slanje narudžbe uz pregled ukupnog iznosa prije potvrde. | MVP |
| FR-GOS-10 | Narudžba | Praćenje statusa narudžbe uživo: poslano, prihvaćeno, izmijenjeno, vraćeno na izmjenu, posluženo. Uz KDS i u pripremi i spremno. Odbijeno samo ako lokal to dozvoljava. | MVP |
| FR-GOS-11 | Narudžba | Kad konobar izmijeni narudžbu, gost vidi šta je promijenjeno i poruku konobara. | MVP |
| FR-GOS-12 | Narudžba | Narudžbu vraćenu na izmjenu gost ispravlja i ponovo šalje, ili je povlači. | MVP |
| FR-GOS-13 | Narudžba | Dodavanje novih narudžbi u istu sesiju, bez ponovnog skeniranja. | MVP |
| FR-GOS-14 | Usluga | Dugme "Pozovi konobara". Ponovni poziv je moguć tek nakon 60 sekundi. | MVP |
| FR-GOS-15 | Usluga | Zahtjev za račun, uz izbor između načina plaćanja koje lokal nudi. Podrazumijevani način je unaprijed odabran. | MVP |
| FR-GOS-16 | Račun | Pregled računa sesije sa svim stavkama i ukupnim iznosom. | MVP |
| FR-GOS-17 | Plaćanje | Online plaćanje karticom, Apple Pay i Google Pay. | V2 |
| FR-GOS-18 | Plaćanje | Dijeljenje računa: plaćanje samo svojih stavki ili jednakog dijela. | V3 |
| FR-GOS-19 | Feedback | Ocjena posjete i komentar nakon zatvaranja sesije. | V3 |

### Zaštita sesije stola

Scenarij: gost sa susjednog stola skenira tuđi QR kod ili se pridruži tuđoj sesiji i naruči za drugi sto. Nijedna mjera sama nije dovoljna, pa se kombinuje više slojeva. Konačnu riječ uvijek ima konobar, jer on vidi ko sjedi za stolom.

| ID | Područje | Zahtjev | Prioritet |
| --- | --- | --- | --- |
| FR-GOS-20 | Domaćin sesije | Prvi uređaj koji otvori sesiju postaje domaćin sesije. Domaćin se može prenijeti na drugi uređaj za stolom. | MVP |
| FR-GOS-21 | Nova sesija | Prva narudžba nove sesije ide na potvrdu konobaru, koji vidi da li za stolom neko stvarno sjedi. Umjesto toga lokal može tražiti PIN koji konobar kaže gostima na stolu. | MVP |
| FR-GOS-22 | Novi uređaj | Uređaj koji se pridruži aktivnoj sesiji može gledati meni, ali prije prve narudžbe čeka odobrenje domaćina ili konobara. Domaćin vidi upit "Novi uređaj želi naručivati za ovim stolom". | MVP |
| FR-GOS-23 | Jedna sesija | Jedan uređaj je aktivan u samo jednoj sesiji u lokalu. Skeniranje drugog stola traži napuštanje prethodne sesije, uz potvrdu. | MVP |
| FR-GOS-24 | Transparentnost | Svi uređaji za stolom vide sve narudžbe sesije, sa nadimkom uređaja koji je naručio. | MVP |
| FR-GOS-25 | Prijava zloupotrebe | Gost može označiti narudžbu kao "Nije naše". Konobar dobija upozorenje, a narudžba ne ulazi u račun dok je konobar ne potvrdi ili otkaže. | MVP |
| FR-GOS-26 | Blokada | Uređaj koji konobar ukloni iz sesije ne može otvoriti niti se pridružiti sesiji u tom lokalu 12 sati (vidi FR-KON-17). | MVP |
| FR-GOS-27 | Ograničenja | Najviše 2 nepotvrđene narudžbe po uređaju i 5 narudžbi u minuti po sesiji. | MVP |
| FR-GOS-28 | Wi-Fi lokala | Šef može uključiti potvrdu stola preko Wi-Fi mreže lokala. Gost koji naručuje sa javne IP adrese lokala potvrđuje sto sam, bez PIN-a i bez čekanja konobara. Opcija je po defaultu isključena i radi uz oba načina iz FR-GOS-21. | MVP |

Identifikacija uređaja preko cookie-ja se može zaobići novim incognito prozorom, pa je potvrda konobara glavna zaštita. Wi-Fi potvrda (FR-GOS-28) dokazuje samo da je gost u lokalu, ne za kojim stolom sjedi. Zato ona zamjenjuje samo korak potvrde stola; narudžbe i dalje prihvata konobar, a "Nije naše" i odobravanje novih uređaja rade kao i do sada. Geolokacija se ne koristi, jer u zatvorenom prostoru nije dovoljno precizna da razlikuje susjedne stolove.

## 5. Nefunkcionalni zahtjevi

Svaki zahtjev ima mjerljiv kriterij, tako da se može testirati prije puštanja u rad.

| ID | Kategorija | Zahtjev | Kriterij |
| --- | --- | --- | --- |
| NFR-01 | Performanse | Meni gosta se brzo učitava i na slabom mobilnom internetu. | LCP ispod 2,5 s na 4G; JavaScript gostujućeg dijela ispod 200 KB gzip |
| NFR-02 | Performanse | Nova narudžba stiže do konobara i KDS-a gotovo odmah. | Ispod 2 s od slanja do prikaza, p95 |
| NFR-03 | Performanse | API odgovara brzo pod normalnim opterećenjem. | p95 ispod 300 ms |
| NFR-04 | Dostupnost | Sistem je dostupan tokom radnog vremena lokala. | 99,5% mjesečno; održavanje između 04 i 06 h |
| NFR-05 | Otpornost | Staff aplikacija i KDS pri prekidu interneta prikazuju posljednje stanje i pamte akcije. | Akcije se sinhronizuju u roku od 5 s nakon povratka veze |
| NFR-06 | Otpornost | Nijedna narudžba se ne gubi niti duplira pri ponovnom slanju. | Idempotency ključ na svakoj narudžbi; 0 duplikata u testu |
| NFR-07 | Sigurnost | Sav saobraćaj je šifrovan, a lozinke su zaštićene. | HTTPS, TLS 1.2+; lozinke argon2id |
| NFR-08 | Sigurnost | Sesije osoblja su kratkotrajne i mogu se opozvati. | Access token 15 min; refresh token sa rotacijom |
| NFR-09 | Sigurnost | Lokal nikad ne vidi podatke drugog lokala. | Row Level Security u bazi; automatski test izolacije u CI |
| NFR-10 | Sigurnost | QR kod se ne može pogoditi, a zloupotreba sesije je ograničena. | QR token najmanje 128 bita; ograničenja iz FR-GOS-27 |
| NFR-11 | Sigurnost | Aplikacija je zaštićena od čestih napada. | OWASP ASVS nivo 1 |
| NFR-12 | Privatnost | Gosti ostaju anonimni; lični podaci osoblja se čuvaju po zakonu. | Bez imena i telefona gostiju; usklađenost sa zakonom BiH o zaštiti ličnih podataka i GDPR-om |
| NFR-13 | Skalabilnost | Arhitektura podržava rast bez prepravki. | 100 lokala, 50 aktivnih stolova po lokalu, 20.000 narudžbi dnevno |
| NFR-14 | Upotrebljivost | Gost naručuje brzo i bez uputstva. | Prva narudžba ispod 60 s u testu sa 5 korisnika |
| NFR-15 | Upotrebljivost | Staff i KDS su upotrebljivi u gužvi i jednom rukom. | Dugmad najmanje 44 x 44 px; ključne akcije jednim dodirom |
| NFR-16 | Usklađenost | Fiskalizacija se uvodi kasnije, ali model naplate mora ostaviti mjesto za nju. | Obaveze u FBiH i RS provjerene prije V3 |
| NFR-17 | Pristupačnost | Gostujući dio je dostupan osobama sa invaliditetom. | WCAG 2.1 nivo AA |
| NFR-18 | Lokalizacija | Interfejs je na lokalnom jeziku, uz podršku za više jezika. | MVP: bosanski i engleski |
| NFR-19 | Kompatibilnost | Aplikacije rade na uređajima koje lokali i gosti stvarno koriste. | iOS Safari 16.4+, Android Chrome (zadnje 2 verzije), desktop Chrome, Edge, Firefox i Safari; ekrani od 360 px |
| NFR-20 | Održavanje | Kod je tipiziran, testiran i automatski se pušta u rad. | TypeScript; pokrivenost testovima biznis logike najmanje 70%; CI/CD sa staging okruženjem |
| NFR-21 | Nadzor | Metrike, logovi i tragovi se prikupljaju pasivno i ne usporavaju servise. | OpenTelemetry sa asinhronim izvozom; uzorkovanje tragova 10%; dodatno opterećenje ispod 2% CPU-a i ispod 5 ms na p95 |
| NFR-22 | Nadzor | Nadzor radi i kad neki servis padne. | Metrike se čuvaju izvan aplikacijskih servisa; admin ekran čita samo iz njih |
| NFR-23 | Arhitektura | Pad jednog nekritičnog servisa, npr. izvještaja, ne zaustavlja primanje i posluživanje narudžbi. | Test gašenja svakog nekritičnog servisa u staging okruženju |
| NFR-24 | Backup | Podaci se mogu vratiti nakon kvara. | Dnevni backup uz point-in-time recovery; RPO 15 min, RTO 4 h; test oporavka svaka 3 mjeseca |
| NFR-25 | Revizija | Osjetljive akcije ostavljaju trag koji se ne može mijenjati. | Izmjene cijena, otkazivanja i povrati u audit logu; čuvanje najmanje 12 mjeseci |

## Urađeno u verziji 0.5 (2. 10. 2026.)

Pregled onoga što je dodano u ovoj fazi, s objašnjenjem kako radi i gdje se podešava.

### Potvrda stola preko Wi-Fi mreže lokala (FR-GOS-28)

- **Šta radi:** gost koji je spojen na Wi-Fi lokala potvrđuje sto sam. Ne mora unositi PIN niti čekati da konobar potvrdi prvu narudžbu. Na ovaj način otpada najdosadniji korak, a zaštita od naručivanja "sa ulice" ostaje.
- **Kako radi:** šef u panelu (Postavke → Naručivanje) uključi opciju "Wi-Fi potvrda stola" i u sekciji "Wi-Fi mreže lokala" doda mrežu. Dugme "Dodaj ovu mrežu" upisuje javnu IP adresu s koje je šef trenutno spojen, a mrežu se može upisati i ručno (IPv4/IPv6 adresa ili raspon u CIDR obliku). Pri pridruživanju stolu, pri osvježavanju stanja i pri slanju narudžbe API provjeri da li je IP adresa gosta u nekoj od mreža lokala. Ako jeste, sesija dobija `verified_at` i u audit log ide događaj `session.verified` s oznakom `wifi`.
- **Uključivanje i isključivanje:** opcija se pali i gasi u postavkama, kao i PIN način, i po defaultu je isključena. Kad je isključena ili lokal nema upisanu mrežu, sve radi kao prije (konobar ili PIN). Gost koji nije na Wi-Fi-ju lokala vidi napomenu da se spoji na Wi-Fi, a uz nju i dalje može unijeti PIN.
- **Baza:** kolona `core.venues.wifi_verification_enabled` i tabela `core.venue_networks` (sa RLS-om), migracija `20261002090000_venue_wifi_verification.sql`.
- **Iza proxyja:** API vjeruje samo onoliko proxy skokova koliko piše u `TRUST_PROXY_HOPS` (default 1, Traefik). Tako gost ne može lažirati IP adresu preko `X-Forwarded-For` zaglavlja.
- **Šta namjerno nije urađeno:** ograničenje udaljenosti (geolokacija) i NFC. Geolokacija u zatvorenom prostoru nije dovoljno precizna, a NFC ne radi u Safariju na iPhoneu.

### Pozadinski poslovi (worker, BullMQ)

Worker sada osim outbox releja pokreće i zakazane poslove. Raspored je u Redisu (BullMQ, prefiks `qafe:jobs`), pa posao radi samo jedna instanca workera, čak i kad ih radi više.

| Posao | Kada | Šta radi |
| --- | --- | --- |
| Zatvaranje napuštenih stolova | svakih 5 min | Otvorena sesija bez ijedne (neotkazane) narudžbe, u kojoj se nijedan uređaj nije javio `ABANDON_AFTER_MINUTES` minuta (default 30), postaje "napuštena", a njeni otvoreni zahtjevi se otkazuju. Sto se tako oslobađa i na pregledu stolova, a ne tek pri sljedećem skeniranju. Sesije s narudžbama se nikad ne zatvaraju same, jer imaju račun. |
| Čišćenje starih podataka | svaku noć u 03:30 | Briše blokade uređaja istekle prije više od 7 dana, refresh sesije osoblja istekle ili opozvane prije više od 30 dana, i objavljene outbox redove starije od 30 dana (modul audit ih je već upisao u audit log, koji se ne briše). |

### KDS: šank i kuhinja (FR-KON-24..29, modul)

- **Uključivanje:** administrator uključuje modul `kds` za lokal. Šef u panelu (Postavke → Šank i kuhinja (KDS)) dodaje stanice pripreme, npr. "Šank" i "Kuhinja", i postavlja pragove boja (npr. 5 i 10 minuta). U editoru menija svakom artiklu bira stanicu. Artikli bez stanice ne idu na KDS.
- **Ekran:** u staff aplikaciji se pojavi stavka "KDS" (`/kds`). To je ekran preko cijelog prikaza, bez navigacije, namijenjen tabletu na šanku ili u kuhinji. Na početku pita za zvuk i fullscreen, a ekran se ne gasi (Wake Lock). Stanica se bira jednom i pamti na uređaju.
- **Rad:** kartice su grupisane po narudžbi, sa stolom i vremenom čekanja, a boja se mijenja po pragovima. Dodir na stavku je označava kao spremnu. Kad su sve stavke narudžbe spremne, narudžba postaje "Spremno" i konobar dobija zvuk i obavijest. Greška se poništava dugmetom "Poništi" u roku od 10 sekundi (server dozvoljava 15 s zbog kašnjenja mreže). "Počni pripremu" označava narudžbu kao "U pripremi", što gost vidi. Završene narudžbe zadnjih 60 minuta su dostupne preko prekidača "Završeno (60 min)".
- **API:** `GET /staff/kds?station=…`, `POST /staff/kds/items/:id/ready`, `…/undo`, `POST /staff/kds/orders/:id/start`. Ako modul nije uključen, API vraća `module_disabled`.

### Monitoring (NFR-21, NFR-22, osnova za FR-ADM-17 i 18)

- **Sastav:** OpenTelemetry Collector, Prometheus, Loki, Alloy i Grafana, kao compose profil `monitoring` (`make up` ga pokreće). Tempo (tragovi) namjerno nije dodan.
- **Metrike:** API i worker šalju metrike asinhrono preko OTLP-a svakih 15 s. Bez `OTEL_EXPORTER_OTLP_ENDPOINT` ne šalju ništa i ne troše resurse. API mjeri trajanje svakog zahtjeva s atributima `module`, `route`, `method` i `status`. Worker broji outbox događaje po modulu i tipu. Oba šalju i potrošnju CPU-a i memorije. Prometheus dodatno čita metrike Traefika (zahtjevi po aplikaciji).
- **Logovi:** Alloy čita logove svih kontejnera i šalje ih u Loki, s oznakom servisa. Logovi se čuvaju 14 dana, a metrike 15 dana.
- **Grafana:** `http://grafana.qafe.localhost` lokalno, `grafana.<domena>` na serveru. Lozinka je u `GRAFANA_ADMIN_PASSWORD`, a `grafana` je rezervisan slug. Početni dashboard "qafe.ba – pregled" prikazuje: zahtjeve u sekundi, p95 trajanje s pragom od 300 ms (NFR-03), postotak grešaka 5xx, zahtjeve, p95 i greške po modulu, najsporije rute, zahtjeve po aplikaciji preko Traefika, outbox događaje i greške iz logova.
- **Otpornost:** nadzor radi u zasebnim kontejnerima, pa pad API-ja ne gasi Grafanu (NFR-22).
- **Još nedostaje:** ekran nadzora u admin panelu (FR-ADM-17 i 18). Grafana ga za sada zamjenjuje. Alarmi (FR-ADM-21) se mogu dodati u Grafani.

### Backup baze (NFR-24)

- **Šta radi:** servis `backup` svaku noć u 02:30 (`BACKUP_AT`, vremenska zona `BACKUP_TZ`) napravi `pg_dump` cijele baze. Dump šifruje (AES-256, ključ iz `BACKUP_PASSPHRASE`) i šalje u S3 bucket `backups`, u folder `daily/`. Nedjeljom ista kopija ide i u `weekly/`. Čuva se zadnjih 7 dnevnih i 4 sedmične kopije, a starije se brišu same.
- **Gdje:** lokalno u MinIO. Na serveru varijable `BACKUP_S3_ENDPOINT`, `BACKUP_S3_ACCESS_KEY` i `BACKUP_S3_SECRET_KEY` pokazuju na S3 izvan servera (npr. Backblaze B2 ili Hetzner), da kopija preživi gubitak servera.
- **Komande:** `make backup` odmah napravi kopiju. `make backup-restore-test` vrati zadnju kopiju u zasebnu bazu `qafe_restore` i ispiše broj lokala, korisnika i narudžbi, kao provjeru da je kopija ispravna. Vraćanje u živu bazu traži `RESTORE_INTO_LIVE=yes`.
- **Provjereno:** kopija, brisanje starih kopija, vraćanje i odbijanje pogrešne lozinke.
- **Razlika prema NFR-24:** point-in-time recovery (arhiviranje WAL-a) još nije uveden, pa je trenutni RPO do 24 sata, a ne 15 minuta. Do produkcije treba dodati WAL arhiviranje (npr. pgBackRest ili WAL-G) ili koristiti upravljanu bazu.
- **Važno:** bez `BACKUP_PASSPHRASE` se kopija ne može pročitati. Lozinku treba čuvati izvan servera.

### Redizajn gostujuće aplikacije

- **Animacije:** biblioteka `motion` (LazyMotion). Animacijski dio se učitava kao zaseban fajl nakon prvog prikaza, pa gostujući JavaScript ostaje oko 170 KB gzip (granica 200 KB, NFR-01). Telefoni s uključenim "smanji pokrete" dobijaju samo prelaze bez pomjeranja.
- **Meni:** pozdravna kartica s imenom lokala i stolom ("Dobro jutro", "Dobar dan" ili "Dobro veče", po dobu dana). Traka kategorija prati skrolanje, a aktivna kategorija ima animiranu oznaku. Kartice artikala ulaze s animacijom dok se skrola, a artikli bez slike dobijaju obojenu pločicu s početnim slovom. Na kartici artikla piše koliko ga je već u korpi.
- **Brže naručivanje:** artikal bez dodataka ide u korpu jednim dodirom na "+". Dodir na karticu otvara detalje. Pri dodavanju u korpu i pri slanju narudžbe iskaču zvjezdice, a telefon kratko zavibrira (gdje je podržano).
- **Paneli:** detalji artikla, korpa i sto se otvaraju odozdo i zatvaraju se povlačenjem prema dolje, tipkom Esc ili dodirom izvan panela. Odabir dodataka ima animirane kvačice, a stavke iz korpe se uklanjaju s animacijom.
- **Narudžbe:** svaka narudžba ima traku napretka (Poslano → Prihvaćeno → U pripremi → Spremno → Posluženo). Promjena statusa je animirana, a aktivni status ima pulsirajuću tačku. Spremna narudžba je istaknuta zelenim okvirom.
- **Navigacija:** donji tabovi s animiranom oznakom, brojačima koji "iskoče" i prelazom između ekrana. Traka korpe izlazi odozdo i pokazuje broj artikala i ukupnu cijenu.

### Nov izgled aplikacije za konobare

- **Okvir:** tamna gornja traka s inicijalima, imenom lokala i indikatorom veze ("uživo", odnosno "bez veze" kad realtime veza padne). Na telefonu je navigacija plutajuća traka pri dnu, s animiranom oznakom aktivne stranice. Na širokom ekranu je meni s lijeve strane, a sadržaj koristi cijelu širinu.
- **Stolovi:** sažetak na vrhu (čeka uslugu, traži račun, zauzet, slobodan). Pločice stolova imaju traku u boji statusa, broj gostiju, koliko je sto otvoren i jasno označene signale (nova narudžba, poziv, uređaj čeka, prijava). Stolovi kojima treba konobar blago pulsiraju, a slobodni su prikazani isprekidanim okvirom, da se zauzeti ističu.
- **Narudžbe:** animirani filter, kartice s bojom statusa na lijevom rubu, broj stola kao veliki tamni bedž (dodir vodi na sto) i vrijeme čekanja koje postaje narandžasto nakon 5 minuta i crveno nakon 10. Prihvaćene i završene narudžbe animirano izlaze iz liste. Na širokom ekranu su narudžbe u dvije kolone.

## Urađeno u verziji 0.6 (4. 10. 2026.)

U ovoj fazi je cilj bio pripremiti sistem za rast (hiljadu lokala i više) i za rad u lokalu kad internet zakaže. Dio izmjena je nastao iz testa opterećenja.

### Audit log i izvještaji za veliki broj lokala (NFR-25)

- **Problem:** audit log i činjenice prodaje (`reporting.order_item_facts`) rastu bez kraja. Kod 1000 lokala to je oko 0,5 do 1 milion redova audit loga dnevno, odnosno 100 do 250 GB godišnje. Admin stranica je pri svakom otvaranju prebrojavala cijeli log i čitala ga cijelog za padajuće filtere.
- **Podjela po mjesecima:** obje tabele su podijeljene na mjesečne particije (`audit_logs_2026_10` i slično). Upit za zadnje dane čita samo nove mjesece. Worker svake noći u 03:15 pravi particije za naredna 4 mjeseca, a rezervna (DEFAULT) particija hvata sve ostalo, pa upis nikad ne pada.
- **Admin stranica:** nema više brojeva stranica ni prebrojavanja. Zapisi se učitavaju dugmetom „Učitaj starije", koje uvijek čita samo jedan dio indeksa. Filteri (akcije, osobe, lokali) dolaze iz tri male tabele koje worker održava (`audit.actions`, `audit.actor_labels`, `audit.venue_labels`).
- **Arhiviranje:** mjeseci stariji od `AUDIT_RETENTION_MONTHS` (default 24, najmanje 12 zbog NFR-25) izvoze se šifrovani u `s3://<bucket>/audit/`. Particija se odvaja iz baze tek kad je provjereno da je kopija u S3 iste veličine. Redovi se nikad ne brišu pojedinačno, pa pravilo „samo upis" ostaje. Arhiviranje radi svaku noć u backup servisu, a ručno se pokreće s `make audit-archive`.
- **Testirano:** migracija i njeno vraćanje (podaci ostaju), idempotentan upis istog događaja, filteri, arhiviranje probnog mjeseca (šifrovan CSV u S3, particija uklonjena).

### Vraćanje baze na tačan trenutak (NFR-24)

- Postgres sada svaku promjenu (WAL) šalje u pgBackRest repozitorij, najkasnije svakih 60 sekundi (`PITR_ARCHIVE_TIMEOUT`). Novi servis `pitr` pravi pune backupe nedjeljom, a razlike ostalim danima u 03:00. Repozitorij je šifrovan (AES-256, `PITR_PASSPHRASE`).
- Najveći mogući gubitak podataka je tako oko 1 minute, umjesto do 24 sata (zahtjev je 15 minuta). Noćni `pg_dump` iz verzije 0.5 ostaje kao druga, prenosiva kopija.
- **Zašto pgBackRest, a ne WAL-G:** WAL-G se izdaje samo za glibc sisteme, a naša Postgres slika je Alpine. Prelazak na drugu sliku bi tražio ponovno građenje indeksa (drugačije sortiranje teksta). pgBackRest je u Alpine paketima.
- **Lokalno i na serveru:** lokalno je repozitorij Docker volume, a na serveru S3 (`PITR_REPO_TYPE=s3`, varijable `PITR_S3_*`). pgBackRest za S3 traži HTTPS, pa lokalni MinIO bez TLS-a nije opcija.
- **Komande:** `make pitr-info` prikazuje backupe i pokriveni period. `make pitr-backup type=full|diff` pravi backup odmah. `make pitr-restore-test at="2026-10-04 08:00:00+02"` vraća bazu na zadani trenutak u zaseban direktorij, pokrene je, ispiše broj zapisa i obriše je. Živa baza se pri tome ne dira.
- **Testirano:** probni lokal je obrisan iz žive baze, a kopija vraćena na trenutak prije brisanja ga je sadržavala.
- Ako arhiva nije dostupna, Postgres najviše 4 GB promjena čuva u redu čekanja (`PITR_QUEUE_MAX`), a onda ih odbacuje umjesto da napuni disk. Sljedeći backup tada počinje novi lanac.

### Test opterećenja i šta je on otkrio (NFR-02, NFR-03, NFR-13)

- **Alat:** k6 iz Docker slike, bez instalacije u projekat.
  - `make loadtest-seed` pravi testne lokale `lt-001`, `lt-002`… sa stolovima, menijem i šefom.
  - `make loadtest` pokreće test: svaki „telefon" je domaćin za jednim stolom i naručuje svakih 10 do 30 sekundi, a jedan „konobar" po lokalu prima narudžbe.
  - `make loadtest-clean` sve briše.
  - Veličina se zadaje s `LT_VENUES`, `LT_TABLES` i `LT_DURATION`.
- **Rezultati na laptopu** (sve servise u Dockeru, jedan API proces):

  | Opterećenje | API p95 | konobar vidi narudžbu (p95) | greške |
  | --- | --- | --- | --- |
  | 20 lokala, 200 telefona, ~7,6 narudžbi/s | 17 ms | 0,98 s | 0 % |
  | 100 lokala, 2000 telefona, ~70 narudžbi/s, prije ispravke | 1,56 s | 4,8 s | 0 % |
  | isto, poslije ispravke RLS-a | 0,43 s | 1,37 s | 0 % |
  | isto, 3 API procesa | 0,80 s | 2,53 s | 0 % |

  NFR-13 traži 20.000 narudžbi dnevno za 100 lokala. Prvi red već nosi oko 27.000 narudžbi na sat.

  Tri API procesa su na laptopu bila sporija od jednog. Docker ima 8 jezgara, a dijele ih Postgres (oko 2,6 jezgre), k6 s 2100 virtuelnih korisnika, Traefik, nadzor i API procesi. Dodatni procesi se zato bore za iste jezgre i bazu. Korist od više procesa treba izmjeriti na pravom serveru, gdje baza i API nisu na istom procesoru. Preporuka za produkciju je početi s jednim procesom i povećavati ga prema ekranu „Nadzor sistema".
- **Glavni nalaz (RLS bez indeksa):** pravilo izolacije lokala bilo je `venue_id = lokal OR super_admin`. Zbog tog „OR" Postgres nije mogao koristiti nijedan indeks, pa je svaki upit čitao redove svih lokala.
  - **Ispravka:** pravila su sada samo `venue_id = lokal`, pa ih indeksi služe. Rad na nivou platforme (admin ekrani, poslovi workera) ide kroz posebnu ulogu `svc_<modul>_platform` (BYPASSRLS, ista prava kao modul). Na nju se prelazi samo u kontekstu super admina.
  - **Sigurnost:** granica ostaje ista kao prije. Novi testovi provjeravaju da upit lokala koristi indeks, da sama postavka super admina više ništa ne otvara i da modul ne može preći na tuđu platform ulogu.
- **Indeksi po lokalu:** dodani na tabele koje se čitaju po lokalu, a nisu ih imale (otvoreni stolovi, katalog, push pretplate…). Traženje otvorenih stolova pada s 1,2 ms na 0,09 ms.
- **Više API procesa:** jedan Node proces koristi jedno jezgro, pa je opterećenje od 70 narudžbi/s na granici. `API_REPLICAS` pokreće više procesa iza Traefika; stanje je u Postgresu i Redisu. Sticky cookie (`qafe_lb`) drži zamjensku vezu za realtime na istom procesu. `DB_POOL_MAX` i `POSTGRES_MAX_CONNECTIONS` (300) drže broj konekcija pod kontrolom.
- **Usput popravljeno:**
  - Redis je mogao izbaciti ključeve reda poslova kad mu nestane memorije. Sada izbacuje samo ključeve s rokom trajanja (`volatile-lru`).
  - Worker svakih 10 minuta ponovo prijavljuje zakazane poslove, jer ih restart Redisa briše.
  - Uključene su statistike upita (`pg_stat_statements`) za traženje sporih upita.

### Staff aplikacija bez interneta (NFR-05)

- **Zadnje stanje:** stolovi, narudžbe, otvoreni stolovi, meni i KDS se čuvaju na uređaju. Bez veze se prikazuju s trakom „Nema veze s internetom. Prikazano stanje od 14:32." Kopija starija od 12 sati se ne prikazuje, a odjava je briše.
- **Red akcija:** bez veze se čuvaju i odmah prikazuju na ekranu akcije na jedan dodir: prihvati, posluži, zahtjev primljen/riješen, KDS spremno/poništi/počni i dostupnost artikla. Šalju se redom čim se veza vrati: na događaj „online", svake 3 sekunde dok nešto čeka i poslije svakog uspješnog zahtjeva. Tako je cilj od 5 sekundi ispunjen.
  - Zahtjev koji visi (Wi-Fi bez interneta) se prekida poslije 8 sekundi i ide u red.
  - Ako server akciju kasnije odbije jer se stanje u međuvremenu promijenilo, konobar dobije poruku koja je akcija u pitanju.
- **Šta i dalje traži vezu:** naplata, otkazivanje, izmjene narudžbe, ručna narudžba i odobravanje uređaja. Ovisne su o tačnom trenutnom stanju ili o novcu.
- **Ponovno otvaranje bez interneta:** service worker čuva aplikaciju. Prijava ostaje kad osvježavanje sesije padne zbog mreže (ne zbog isteka): zadnji profil se pamti, a sesija se osvježi čim server odgovori.
- **Testirano u browseru:** narudžba prihvaćena bez veze poslana je i upisana na serveru (`accepted_by` = konobar) nekoliko sekundi nakon povratka veze. Ponovno otvaranje bez interneta prikazuje zadnje stanje.

### Prijava PIN-om na zajedničkom uređaju (FR-KON-01)

- **Povezivanje:** šef se na tabletu prijavi lozinkom i u aplikaciji za osoblje otvori „Ovaj uređaj" (ikona u gornjoj traci), upiše naziv (npr. „Tablet šank") i poveže uređaj. Uređaj dobije dugi nasumični token u httpOnly cookie-ju (`qafe_sdev`), a u bazi (`core.staff_devices`) je samo njegov hash.
- **Prijava:** na povezanom uređaju ekran za prijavu prikazuje imena osoblja koje ima PIN. Dodir na ime i PIN na velikoj tastaturi prijavljuju člana. Prijava lozinkom ostaje dostupna jednim dodirom. Prijava PIN-om ne traži promjenu privremene lozinke, jer lozinka nije korištena.
- **Zaštita:**
  - Bez cookie-ja uređaja PIN ne vrijedi ništa.
  - Pokušaji su ograničeni po uređaju i osobi (5 u 15 minuta) i po uređaju (20).
  - Sesija na zajedničkom uređaju se sama zaključava poslije 5 minuta bez dodira.
  - Prijava ide u audit log s oznakom PIN-a i naziva uređaja.
- **Upravljanje:** šef u panelu (Osoblje → Uređaji za prijavu PIN-om) vidi povezane uređaje i zadnju prijavu, i može ih ukloniti. Uklonjen uređaj više ne prikazuje imena niti prijavljuje. Povezivanje i uklanjanje idu u audit log.

### Ekran nadzora u admin panelu (FR-ADM-17, FR-ADM-18)

- Stranica „Nadzor sistema" u admin panelu prikazuje sljedeće:
  - servise (API, worker, Traefik, OTel collector, Prometheus): radi/ne javlja se, verzija, broj instanci, vrijeme rada, CPU i memorija;
  - po modulu: zahtjeve u sekundi, p50, p95 i p99, te postotak grešaka 5xx;
  - najsporije rute po p95;
  - broj outbox događaja u minuti.
- Periodi su 1 h, 24 h i 7 dana, a stranica se osvježava svakih 30 sekundi. Vrijednosti iznad 300 ms (NFR-03) i više od 1 % grešaka su crvene. Link vodi u Grafanu za detalje i logove.
- Podaci dolaze samo iz Prometheusa (`PROMETHEUS_URL`), nikad iz samih servisa, pa ekran radi i kad neki servis padne (NFR-22). Bez Prometheusa stranica to jasno kaže.
- Metrike sada nose verziju aplikacije i ID instance, pa se procesi ne miješaju kad ih ima više.
- Alarmi (FR-ADM-21) i tragovi zahtjeva (FR-ADM-20) i dalje nisu urađeni.

### Aplikacija za goste kao PWA

- **Instalacija:** manifest s ikonom omogućava dodavanje na početni ekran telefona.
- **Spora veza:** service worker čuva aplikaciju i zadnji meni lokala, pa se meni otvara brže i na slabom signalu.
- **Šta se ne čuva:** sesija stola i narudžbe se nikad ne uzimaju iz kopije, jer bi zastarjelo stanje zavaralo. Naručivanje i dalje traži vezu.
- Veličina JavaScripta je 170 KB gzip (granica 200 KB).

## Urađeno u verziji 0.7 (5. 10. 2026.)

### Teme platforme (FR-ADM-22)

- **Šta je:** admin u novoj stranici „Postavke" bira temu za cijelu platformu. Admin, panel lokala, aplikacija za osoblje i početna stranica (qafe.ba) svima prelaze na nju. Postoje dvije teme:
  - **Topla:** tamno zelena `#004643`, bež `#F0EDE5` i menta `#8FD1C4`, iste boje kao na početnoj stranici.
  - **Ledena:** ljetna, glečer plava `#082C47`, ledeno plava `#0A6FA1` i inje `#5FD0F3`.
- **Prebacivanje:** dugme „Prebaci na: …" ili klik na karticu teme s pregledom.
- **Svijetla i tamna varijanta:** svaka tema ima obje, a varijanta ostaje lični izbor svakog korisnika (dugme za temu u gornjoj traci). Svi parovi teksta i pozadine su provjereni za WCAG AA (glavni tekst 11 do 17:1, sporedni najmanje 4,5:1).
- **Početna stranica:** ima svoje tokene boja (tamne i svijetle sekcije), pa je ledena tema za nju poseban skup istih tokena (`apps/web/src/index.css`), takođe provjeren za WCAG AA. Mijenja se i boja trake browsera. Da bi početna stranica na `qafe.ba` (bez poddomene) mogla pitati API za temu, Traefik sada `/api` šalje API-ju i s glavne domene.
- **Gosti:** meni za goste zadržava svoj izgled. Izbor izgleda menija za šefa dolazi kasnije.

**Kako je napravljeno, da promjena ne može srušiti stranicu:**
- Tema je samo skup CSS varijabli na `<html data-brand="…">`. Komponente koriste semantička imena boja (`bg-primary`, `bg-navy-900`…), pa promjena ne mijenja raspored niti traži ponovno učitavanje. Boje se pri promjeni pretapaju 0,35 s, osim kad je na uređaju uključeno „smanji pokrete".
- **Prije prvog prikaza:** stranica već u HTML-u ima toplu temu, a aplikacija odmah primijeni zadnju poznatu temu iz uređaja.
- **Provjera na serveru:** tema se pita na serveru u pozadini (`GET /api/platform/theme`, javno, jer je koriste i stranice za prijavu), s ograničenjem od 4 s. To se ponavlja kad se prozor vrati u fokus i svakih 5 minuta.
- **Kad nešto ne štima:** ako server ne odgovori ili vrati nepoznatu vrijednost, stranica zadržava boje koje već ima. Ako je vrijednost u bazi oštećena, server vraća zadanu (toplu) temu. Admin vidi promjenu odmah, a ako je server odbije, vraća se prethodna.
- Promjena teme ide u audit log.
- **Nova tema:** dodaje se jednim blokom varijabli u `@qafe/ui/theme.css` i imenom u `THEME_BRANDS` (`@qafe/contracts`). Provjera tipova javlja grešku ako se ta dva popisa razilaze.
- **Zamijenjene fiksne boje:** talasi na stranici za prijavu, kartice na pregledu i grafikoni u izvještajima. QR kodovi i štampane kartice za stolove namjerno ostaju u svojim bojama, jer su za goste.

### Uređivanje menija lokala iz admina (FR-ADM-07), zadnja MVP stavka

- Na stranici lokala u adminu je dugme „Uredi meni". Ono otvara isti uređivač menija kao u panelu lokala: kategorije, artikli, cijene, slike, grupe dodataka, redoslijed povlačenjem i dostupnost.
- Svaka izmjena ide kroz admin API lokala (`/admin/venues/:id/catalog/*`), radi u kontekstu tog lokala i upisuje se u audit log, sa adminom kao izvršiocem. Stanice pripreme (KDS) i dalje dodjeljuje šef.
- Uređivač je premješten u zajednički paket `@qafe/menu-editor`, pa panel i admin koriste isti kod i iste tekstove. Svaka buduća izmjena menija (prevodi, template menija) radi se jednom. Komponenta za učitavanje slike je u `@qafe/ui`.
- Provjereno u browseru: admin je dodao artikal i promijenio mu dostupnost, šef ga odmah vidi u panelu, a audit log bilježi admina.

Time su sve MVP stavke urađene.

### SMTP postavke (FR-ADM-23)

- **Postavke:** u „Postavkama" admin unosi SMTP server, port, zaštitu veze (STARTTLS, TLS ili bez), korisničko ime, lozinku, ime i email pošiljaoca.
- **Lozinka:** čuva se šifrovana (AES-256-GCM, poseban ključ `SETTINGS_ENCRYPTION_KEY`) i nikad se ne vraća u odgovoru niti upisuje u audit log. Prazno polje znači da lozinka ostaje ista, a postoji i opcija „Ukloni sačuvanu lozinku".
- **Testni email:** dugme „Pošalji testni email" šalje kratku poruku sa sačuvanim postavkama. Ako server odbije, admin vidi razlog. Veza ima ograničenje od 10 do 15 sekundi, pa pogrešan server ne zadržava stranicu.
- **Provjereno:** testni email je stigao na lokalni testni mail server (Mailpit).
- **Biblioteka:** nodemailer, odobren za ovu fazu.
- **Šta još nije urađeno:** slanje emailova iz same aplikacije (npr. reset lozinke, obavijesti). Postavke i slanje su spremni za to.


## V2, prva grupa (5. 10. 2026.)

Online plaćanje (FR-GOS-17) je namjerno izostavljeno.

### Djelimična naplata (FR-KON-20)

- Na stolu konobar bira „Naplati stavke“, označi koliko komada kojih stavki jedan gost plaća i naplati gotovinom ili karticom. Sto ostaje otvoren dok se sve ne plati.
- Račun (konobaru i gostu) pokazuje ukupno, „Već plaćeno“ i „Preostalo“. Naplata cijelog stola naplaćuje samo ostatak. Ako su naplaćene stavke posljednje, sto se zatvara.
- Svako plaćanje pamti koje stavke pokriva (`billing.payment_items`), pa izvještaji knjiže svaku stavku na način na koji je stvarno plaćena.
- Sto koji je djelimično plaćen ne može se premjestiti niti spojiti (`partially_paid`).

### Premještanje narudžbe i stolova, spajanje stolova (FR-KON-14)

- **Narudžba:** „Premjesti na sto“ seli jednu narudžbu na drugi sto i njegov račun. Na slobodnom stolu otvara se nova sesija.
- **Sto:** „Premjesti / spoji sto“. Na slobodan sto gosti prelaze sa svim narudžbama i zahtjevima. Na zauzet sto se stolovi spajaju: sve prelazi na taj sto, gosti s uređajima nastavljaju tamo, a stari sto se zatvara (`merged_into_session_id`).
- Sve se upisuje u audit log.

### Pretraga menija za goste (FR-GOS-05)

- Polje za pretragu iznad menija. Traži po nazivu, opisu i kategoriji, bez obzira na kvačice („cevapi“ nalazi „Ćevapi“).

### Moj dan (FR-KON-23)

- Nova stranica „Moj dan“ u aplikaciji za osoblje: naplaćeni iznos, broj narudžbi i artikala, podjela po načinu plaćanja i pet najčešće naručenih artikala, za današnji poslovni dan ili za ranije dane (strelice).
- Računa se ono što je naplaćeno na stolovima čije je narudžbe taj član osoblja prihvatio. Podaci su isti kao u izvještajima. Svaki član vidi samo svoje i za to mu ne treba pravo na izvještaje (`GET /reports/me`).

### Provjereno

- Integracioni testovi `table-v2` (djelimična naplata, premještanje, spajanje) i „Moj dan“ u `reports`.
- Browser (telefon): naplata jedne stavke, pa ostatka, premještanje stola, „Moj dan“ i pretraga menija.

## Odgođene stavke

Zahtjevi iz MVP-a koji su svjesno pomjereni za kasnije. Prije puštanja u produkciju se vraćaju na listu.

Trenutno nema odgođenih MVP stavki. Posljednje tri (vraćanje baze na tačan trenutak, ekran nadzora i prijava PIN-om) urađene su u verziji 0.6.
