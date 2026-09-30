# qafe.ba – početni prompt za Claude Code

> Prije pokretanja stavi u prazan repozitorij:
> - `docs/requirements.md` (izvoz dokumenta "qafe.ba – Specifikacija zahtjeva" u Markdown)
> - `docs/db/qafe_schema_v2.sql`
> - `docs/db/qafe_erd_v2.mermaid`
>
> Zatim kopiraj sve ispod linije u Claude Code.

---

Pokrećemo projekat **qafe.ba**: multi-tenant platformu za naručivanje preko QR koda na stolu u kafićima. Tvoj zadatak u ovoj sesiji je **postavljanje temelja projekta (scaffold)**, ne implementacija funkcionalnosti.

## 0. Prvo pročitaj

1. `docs/requirements.md`: funkcionalni zahtjevi (FR-ADM, FR-SEF, FR-KON, FR-GOS) i nefunkcionalni (NFR).
2. `docs/db/qafe_schema_v2.sql`: šema baze. Ovo je izvor istine za bazu. Ne mijenjaj je bez pitanja.
3. `docs/db/qafe_erd_v2.mermaid`: veze između tabela i servisa.

Nakon čitanja napiši mi kratak plan (koraci, šta ćeš kreirati) i sačekaj moju potvrdu prije nego što počneš.

## 1. Pravila rada

