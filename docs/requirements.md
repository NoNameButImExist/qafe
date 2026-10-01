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
| FR-ADM-01 | Prijava | Prijava emailom i lozinkom, uz obaveznu dvofaktorsku autentifikaciju (TOTP). TOTP je odgođen (vidi Odgođene stavke). | MVP |
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
| FR-SEF-01 | Prijava | Prijava korisničkim imenom i privremenom lozinkom koju dodijeli administrator. Promjena lozinke je obavezna pri prvoj prijavi. Obavezna promjena je odgođena (vidi Odgođene stavke). | MVP |
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

Identifikacija uređaja preko cookie-ja se može zaobići novim incognito prozorom, pa je potvrda konobara glavna zaštita. Geolokacija se ne koristi, jer u zatvorenom prostoru nije dovoljno precizna da razlikuje susjedne stolove.

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

## Odgođene stavke

Zahtjevi iz MVP-a koji su svjesno pomjereni za kasnije. Prije puštanja u produkciju se vraćaju na listu.

| Zahtjev | Šta je odgođeno | Trenutno stanje | Odluka |
| --- | --- | --- | --- |
| FR-ADM-01 | Dvofaktorska prijava (TOTP) za administratore | Prijava samo emailom i lozinkom. Kolone `mfa_enabled` i `mfa_secret_enc` postoje. Postavka `ADMIN_MFA_REQUIRED=true` odbija prijavu dok TOTP ne bude urađen. | 30. 9. 2026. |
| FR-SEF-01, FR-ADM-03, FR-ADM-09 | Obavezna promjena privremene lozinke pri prvoj prijavi osoblja | Privremena lozinka radi kao obična. Oznaka `must_change_password` se i dalje postavlja pri kreiranju naloga i resetu, pa se obaveza može uključiti bez migracije. | 30. 9. 2026. |
