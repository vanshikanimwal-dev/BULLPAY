# Operations

The sqlite database is `data/bullpay.sqlite` unless `DATABASE_PATH` is set. The first boot turns on foreign keys, a 5000 ms busy timeout, and WAL mode, then creates the schema and the demo merchant.

Secrets that were not provided in the environment live in `data/.secrets`. Do not commit `data/` or `.env`.

## Stop the supervisor

In the PowerShell window where `npm run dev` or `npm start` is running, press Ctrl+C. The supervisor stops the child processes for the payment API, demo store, checkout, admin, observers, and help.

## Backup

Stop the apps first so the copy is consistent, then copy the sqlite file.

```powershell
Copy-Item data\bullpay.sqlite data\bullpay-backup.sqlite
```

On Unix, after the apps are stopped:

```sh
cp data/bullpay.sqlite data/bullpay-backup.sqlite
chmod 600 data/bullpay-backup.sqlite
```

Start the stack again with `npm run dev` or `npm start`.
