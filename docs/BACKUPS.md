# Backups (Google Drive, every night)

Every night at 2:00 AM (India time) a GitHub job (`.github/workflows/backup.yml`) copies Clinic OS to your Google Drive:

- **The database:** a full dump plus a CSV of every clinic table (patients, visits, charges, payments, photos list, appointments, website requests, time off). The CSVs open in Excel.
- **The photos:** a mirror of all visit photos. A photo deleted in the app is kept in the backup for 31 days.
- **Kept:** the last 30 nightly copies and one copy per month for a year.
- **Encrypted** with a passphrase only you hold, before anything leaves GitHub. Google, GitHub and anyone who opens your Drive see only scrambled files (`….bin`).
- **Checked every night:** the job first restores the dump into a scratch database and counts the rows. If a backup could not be restored, the run fails and GitHub emails you.

It runs on GitHub's free minutes (about 5 minutes a night) and uses a little of your Drive (the database is a few MB; photos grow slowly).

## One-time setup (about 15 minutes)

You add four secrets in GitHub: **infinitywoke/smile-dental → Settings → Secrets and variables → Actions → New repository secret**. GitHub keeps them encrypted and never shows them in logs. Claude never sees them.

1. **`SUPABASE_DB_URL`** (the database address with its password)
   - Supabase → project **smile-clinic-os** → **Connect** (top of the page) → **Session pooler** → copy the URI. It looks like `postgresql://postgres.pmuecirfwmtsvojxleoq:[YOUR-PASSWORD]@aws-…-ap-south-1.pooler.supabase.com:5432/postgres`.
   - Replace `[YOUR-PASSWORD]` with the database password. Don't know it? **Project Settings → Database → Reset database password** (safe: the app doesn't use it). Use letters and numbers only, so it needs no special escaping.
   - Use the *Session pooler* address: GitHub's machines can't reach the direct one.
2. **`SUPABASE_S3_ACCESS_KEY_ID`** and **`SUPABASE_S3_SECRET_ACCESS_KEY`** (to read the photos)
   - Supabase → **Storage → S3 Configuration** (turn on "S3 protocol connection" if it is off) → **New access key** → name it "backup" → copy both values (the secret is shown only once).
3. **`RCLONE_DRIVE_TOKEN`** (permission to write into your Google Drive)
   - On your PC, in PowerShell: `winget install Rclone.Rclone`, then close and reopen PowerShell.
   - Run: `rclone authorize "drive" "eyJzY29wZSI6ImRyaXZlLmZpbGUifQ"`
   - A browser opens: sign in with the Google account whose Drive should hold the backups, then **Allow**.
   - PowerShell prints a token between "Paste the following" and "End paste" (a long line starting `eyJ` or `{"access_token":`). Copy that whole line into the secret.
   - The code in the command limits it to files the backup itself creates: it cannot see anything else in your Drive.
4. **`BACKUP_PASSPHRASE`**
   - Make up a long passphrase (5–6 random words) and keep a copy somewhere safe away from the computer (a password manager, or paper in a safe place). **Without it nobody, including you, can open the backups.**

Then: **GitHub → Actions → Nightly backup → Run workflow.** A green tick means it worked; your Drive now has a folder **Smile Dental backups**. From then on it runs by itself every night.

## Opening a backup

On any computer with rclone (step 3 above), in PowerShell, with your token and passphrase:

```powershell
$env:RCLONE_CONFIG_GDRIVE_TYPE = "drive"
$env:RCLONE_CONFIG_GDRIVE_SCOPE = "drive.file"
$env:RCLONE_CONFIG_GDRIVE_TOKEN = '<the token from step 3>'
$env:RCLONE_CONFIG_VAULT_TYPE = "crypt"
$env:RCLONE_CONFIG_VAULT_REMOTE = "gdrive:Smile Dental backups"
$env:RCLONE_CONFIG_VAULT_FILENAME_ENCRYPTION = "off"
$env:RCLONE_CONFIG_VAULT_DIRECTORY_NAME_ENCRYPTION = "false"
$env:RCLONE_CONFIG_VAULT_PASSWORD = (rclone obscure "<your passphrase>")

rclone lsl vault:database/daily                                     # list the nightly copies
rclone copy vault:database/daily/clinic-2026-10-15.tar.gz .          # download one (decrypted)
tar -xzf clinic-2026-10-15.tar.gz                                    # database.dump + one CSV per table
rclone copy vault:photos/current .\photos                             # all photos
```

- **One patient deleted by mistake:** their rows are in the CSVs (patients, visits, charges, payments…) and their photos in `photos/` (or `photos/removed/<date>/` if deleted from the app). Claude can put them back from these files.
- **Everything lost (new Supabase project):** run `supabase/schema.sql` in the new project, create Dr. Rahil's login with the same email, restore the data from `database.dump` (`pg_restore --data-only --schema=public`), and copy `photos/` into the `visit-photos` bucket. The nightly check proves this dump restores into the clinic's schema. Do it with Claude: it takes about an hour.

## Keeping it safe

- The backups contain patient health data, so they are encrypted with your passphrase; the Drive token can only touch the backup folder.
- The Supabase S3 key and the database password can read the live data: they live only in GitHub's encrypted secrets. If one ever leaks, create a new one in Supabase and replace the secret.
- If a night fails, GitHub emails you; open **Actions → Nightly backup** to see why (a red step names the problem).
