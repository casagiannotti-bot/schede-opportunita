# Opportunity Desk

Sostituto di Trello per le opportunità commerciali: schede con stato (Prospect → Progetto → Delivery → Fatto),
storico dei cambi di stato, attività Day by Day collegabili alle schede, ricerca, esportazione/importazione e
note vocali trasformate in bozze di scheda da Gemini.

Solo libreria standard di Python (SQLite + `http.server`): nessun `pip install`, né su HA né sul PC.

## Provarlo sul PC (anche aziendale, con Python 64 bit)

```
cd app
set APP_PASSWORD=una-password-di-almeno-8-caratteri        (Windows cmd)
$env:APP_PASSWORD="una-password-di-almeno-8-caratteri"     (PowerShell)
python schede.py
```

Poi apri http://localhost:8099. I dati stanno in `app/data/schede.db`; i backup giornalieri in `app/data/backup/`.
Per provare anche la voce aggiungi `GEMINI_API_KEY` (il microfono funziona su `localhost`; da rete serve HTTPS).

## Installarlo su Home Assistant OS

1. Installa l'add-on **Samba share** (o **File editor**/**SSH**) per accedere alla cartella `addons`.
2. Copia l'intera cartella `schede_opportunita` (con `config.yaml`, `Dockerfile` e `app/`) dentro la
   condivisione **addons**.
3. In HA: *Impostazioni → Add-on → Add-on store → ⋮ → Controlla aggiornamenti*. In fondo compare
   **Add-on locali → Opportunity Desk**: apri e premi **Installa**.
4. Scheda **Configurazione**: imposta `app_password` (min. 8 caratteri, diversa da quella di HA),
   `gemini_api_key` e, se vuoi, `gemini_model`. Salva.
5. Scheda **Info**: attiva **Avvia all'avvio** e **Watchdog**, poi **Avvia**.
6. Provalo in LAN: `http://IP-DI-HA:8099`.

I dati (`schede.db`, backup, chiave di sessione) stanno nella cartella `/data` dell'add-on, quindi
rientrano nei backup normali di Home Assistant.

## Pubblicarlo con Nginx Proxy Manager (HTTPS)

Crea un **Proxy Host** nuovo, separato da quello di HA:

- Domain: un sottodominio dedicato (es. `schede.tuodominio.duckdns.org`)
- Scheme `http`, Forward Hostname/IP = IP di HA, Forward Port = `8099`
- **SSL**: certificato Let's Encrypt, *Force SSL* attivo, *HTTP/2* attivo
- **Access List**: consigliata come seconda barriera (utente/password o IP dell'ufficio)
- Scheda **Advanced**, incolla (senza queste due righe le note vocali lunghe falliscono):

```
client_max_body_size 30m;
proxy_read_timeout 150s;
```

Nginx Proxy Manager passa già `X-Real-IP` e `X-Forwarded-Proto`, usati dall'app per il blocco dei
tentativi di accesso falliti e per marcare il cookie come `Secure`.

Non pubblicare la porta 8099 direttamente sul router: l'unico ingresso da internet deve essere il proxy.

## iPhone

Apri l'indirizzo HTTPS in Safari → Condividi → **Aggiungi alla schermata Home**. Si apre a schermo intero
come un'app. Il microfono funziona solo via HTTPS: al primo uso Safari chiede il permesso.

## Campi per stato

- **Prospect**: cliente, titolo, tipologia, referente, contatti, valore stimato, scadenza, note.
- **Progetto**: in più OP SDW (max 11 caratteri alfanumerici, sempre maiuscolo, accanto al cliente), team
  progettista/competence e le voci UT, CA e VENDITA al posto del valore stimato, che non viene riportato.
- **Delivery**: in più data collaudo (inserita a mano, parte vuota, al posto della scadenza) e nome post vendita.
- **Fatto**: esito **Vinta** o **Persa** (obbligatorio) e data chiusura. Trascinando una scheda in Fatto l'app chiede l'esito.

Cambiando stato nessun dato viene cancellato: i campi non pertinenti restano nel database, solo nascosti
(l'esito e la data chiusura si azzerano uscendo da Fatto). La ricerca copre anche OP SDW, team e post vendita.
Aggiornando da una versione precedente il database viene migrato da solo, dopo un backup automatico.

## JSON dell'agent (preventivi)

Dal menu ⋯ scegli **Incolla JSON dell'agent…**, incolla la risposta dell'agent (anche con il blocco
```` ```json ````) e premi **Crea bozza**. Il server controlla il JSON e apre il form precompilato:
nulla viene salvato finché non premi *Salva*. Campi: `cliente` (obbligatorio), `titolo`, `stato`
(Prospect o Progetto), `tipologia`, `referente`, `contatti`, `valore` (numero, UT + CA), `data_apertura`
e `scadenza` (AAAA-MM-GG), `note`, `attivita` (lista di `{titolo, data}`).

## Note vocali (Gemini)

Il browser registra e converte l'audio in WAV mono 16 kHz, lo invia al server, che lo passa a Gemini con
uno schema JSON fisso. Il risultato è una **bozza** che compare nel form della scheda: nulla viene salvato
finché non premi *Salva*. L'audio non viene conservato sul server. Il modello usato si cambia dall'opzione
`gemini_model` dell'add-on.

## Dati e sicurezza in breve

- Login con password, cookie di sessione firmato (14 giorni), blocco dopo tentativi falliti.
- Backup automatico del database una volta al giorno (ultimi 30) e prima di import/eliminazioni.
- Esporta tutto in JSON o in CSV (si apre in Excel) dal menu ⋯; importa un export JSON nello stesso menu.
- Le schede contengono dati di clienti: verifica che la policy aziendale consenta di tenerli sul tuo
  server e di inviarne il contenuto (solo per le note vocali) a Gemini.
