# WhatsApp task messages — how to switch them on

Every time a task is handed to a person in **Maintenance** or **HV Ops**, a message is queued in the shared database
(`hv_notifications`). The worker sends the queue every 5 minutes through the **Meta WhatsApp Cloud API** and each message
carries a link that opens that exact task. Until WhatsApp is switched on, messages simply wait in the queue
(HV Ops → Settings → Verifier & messages shows them).

## What triggers a message

| System | Event | Who gets it | Link opens |
|---|---|---|---|
| Maintenance | task assigned (single or multi assignee, new people only) | each newly assigned person | that task (T-0218) |
| HV Ops | task assigned / re-assigned | the assignee | that task |
| HV Ops | listing or project becomes **Ready to publish** | the uploader (Lucy) | the listing / project |
| HV Ops | listing or project **rejected** | the person who entered it | the listing / project |
| HV Ops | manager un-marks photos as ready | the person who entered it | the listing / project |
| HV Ops | photo shoot assigned / scheduled / sent back | the photographer | Needs photography |

Nothing is sent when someone gives a task to **themselves**, when the login is **disabled**, or when the person has **no phone
number in HR** (the row is kept as *skipped* with the reason). CRM property tasks and HR compliance tasks have no assignee, so nothing to send.

## One-time setup (Daniel, about 30 minutes, needs your Meta account)

1. **Meta Business** — https://business.facebook.com → WhatsApp → *Get started*. Verify the business if asked.
2. **Phone number** — add a number that is NOT already registered in a WhatsApp app on a phone (a spare SIM works). Meta gives you a
   test number first; the real number is needed for staff to actually receive messages.
3. **Message template** — WhatsApp Manager → Message templates → Create:
   - Name: `hv_task_assigned` · Category: **Utility** · Language: **Arabic** (or English — then set `WHATSAPP_TEMPLATE_LANG = "en"` in `worker/wrangler.toml`)
   - Body (Arabic):
     ```
     مرحباً {{1}}، تم إسناد مهمة لك في نظام {{2}}:
     {{3}}
     افتح الرابط لمراجعة المهمة.
     ```
   - Body (English alternative): `Hello {{1}}, a task was assigned to you in {{2}}: {{3}}. Open the link to check it.`
   - Add a **Button → Visit website → Dynamic**: URL `https://hv-ops-verifier.homevacation1950.workers.dev/go/{{1}}`
     (this part is important — the message link goes through the worker, which records who tapped it and forwards to the right system)
   - Submit; approval usually takes minutes to a few hours.
4. **Permanent token** — Business settings → System users → add a system user with *WhatsApp Business Management* and
   *WhatsApp Business Messaging* permissions → *Generate token* (never expires). Also copy the **Phone number ID** from
   WhatsApp → API setup.
5. **Worker secrets** — on this PC:
   ```bash
   cd C:\Users\Essam\home-vacation-ops\worker
   npx wrangler secret put WHATSAPP_TOKEN --name hv-ops-verifier
   npx wrangler secret put WHATSAPP_PHONE_NUMBER_ID --name hv-ops-verifier
   ```
   then in `worker/wrangler.toml` set `WHATSAPP_ENABLED = "true"` and run `npx wrangler deploy` in the `worker` folder.
6. **Phones in HR** — every person needs a WhatsApp number in HR → Users → Edit (any format; `01xxxxxxxxx` becomes `+201xxxxxxxxx` automatically).
   Today only Daniel, Mayada, Dalia, Hany and Sally have one. **Lucy, Micheal, the accountants and the sales team have none** — they will not
   receive anything until a number is entered.
7. **Test** — assign yourself nothing (self-assignments are skipped); assign a small task to someone with a phone, then
   HV Ops → Settings → Verifier & messages → *Send pending now*. The row turns *sent*; *Opened* fills in when they tap the link.

## Cost
Meta charges per **utility** message: roughly EGP 0.30–0.60 per message in Egypt (rates are on Meta's pricing page and change).
100 task assignments a month ≈ EGP 30–60. The first 1,000 service conversations a month are free, but task messages are utility messages, so expect the small charge.

## Alternative if you do not want Meta
Any provider with an HTTP API (Twilio, 360dialog, Ultramsg…) can replace the `drainNotifications` send call in `worker/verifier.js`;
the queue, triggers and links stay the same.
