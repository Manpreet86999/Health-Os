# Personal Supabase setup

Each Body OS user creates and owns a separate Supabase project.

1. Create a Supabase project.
2. Open **SQL Editor**, paste all of `setup.sql`, and run it.
3. Open **Authentication > Providers > Email** and enable Email.
4. Open **Project Settings > API** and copy the project URL and **publishable** key.
5. Enter those values in Body OS on PC and Android, then create or sign in to the same email account on both devices.

Never enter a secret key, legacy `service_role` key, database password, or access token into Body OS. Local SQLite remains the offline source of truth. The first connection shows a record-count review before uploading.
