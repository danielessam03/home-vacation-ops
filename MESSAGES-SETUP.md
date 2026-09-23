# Task messages — how to switch them on (e-mail first, WhatsApp optional)

Every time a task is handed to a person in **Maintenance** or **HV Ops**, a message is queued in the shared database
(`hv_notifications`). The worker sends the queue every 5 minutes over whichever channels are switched on, and every message
carries a link that opens that exact task. Until a channel is on, messages simply wait in the queue
(HV Ops → Settings → Verifier & messages shows them).

## What triggers a message

| System | Event | Who gets it | Link opens |
|---|---|---|---|
| Maintenance | task assigned (single or multi assignee, new people only) | each newly assigned person | that task (T-0218) |
| HV Ops | task assigned / re-assigned | the assignee | that task |
| HV Ops | listing or project becomes **Ready to publish** | the uploader (Lucy) | the listing / project |
| HV Ops | listing or project **rejected**, or photos un-marked as ready | the person who entered it | the listing / project |
| HV Ops | photo shoot assigned / scheduled / sent back | the photographer | Needs photography |

Nothing is sent when someone gives a task to **themselves**, when the login is **disabled**, or when the person has neither a
**real e-mail** nor a **phone** in HR (placeholder addresses ending in `.local` do not count). Such rows are kept as *skipped* with the reason.

## E-mail (Daniel, about 20 minutes)

1. **Real addresses in HR** — HR → Users → each person → *Login email*. Anything ending in `@hv.local` / `@hv-crm.local` is a placeholder and
   will never receive mail. Username and password do not change.
2. **Resend account** — https://resend.com (free: 3,000 e-mails a month, 100 a day). Sign up with any e-mail.
3. **Verify the sending domain** — Resend → Domains → *Add domain* → `home-vacation.com` (or `mail.home-vacation.com` if you prefer to keep the main
   domain untouched). Resend shows 3 DNS records (DKIM TXT, SPF TXT/MX). Add them wherever the domain's DNS is managed — probably SiteGround →
   Site Tools → Domain → DNS Zone Editor. Wait for Resend to show *Verified* (minutes to an hour).
4. **API key** — Resend → API keys → *Create* (permission: sending only). Copy it once.
5. **Worker** — on this PC:
   ```bash
   cd C:\Users\Essam\home-vacation-ops\worker
   npx wrangler secret put RESEND_API_KEY --name hv-ops-verifier
   ```
   then in `worker/wrangler.toml` set `EMAIL_ENABLED = "true"` (and change `EMAIL_FROM` if you used a subdomain), and run `npx wrangler deploy` in the `worker` folder.
6. **Test** — assign a small task to someone with a real e-mail, then HV Ops → Settings → Verifier & messages → *Send pending now*.
   The row turns *sent · email*; *Opened* fills in when they click the button in the mail.

Tip: ask everyone to add the company mailbox to their phone (Gmail / Outlook app) with notifications on — otherwise the mail is only seen when they open the inbox.

## WhatsApp later (optional)

The same queue can also go out over WhatsApp. Either the official Meta Cloud API (needs a Meta Business account, a template and a per-message
fee — Daniel decided against it) or a linked-phone service such as Green API / Ultramsg (a spare SIM, a QR scan, no templates; not an official
channel, so a small risk of the number being blocked). If you choose one, only the sending function in `worker/verifier.js` changes.
