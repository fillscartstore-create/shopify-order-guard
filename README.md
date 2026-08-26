# Shopify Order Guard — A-Z Deployment Guide (100% FREE)

Ye app tumhare Fillscart Shopify store k liye 5 kaam khud-ba-khud karti h:
1. Bulk WhatsApp order confirmation
2. Duplicate/spam/fake order detection (phone, email, name, address)
3. Agar customer ka koi order pehle se "processing" m hai (phone/email/IP se match) → naya order khud cancel
4. "cancelled" tag lagte hi order khud Shopify se cancel
5. Galat/fake city spelling ho to order khud cancel (last 90+ din ka data hamesha safe rehta hai)

**Total cost: Rs. 0 — kabhi bhi. Koi credit card bhi nahi maangi jayegi.**

Ye guide bilkul shuru se (zero knowledge) likhi gai h. Har step follow karo, koi step skip mat karo.

---

## Overview — 4 free accounts banane hain

| # | Service | Kaam | Cost |
|---|---------|------|------|
| 1 | GitHub | Code rakhne k liye | Free |
| 2 | Supabase | Database (customer/order data 90+ din tak) | Free forever |
| 3 | Render | App ko chalane (host karne) k liye | Free forever |
| 4 | Shopify + Meta (already h) | Store aur WhatsApp | Already setup |

---

## STEP 1 — GitHub account banao aur code upload karo

1. https://github.com pe jao → **Sign up** → email/password se account banao (free)
2. Login hone k baad, top-right corner pe **"+"** icon → **"New repository"**
3. Repository name: `shopify-order-guard` likho → **Public** select karo → **Create repository**
4. Ab is zip file ko apne computer m **extract/unzip** karo (jo maine bheji hai)
5. GitHub k naye repo page pe **"uploading an existing file"** link pe click karo (ya "Add file" → "Upload files")
6. Extract ki hui `shopify-order-guard` folder k andar ki **saari files aur `src` folder** drag-and-drop karke upload karo (poori folder ka content, na k folder khud)
7. Neeche **"Commit changes"** button pe click karo

Ab tumhara code GitHub pe h. (Git install karne ki zaroorat nahi — sab kuch website se hi ho gaya)

---

## STEP 2 — Supabase pe FREE database banao

1. https://supabase.com pe jao → **Start your project** → GitHub account se sign in kardo (wahi jo abhi bnaya)
2. **New Project** → koi bhi naam do (e.g. `order-guard-db`) → ek strong password set karo aur **kahin likh k rakh lo** (ye baad m chahiye hoga)
3. Region: **Southeast Asia (Singapore)** select karo (Pakistan se sabse qareeb, fast rahega)
4. **Create new project** pe click karo — 1-2 minute lagega banne m
5. Project ban jane k baad, left sidebar m **Project Settings (gear icon)** → **Database**
6. **"Connection string"** section m jao → **"URI"** tab select karo
7. Wahan se string copy karo, jaisi dikhegi:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxx.supabase.co:5432/postgres
   ```
8. `[YOUR-PASSWORD]` ki jagah apna wo password daal do jo step 2 m banaya tha
9. Ye poori string kahin save kar lo (notepad m) — ye tumhara `DATABASE_URL` hai

---

## STEP 3 — Render pe FREE app deploy karo

1. https://render.com pe jao → **Get Started** → GitHub se sign in karo
2. Dashboard pe **"New +"** button → **"Web Service"**
3. Apna GitHub repo (`shopify-order-guard`) connect karo aur select karo
4. Settings yun bharo:
   - **Name**: `shopify-order-guard` (ya koi bhi naam)
   - **Region**: Singapore
   - **Branch**: main
   - **Root Directory**: khali chodo
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: **Free** select karo (ye zaroor check karo — default kabhi kabhi paid dikhata h, Free hi chuno)
5. Neeche **"Environment Variables"** section m ye sab **Add Environment Variable** karke daalo (ek-ek karke):

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | Step 2 wali poori Supabase connection string |
   | `SHOPIFY_STORE_DOMAIN` | `xxxxx.myshopify.com` (Step 4 se milega) |
   | `SHOPIFY_ADMIN_ACCESS_TOKEN` | Step 4 se milega |
   | `SHOPIFY_API_VERSION` | `2024-10` |
   | `SHOPIFY_WEBHOOK_SECRET` | Step 5 se milega |
   | `WHATSAPP_PHONE_NUMBER_ID` | `149658608222714` (tumhara existing) |
   | `WHATSAPP_ACCESS_TOKEN` | Meta ka tumhara existing token |
   | `WHATSAPP_CONFIRMATION_TEMPLATE` | `order_confirmation` |
   | `WHATSAPP_LANGUAGE_CODE` | `ur` |
   | `CANCEL_TRIGGER_TAG` | `cancelled` |
   | `CONFIRMED_SENT_TAG` | `confirmation-sent` |
   | `BLOCKED_TAG` | `duplicate-blocked` |
   | `DUPLICATE_WINDOW_HOURS` | `2160` |
   | `BULK_SEND_DELAY_MS` | `1200` |
   | `ADMIN_API_KEY` | koi bhi lambi random string khud bana lo, e.g. `sk_fillscart_9x7q2m4z` |

6. Neeche **"Create Web Service"** pe click karo — deploy hona shuru ho jayega (2-4 minute lagenge)
7. Deploy complete hone k baad, upar tumhe ek URL milega jaisa: `https://shopify-order-guard-xxxx.onrender.com` — **ye copy karke rakh lo**, isi ko Shopify webhooks m use karna hai