- Radi u malim koracima. Nakon svakog koraka pokreni provjere (install, typecheck, lint, test) i napravi commit.
- Commit poruke po **Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:`...).
- Kod, nazivi, komentari i commit poruke su na **engleskom**. Tekst u UI-ju ide kroz i18n (`bs` i `en`).
- Prije svake veće odluke koja nije navedena ovdje (nova biblioteka, promjena strukture, promjena šeme) **pitaj me**.
- Nikad ne commitaj tajne. Svaka tajna ide u `.env`, a u repo ide samo `.env.example` sa praznim ili lažnim vrijednostima.
- Na kraju kreiraj `CLAUDE.md` u korijenu, sa konvencijama iz ovog prompta, komandama i strukturom projekta, da ga budući rad prati.

## 2. Tehnologije

| Oblast | Izbor |
|---|---|
| Runtime | Node.js 24 LTS (`.nvmrc`), TypeScript strict |
| Monorepo | pnpm workspaces + Turborepo |
| Backend servisi | NestJS (Fastify adapter) |
| Baza | PostgreSQL 16, jedna šema po servisu, Row Level Security |
| Pristup bazi | Kysely + `kysely-codegen` (tipovi generisani iz baze) |
| Migracije | Čisti SQL fajlovi (dbmate); prva migracija = `qafe_schema_v2.sql` |
| Događaji između servisa | NATS JetStream + transactional outbox (tabele `*.outbox`) |
| Keš, rate limit, realtime | Redis 7 (`ioredis`) |
| Pozadinski poslovi | BullMQ (preko Redisa) |
| Realtime prema klijentima | Socket.IO u gateway servisu, sa Redis adapterom |
| Validacija i ugovori | Zod (zajednički paket za API i događaje) |
| Frontend | React + Vite + TypeScript, TanStack Router i TanStack Query, Tailwind CSS, shadcn/ui |
| PWA | `vite-plugin-pwa` (guest i staff), Web Push (VAPID) |
| Slike menija | S3-kompatibilno skladište, lokalno MinIO |
| Nadzor | OpenTelemetry SDK u svakom servisu, OTel Collector, Prometheus, Grafana, Jaeger |
| Testovi | Vitest, Supertest, Testcontainers (Postgres), Playwright za e2e |
| Kvalitet koda | ESLint + Prettier, Husky + lint-staged, commitlint |
| CI | GitHub Actions |
| Kontejneri | Docker, Docker Compose (sa profilima) |
| Reverse proxy | Traefik v3 (subdomeni, TLS u produkciji) |

Mobilna aplikacija za sada **nije nativna**. Staff je PWA. Ako kasnije zatreba, pakovaćemo je kroz Capacitor, pa ne dodaji ništa nativno.

## 3. Struktura repozitorija

```
qafe/
├── apps/
│   ├── guest/            # gost: meni, korpa, narudžba (PWA, mora biti lagan)
│   ├── staff/            # konobar PWA + KDS ruta (/kds)
│   ├── panel/            # šef lokala (desktop + responsive)
│   └── admin/            # administrator platforme + nadzor servisa
├── services/
│   ├── gateway/          # auth, rutiranje, tenant iz subdomena, Socket.IO
│   ├── core/             # lokali, moduli, osoblje, uloge, prostor, QR
│   ├── catalog/          # meni
│   ├── ordering/         # sesije stolova, zaštita sesije, narudžbe
│   ├── billing/          # plaćanja
│   ├── audit/            # audit log (sluša događaje)
│   └── reporting/        # izvještaji i izvoz CSV/Excel/PDF
├── packages/
│   ├── contracts/        # Zod šeme: API DTO-ovi i događaji (event types)
│   ├── db/               # migracije, generisani Kysely tipovi, helper za RLS
│   ├── auth/             # JWT, provjera ovlasti (can('orders.cancel'))
│   ├── observability/    # zajednički OpenTelemetry setup
│   ├── redis/            # Redis klijent, prefiksi ključeva, BullMQ redovi
│   ├── ui/               # zajedničke React komponente
│   └── config/           # zajednički tsconfig, eslint, prettier
├── infra/
│   ├── docker/           # service.Dockerfile, web.Dockerfile, nginx.conf
│   ├── postgres/init/    # kreiranje svc_* rola sa lozinkama
│   ├── redis/            # redis.conf
│   ├── traefik/          # statička i dinamička konfiguracija
│   ├── otel/             # konfiguracija OTel Collectora
│   ├── prometheus/       # prometheus.yml
│   └── grafana/          # datasource-i i osnovni dashboard
├── docs/
├── docker-compose.yml
├── docker-compose.override.yml
├── docker-compose.prod.yml
├── Makefile
├── turbo.json
├── pnpm-workspace.yaml
└── CLAUDE.md
```

Portovi lokalno: gateway 3000, core 3001, catalog 3002, ordering 3003, billing 3004, audit 3005, reporting 3006. Frontend: guest 5173, staff 5174, panel 5175, admin 5176.

## 4. Obavezne arhitekturne odluke

1. **Tenant i RLS.** Gateway određuje lokal iz subdomena (`fildzan.qafe.ba`) ili tokena i prosljeđuje `venue_id` servisima. Svaki servis na početku svake transakcije radi `SET LOCAL app.venue_id = ...` i `SET LOCAL app.is_super_admin = ...`. Napravi to kao helper u `packages/db`, tako da nijedan upit ne može proći bez tog konteksta.
2. **DB role po servisu.** Svaki servis se spaja kao svoj role (`svc_core`, `svc_ordering`...), nikad kao `postgres`. Migracije pokreće zaseban admin role.
3. **FK samo unutar šeme.** Servis ne čita tuđu šemu. Podatke drugog servisa dobija preko API-ja ili događaja, a čuva snapshot.
4. **Outbox.** Promjena stanja i upis događaja u `outbox` idu u istoj transakciji. Zaseban relay objavljuje događaje na NATS.
5. **Autentifikacija.**
   - Admin: email, lozinka i TOTP.
   - Osoblje: slug lokala, korisničko ime i lozinka, ili PIN.
   - Access token traje 15 minuta, refresh token se rotira, lozinke su argon2id.
   - Gost nema nalog. Dobija potpisan token sesije stola u httpOnly cookie-ju, uz `device_hash`.
6. **Idempotentnost.** Kreiranje narudžbe zahtijeva `Idempotency-Key` header (NFR-06).
7. **Health i nadzor.** Svaki servis ima `/health/live` i `/health/ready` i izvozi metrike i tragove preko OpenTelemetryja, asinhrono (NFR-21). Admin ekran za nadzor čita iz Prometheusa, nikad direktno iz servisa.
8. **Rate limit** za goste ide u Redis (FR-GOS-27), ne u bazu.

## 5. Obavezni fajlovi u korijenu

### `.gitignore`

Mora pokriti najmanje:

```gitignore
# zavisnosti
node_modules/
.pnpm-store/

# build i keš
dist/
build/
out/
.turbo/
.vite/
dev-dist/
*.tsbuildinfo
.cache/

# testovi
coverage/
playwright-report/
test-results/
blob-report/

# okruženje i tajne
.env
.env.*
!.env.example
*.pem
*.key
*.p12
secrets/

# logovi
*.log
npm-debug.log*
pnpm-debug.log*

# lokalni podaci docker servisa
.data/
pgdata/
minio-data/

