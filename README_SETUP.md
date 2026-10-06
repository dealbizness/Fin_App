# 📱 Finance Monitor Pro — Modern Mobile & Web App

A modern, mobile-first Progressive Web Application (PWA) and dashboard for managing loans, borrowers, and EMI collections backed by Google Sheets.

---

## 🌟 Key Features

- 💳 **Upgraded Loan Option Types**:
  - **Interest Only**: Borrower pays periodic interest (Daily, Weekly, Monthly, or One-Time); principal balance returned at the end or repaid via part-payments.
  - **EMI**: Reducing-balance annuity installments combining principal and interest.
  - **Flexible**: Zero interest, flexible repayment plan where any amount can be deposited at any time to settle principal.
- ⏱️ **Flexible Collection Frequencies**:
  - **Daily**, **Weekly**, **Monthly**, and **One Time** (bullet settlement of principal + interest at tenure).
- 💰 **Principal Part-Payments & Collections**:
  - **Part-Payment of Principal (`payPrincipal`)**: Mid-tenure lumpsum repayment that deducts directly from the principal outstanding, automatically re-prices future interest/EMIs, and immediately closes the contract when balance reaches zero.
  - **Flexible Repayments**: Record on-the-spot repayments of any denomination with real-time balance calculations.
- 📱 **Mobile-First Responsive Design**:
  - Thumb-friendly **Bottom Navigation Bar** for phones (Dashboard, Borrowers, Loans, EMI, Reports, Cloud).
  - **Mobile Touch Cards** that adapt on small screens (no more awkward horizontal table scrolling).
  - **Native Bottom Sheet Modals** with smooth slide-up animations.
- 💬 **One-Click WhatsApp EMI Reminders**:
  - Automatically formats a polite, personalized reminder with borrower name, EMI installment number, amount due, and due date.
  - Tapping **WhatsApp** instantly opens the chat with the borrower with the message ready to send!
- 🧮 **Live EMI & Loan Amortization Engine**:
  - 4-column live preview: Installment, Total Payable, Total Interest, and Final Payment updated dynamically as you type.
- 🧾 **Instant Payment Receipts**:
  - Prints or saves branded official payment receipts with receipt number, payment mode, and remaining loan balance.
- 📊 **Visual Analytics**:
  - Monthly collections trend bar chart and active vs closed loan portfolio doughnut chart.
- 📲 **PWA "Install as Mobile App"**:
  - Works offline using service workers.
  - Can be installed directly to the home screen of Android & iOS devices (runs full-screen without browser address bar).
- ☁️ **Google Sheets Cloud Sync**:
  - Directly reads and writes to your Google Sheet using Google Apps Script as a fast REST API.

---

## 🚀 Quick Start (Running the App)

You can launch and use the app immediately:

1. Open `FinanceApp/index.html` directly in **Google Chrome**, **Brave**, **Edge**, or **Safari**.
2. The app will launch with pre-loaded sample data so you can test all features right away.

---

## 🔗 Connecting Your Google Sheet (2 Minutes)

To link the app directly to your Google Sheet:

### Step 1: Update `Code.gs` in Apps Script
1. Open your Google Sheet:
   ```
   https://docs.google.com/spreadsheets/d/1Dn3-FL72I2WUfnNc9DyadKeg3onoj243NCzeiMjoW04/edit
   ```
2. Click **Extensions** → **Apps Script**.
3. Open `Code.gs` in the editor.
4. Replace its content with the updated `FinanceApp/Code.gs` (this adds the JSON REST API endpoint for the web app while keeping existing features).
5. Click **Save** (Ctrl + S).

### Step 2: Deploy as Web App
1. In the Apps Script editor, click **Deploy** → **Manage deployments** (or **New deployment**).
2. Click the pencil icon to edit or create a **New deployment**:
   - **Type**: Web app
   - **Execute as**: `Me (your email)`
   - **Who has access**: `Anyone` *(Required so your web app can send/receive loan data)*
3. Click **Deploy**.
4. Copy the **Web app URL** (starts with `https://script.google.com/macros/s/.../exec`).

### Step 3: Connect in the App
1. Open `FinanceApp/index.html`.
2. Go to the **Cloud & Sheets** tab (bottom menu on mobile, or sidebar on desktop).
3. The input field is pre-configured with your active deployment URL:
   ```text
   https://script.google.com/macros/s/AKfycbyLjlOHlQizWwHVMnP-HageJJRrZ9TQfTxxSUP8VhKBTj0YSGLu7axNeEx1IpITwAHvfw/exec
   ```
4. Click **Test & Save Connection**.
5. Click **Pull Latest Data Now**.
6. Done! Your app is now live-synced with your Google Spreadsheet!

---

## 📲 How to Install on Your Phone (Android & iPhone)

### On Android (Chrome / Brave / Samsung Internet):
1. Host `FinanceApp` on any free web host (GitHub Pages, Netlify, Vercel, Firebase) or send the link to your phone.
2. Open the URL in Google Chrome.
3. Tap the **3 dots (⋮)** in the top right corner.
4. Tap **Add to Home screen** or **Install app**.
5. The FinMonitor icon will appear on your phone's home screen and open full-screen like a native app!

### On iPhone / iPad (Safari):
1. Open the URL in **Safari**.
2. Tap the **Share** button (box with an arrow pointing up at the bottom).
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add**. The FinMonitor app will be installed on your iOS home screen!