### ⚠️ Free tier ki ek limitation (zaroor parho)
Render ka free tier 15 minute tak koi request na aane pe **so jata h** (sleep mode). Jab agli request (jaise koi order) aayegi, wake hone m 30-50 second lag sakte hain. Shopify webhooks fail hone pe khud-ba-khud dobara try karta h (kai ghanton tak), is liye final result theek hi hoga, bas thora delay ho sakta hai.

**Isko rokne ka free tarika:** https://uptimerobot.com pe free account banao → "Add New Monitor" → URL m apna Render URL + `/health` daalo (e.g. `https://shopify-order-guard-xxxx.onrender.com/health`) → every 5 minutes check karne ko set karo. Ye app ko hamesha "jaga" rakhega, bilkul free.

---

## STEP 4 — Shopify Custom App banao (Admin API token)

1. Apne Shopify Admin (Fillscart) m jao → **Settings** → **Apps and sales channels**
2. **"Develop apps"** pe click karo (agar pehli baar h to "Allow custom app development" pe click karna pare ga)
3. **"Create an app"** → naam do: `Order Guard`
4. **"Configure Admin API scopes"** pe click karo → search karke ye 2 permissions ON karo:
   - `read_orders`
   - `write_orders`
5. **Save** karo → upar **"Install app"** button pe click karo → confirm karo
6. Install hone k baad **"API credentials"** tab m jao → **"Admin API access token"** k neeche **"Reveal token once"** pe click karke copy kar lo (ye sirf ek dafa dikhta h, turant kahin save karlo)
7. Yehi token Render k `SHOPIFY_ADMIN_ACCESS_TOKEN` m daalna hai
8. Store ka asal domain (`.myshopify.com` wala) **Settings → Domains** m milega — wo `SHOPIFY_STORE_DOMAIN` m daalna hai

---

## STEP 5 — Webhooks register karo (Shopify ko batana k naya order aane pe app ko inform kare)

1. Shopify Admin → **Settings** → **Notifications** → sabse neeche scroll karo **"Webhooks"** section tak
2. **"Create webhook"** pe click karo:
   - Event: **Order creation**
   - Format: **JSON**
   - URL: `https://YOUR-RENDER-URL.onrender.com/webhooks/orders-create`
3. Dubara **"Create webhook"**:
   - Event: **Order update**
   - Format: **JSON**
   - URL: `https://YOUR-RENDER-URL.onrender.com/webhooks/orders-updated`
4. Upar hi is page pe **"Webhook signing secret"** dikhega — usay copy karke Render k `SHOPIFY_WEBHOOK_SECRET` m daal do
5. Render pe wapis jao → apni service → **Environment** tab → `SHOPIFY_WEBHOOK_SECRET` update karo → **Save Changes** (app khud restart ho jayegi)

---

## STEP 6 — Test karo k sab kaam kar raha hai

Apne phone/computer k browser m ye URL kholo:
```
https://YOUR-RENDER-URL.onrender.com/health
```
Agar `{"ok":true,...}` dikhe to app zinda hai. ✅

Ab apne store pe ek test order khud place karlo (COD se). 1-2 minute k andar Shopify Admin m us order k **tags** dekho — agar sab theek h to koi extra tag nahi lagega. Ab dobara **wahi phone number** se ek aur order place karo — is baar order pe `duplicate-blocked` tag lagna chahiye aur order automatically **cancelled** ho jana chahiye.

---

## Bulk confirmation kaise chalao

Roz jitni martaba chaho, is URL ko browser ya Postman/curl se call karo (POST request):

```
POST https://YOUR-RENDER-URL.onrender.com/bulk-confirm/run
Header: X-Admin-Key: <wahi ADMIN_API_KEY jo Render m daala tha>
```

Agar tumhe browser se hi karna ho bina kisi tool k, mujhe bata dena — ek simple button wala webpage bhi bana dunga jo ye call kare.

---

## Kharch / Limits summary

- **Render free tier**: hamesha free, koi card nahi chahiye, bas sleep hota hai idle rehne pe (UptimeRobot se solve ho jata h)
- **Supabase free tier**: 500MB database free forever — tumhare order data k liye ye kai saal chalega
- **Koi bhi step m credit card kahin nahi maangi jayegi**

Agar kabhi koi step m atak jao, exact error message bata dena, us hisab se guide karunga.