# OS i editori
.DS_Store
Thumbs.db
.idea/
.vscode/*
!.vscode/extensions.json
!.vscode/settings.json

# generisano
packages/db/src/generated/

# Capacitor (kasnije)
android/app/build/
ios/App/Pods/
```

### Ostali fajlovi

- `.dockerignore`: `node_modules`, `.git`, `.env*`, `dist`, `coverage`, `.turbo`.
- `.gitattributes`: `* text=auto eol=lf`.
- `.editorconfig`: UTF-8, LF, 2 razmaka.
- `.nvmrc`: `24`.
- `.env.example`: sve varijable koje servisi koriste, sa komentarom za svaku (DB URL i lozinka po servisu, Redis lozinka, NATS, JWT tajne, VAPID ključevi, S3/MinIO, OTel endpoint, domen i portovi).
- `README.md`: kako pokrenuti projekat lokalno u 5 koraka ili manje.

## 6. Docker

Cijeli sistem mora moći raditi u Dockeru, i infrastruktura i aplikacije. Za svakodnevni razvoj biramo: sve u Dockeru, ili infrastruktura u Dockeru i aplikacije kroz `pnpm dev`.

### 6.1 Compose fajlovi

| Fajl | Namjena |
|---|---|
| `docker-compose.yml` | Osnova: svi servisi, mreže, volume-i, healthcheckovi |
| `docker-compose.override.yml` | Razvoj: bind mount koda, hot reload, otvoreni portovi (Compose ga učitava automatski) |
| `docker-compose.prod.yml` | Produkcija: bez bind mountova, bez dev alata, ograničenja resursa, `restart: unless-stopped` |

Koristi **profile** da se ne mora uvijek dizati sve:

- `infra`: postgres, redis, nats, minio
- `observability`: otel-collector, prometheus, grafana, jaeger
- `apps`: gateway, svi servisi, sve četiri frontend aplikacije
- `tools`: redis-insight, pgadmin (samo za razvoj)

### 6.2 Kontejneri

| Kontejner | Image | Napomena |
|---|---|---|
| `postgres` | `postgres:16-alpine` | Init skripta u `infra/postgres/init/` kreira `svc_*` role sa lozinkama iz `.env` |
| `db-migrate` | vlastiti | Jednokratno pokreće migracije; ostali servisi čekaju da uspješno završi |
| `redis` | `redis:7-alpine` | Konfiguracija u `infra/redis/redis.conf` (sekcija 7) |
| `nats` | `nats:2-alpine` | JetStream uključen, podaci u volume-u |
| `minio` | `minio/minio` | Plus jednokratni `minio-init` koji kreira bucket `menu-images` |
| `traefik` | `traefik:v3` | Reverse proxy i rutiranje po subdomenima |
| `otel-collector`, `prometheus`, `grafana`, `jaeger` | službeni | Grafana dobija gotov datasource za Prometheus i Jaeger |
| `gateway`, `core`, `catalog`, `ordering`, `billing`, `audit`, `reporting` | vlastiti | Iz `infra/docker/service.Dockerfile` |
| `guest`, `staff`, `panel`, `admin` | vlastiti | Dev: Vite server; prod: statički build iza nginx-a |

### 6.3 Rutiranje (Traefik)

Lokalno koristimo `*.qafe.localhost`, jer browseri to automatski usmjeravaju na 127.0.0.1, bez izmjene `hosts` fajla:

- `admin.qafe.localhost` vodi na admin aplikaciju
- `panel.qafe.localhost` vodi na panel šefa
- `staff.qafe.localhost` vodi na staff PWA
- `{slug}.qafe.localhost` vodi na guest aplikaciju tog lokala
- `api.qafe.localhost` vodi na gateway (REST i WebSocket)

Traefik dashboard je dostupan samo u dev profilu. U produkciji Traefik izdaje TLS certifikate preko Let's Encrypta, uz wildcard za `*.qafe.ba` (DNS challenge).

### 6.4 Pravila za Dockerfile

- Jedan zajednički multi-stage `service.Dockerfile` za backend servise, sa argumentom `SERVICE`. Isto tako `web.Dockerfile` za frontend aplikacije.
- Koristi `turbo prune --docker` da image sadrži samo paket i njegove zavisnosti.
- Faze: `deps`, `build`, `runtime`. Runtime je `node:24-alpine`, bez dev zavisnosti.
- Kontejner radi kao **non-root** korisnik.
- `HEALTHCHECK` gađa `/health/live`.
- pnpm store keš preko `--mount=type=cache`, da build bude brz.

### 6.5 Pravila za compose

- Svaki infra servis ima `healthcheck`. Aplikacije koriste `depends_on` sa `condition: service_healthy`, a čekaju `db-migrate` sa `condition: service_completed_successfully`.
- Dvije mreže: `internal` (baza, redis, nats; bez izlaza prema hostu u produkciji) i `edge` (traefik i ono što je javno).
- Imenovani volume-i: `pgdata`, `redisdata`, `natsdata`, `miniodata`, `grafanadata`.
- Logovi: `json-file` driver sa rotacijom (`max-size: 10m`, `max-file: 3`).
- Sve lozinke i portovi dolaze iz `.env`. U compose fajlu nema hardkodiranih tajni.
- U produkciji baza, Redis i NATS nemaju portove otvorene prema hostu.

### 6.6 Komande

U root `package.json` dodaj skripte, i iste kao `Makefile` ciljeve:

```
pnpm docker:infra      # docker compose --profile infra --profile observability up -d
pnpm docker:up         # sve, uključujući aplikacije
pnpm docker:down       # zaustavi
pnpm docker:reset      # zaustavi i obriši volume-e (uz potvrdu)
pnpm docker:logs       # logovi svih ili jednog servisa
pnpm docker:build      # build svih image-a
```

## 7. Redis

Redis je zajednički za sve servise, ali svaki servis koristi **svoj prefiks ključeva**: `qafe:{servis}:...`, npr. `qafe:ordering:ratelimit:...`. Servisi ne čitaju tuđe ključeve.

### 7.1 Za šta se koristi

| Upotreba | Servis | Detalj |
|---|---|---|
| Rate limit gostiju | gateway, ordering | FR-GOS-27; sliding window po sesiji i uređaju |
| Socket.IO adapter | gateway | Realtime radi i sa više instanci gatewaya |
| Keš javnog menija | catalog | Brisanje na događaj `item.*`; TTL 5 min kao osigurač |
| Idempotency ključevi | ordering | NFR-06; TTL 24 h |
| Opozvani refresh tokeni | gateway | Denylist do isteka tokena |
| Prisutnost osoblja | gateway | Ko je online, za slanje push-a samo kad konobar nije spojen |
| Pozadinski poslovi (BullMQ) | reporting, core, gateway | Izvoz izvještaja u CSV/Excel/PDF, PDF sa QR kodovima, slanje push notifikacija |

Redis **nije** izvor istine ni za šta. Sve što se ne smije izgubiti ide u Postgres ili NATS.

### 7.2 Konfiguracija (`infra/redis/redis.conf`)

- `requirepass` iz `.env`, preko ACL korisnika po servisu ako je jednostavno izvesti.
- `appendonly yes`, da BullMQ poslovi prežive restart.
- `maxmemory-policy noeviction`. Ovo BullMQ zahtijeva. Keš zato uvijek ima TTL.
- `maxmemory` postavljen, npr. 256 MB lokalno.
- Isključene opasne komande (`FLUSHALL`, `FLUSHDB`, `CONFIG`) u produkciji, preko `rename-command`.

### 7.3 Kod

- Zajednički paket `packages/redis` sa klijentom (`ioredis`), helperom za prefikse i BullMQ fabrikom redova.
- Svaki red poslova ima dead-letter red i limit ponavljanja.
- Health `ready` provjera uključuje Redis ping.

## 8. CI (GitHub Actions)

Na svaki PR se pokreću: `pnpm install --frozen-lockfile`, lint, typecheck, unit testovi, build. Uz to ide integracioni test sa Testcontainers koji primijeni migracije i provjeri **izolaciju lokala preko RLS-a** (NFR-09): lokal A ne smije vidjeti narudžbe lokala B.

## 9. Šta ova sesija treba isporučiti

1. Monorepo sa svim folderima iz sekcije 3, gdje svaki paket i aplikacija ima minimalan kod koji se builda.
2. Root fajlove iz sekcije 5.
3. Sva tri compose fajla, Dockerfile-ovi i infra konfiguracija iz sekcije 6. Svi kontejneri se dižu i healthcheckovi su zeleni.
4. `packages/db` sa migracijom iz `qafe_schema_v2.sql`, komandama `db:migrate`, `db:reset` i `db:codegen`, i RLS helperom.
5. Svaki servis sa health endpointima, OpenTelemetry setupom i konekcijom na bazu kroz svoj role.
6. Gateway koji prosljeđuje jedan testni zahtjev do `core` servisa (`GET /venues/:slug/public`).
7. Četiri frontend aplikacije sa praznom početnom stranicom, Tailwindom i i18n-om (`bs`, `en`). Guest i staff su PWA.
8. `packages/contracts` sa primjerom jedne Zod šeme za API i jednog događaja (`order.created`).
9. Seed skripta: jedan lokal ("Demo kafić"), šef, konobar, dva stola i mali meni.
10. CI workflow iz sekcije 8, uključujući RLS test i build Docker image-a.
11. `packages/redis` iz sekcije 7, sa jednim testnim BullMQ poslom koji se izvrši.
12. `CLAUDE.md` i `README.md`.

Kriterij da je sesija gotova:

- `pnpm install`, `pnpm docker:infra`, `pnpm db:migrate`, `pnpm db:seed` i `pnpm dev` prolaze bez grešaka.
- `pnpm docker:up` diže cijeli sistem u Dockeru, a `api.qafe.localhost/health/ready` i `demo-kafic.qafe.localhost` odgovaraju.
- `pnpm test` je zelen.

**Ne implementiraj** još narudžbe, meni, plaćanje ni UI ekrane. To radimo u sljedećim sesijama, po zahtjevima iz `docs/requirements.md`.
