# If patient information gets out: what the clinic does

For Smile Dental Clinic (Dr. Rahil Yusuf) and whoever looks after Clinic OS for it. Written 23 October 2026.

India's Digital Personal Data Protection Act, 2023 and its Rules (these duties apply from 13 May 2027) ask the clinic, when patient information is breached, to tell each patient affected and the Data Protection Board of India without delay, and to send the Board a full report within 72 hours. This is a working plan, not legal advice: have a lawyer look at it once.

## What counts as a breach

Any time patient information is lost, stolen, changed, or seen by someone who should not see it. For example:

- the clinic phone, with Clinic OS signed in, is lost or stolen;
- someone else learns the Clinic OS password;
- a bill, prescription or photo goes on WhatsApp to the wrong number;
- Supabase (the database) or Vercel (the website) reports a security incident;
- a backup file, or the passphrase that unlocks the backups, ends up in the wrong hands.

## The first hour: stop it

1. **Phone lost or stolen.** From another phone or computer: change the Clinic OS password, and have every session signed out (whoever looks after Clinic OS can end them all at once in Supabase). Use Google's Find My Device to lock or erase the phone. What was on the phone: screens kept for no signal last at most a day and, without signal, open only with the phone's fingerprint or PIN; changes and photos waiting to save may also be there.
2. **Password known to someone else.** Change it, end every session the same way, and check the sign-in history in Supabase (Authentication, then Logs).
3. **WhatsApp to the wrong number.** Ask the person to delete it, and note whether they did.
4. **Supabase or Vercel incident.** Read their notice for what was affected, and follow their steps.

## The first day: understand it

Write down, as you find out:

- when it happened, and when and how it was noticed;
- what information: names, phone numbers, dates of birth, medical alerts, visit notes, photos, bills;
- how many patients, and which;
- whether it is still at risk, and what was done to stop it.

## Tell them

**Each patient affected, without delay** (WhatsApp or a call, in plain words):

- what happened, and when;
- which of their information it was;
- what it could mean for them;
- what the clinic has done, and what they can do (for example, be wary of calls or messages claiming to be the clinic);
- who to contact at the clinic with questions.

**The Data Protection Board of India:**

- straight away: what happened, how much, when and where;
- within 72 hours (or longer, if the Board agrees in writing): the full report. What happened and how, what was done to limit the harm, what was found about who caused it, what will stop it happening again, and how the patients were told.

## Afterwards

- Fix the cause, and change any password or key that was involved.
- Keep the written record of the breach and of everything done, for at least a year.
- Update this plan with what was learned.

## Who to call

- **The clinic:** Dr. Rahil Yusuf, on the clinic phone and email (as on the website).
- **Supabase** (database, photos): support from the Supabase dashboard.
- **Vercel** (website): support from the Vercel dashboard.
- **The Data Protection Board of India:** through its official website (Ministry of Electronics and Information Technology).
