// ═══════════════════════════════════════════════════════════════
//  FINANCE MONITOR PRO — Server-Side Backend (Code.gs)
//  Google Apps Script Web Application & Headless REST API
//  © 2026 — Zero-Error Production Build
// ═══════════════════════════════════════════════════════════════

const SPREADSHEET_ID = '1Dn3-FL72I2WUfnNc9DyadKeg3onoj243NCzeiMjoW04';

const SHEET_NAMES = {
  CUSTOMERS: 'Customers',
  LOANS: 'Loans',
  EMI_SCHEDULE: 'EMI_Schedule',
  PAYMENTS: 'Payments'
};

// ─────────────────── WEB APP & REST API ENTRY ───────────────────
function doGet(e) {
  // If an API action query parameter is passed (e.g. ?action=getDashboardData)
  if (e && e.parameter && e.parameter.action) {
    const result = handleApiGetRequest_(e.parameter.action, e.parameter);
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Otherwise serve standard Web App HTML template
  const template = HtmlService.createTemplateFromFile('Index');
  return template.evaluate()
    .setTitle('Finance Monitor Pro')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doPost(e) {
  try {
    let payload = {};
    if (e && e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    }
    const action = payload.action || (e && e.parameter && e.parameter.action);
    const data   = payload.data   || payload;
    const result = handleApiPostRequest_(action, data);
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function handleApiGetRequest_(action, params) {
  try {
    switch (action) {
      case 'ping':
        return { success: true, message: 'Finance Monitor Pro API Online' };
      case 'getDashboardData':
        return {
          success: true,
          customers: getAllCustomers(),
          loans: getAllLoans(),
          emis: getAllEMIs(),
          payments: sheetToObjects_(SHEET_NAMES.PAYMENTS),
          summary: getDashboardData()
        };
      case 'getCustomers':
        return { success: true, data: getAllCustomers() };
      case 'getLoans':
        return { success: true, data: getAllLoans() };
      case 'getEMIs':
        return { success: true, data: getAllEMIs() };
      case 'getReports':
        return { success: true, data: getOutstandingReport() };
      default:
        return { success: false, message: 'Unknown action: ' + action };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function handleApiPostRequest_(action, data) {
  try {
    switch (action) {
      case 'addCustomer':
        return addCustomer(data);
      case 'updateCustomer':
        return updateCustomer(data);
      case 'deleteCustomer':
        return deleteCustomer(data.customerId);
      case 'createLoan':
        return createLoan(data);
      case 'updateLoan':
        return updateLoan(data);
      case 'deleteLoan':
        return deleteLoan(data.loanId, data.withPayments);
      case 'markEMIPaid':
        return markEMIPaid(data);
      case 'payPrincipal':
        return payPrincipal(data);
      default:
        return { success: false, message: 'Unknown POST action: ' + action };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ─────────────────── SPREADSHEET ACCESS ───────────────────
function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheet_(name) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    setupSheetHeaders_(sheet, name);
  }
  else if (sheet.getLastRow() === 0) setupSheetHeaders_(sheet, name);
  return sheet;
}

// ─────────────────── INITIALIZATION ───────────────────
function initializeApp() {
  try {
    Object.values(SHEET_NAMES).forEach(name => getSheet_(name));
    applyTextFormats_();
    ensureLoanHeaders_();
    return { success: true, message: 'App initialized successfully!' };
  } catch (e) {
    return { success: false, message: 'Init error: ' + e.message };
  }
}

// Keeps phone numbers / dates as plain text so Sheets never auto-converts them
function applyTextFormats_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('TEXT_FORMATS') === 'v2') return;
  const cols = { Customers: [3, 7, 8], Loans: [12, 13, 17], EMI_Schedule: [6, 12], Payments: [7, 11] };
  Object.keys(cols).forEach(name => {
    const s = getSheet_(name);
    cols[name].forEach(col => {
      const rng = s.getRange(1, col, Math.max(s.getLastRow(), 1), 1);
      const vals = rng.getValues().map(r => [r[0] === '' ? '' : String(cleanValue_(r[0]))]);
      s.getRange(1, col, s.getMaxRows(), 1).setNumberFormat('@');
      rng.setValues(vals);
    });
  });
  props.setProperty('TEXT_FORMATS', 'v2');
}

// Adds the LoanType / Frequency columns to an existing Loans sheet
function ensureLoanHeaders_() {
  const s = getSheet_(SHEET_NAMES.LOANS);
  if (s.getRange(1, 19).getValue() !== 'LoanType') {
    s.getRange(1, 19, 1, 2).setValues([['LoanType', 'Frequency']])
      .setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff').setHorizontalAlignment('center');
  }
}

function setupSheetHeaders_(sheet, name) {
  const headerMap = {
    'Customers': [
      'CustomerID','Name','Phone','Email','Address',
      'IDProof','IDNumber','JoinDate','Status','Notes'
    ],
    'Loans': [
      'LoanID','CustomerID','CustomerName','LoanAmount','InterestRate',
      'InterestType','Tenure','EMIAmount','TotalPayable','TotalPaid',
      'Outstanding','StartDate','EndDate','EMIsPaid','EMIsRemaining',
      'Status','CreatedDate','Notes','LoanType','Frequency'
    ],
    'EMI_Schedule': [
      'EMIID','LoanID','CustomerID','CustomerName','EMINumber',
      'DueDate','EMIAmount','Principal','Interest','Balance',
      'PaidAmount','PaidDate','PaymentMode','Status','LateFee','Remarks'
    ],
    'Payments': [
      'PaymentID','LoanID','CustomerID','CustomerName','EMINumber',
      'Amount','PaymentDate','PaymentMode','ReceivedBy','Remarks','Timestamp'
    ]
  };

  const headers = headerMap[name];
  if (headers) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#1a1a2e')
      .setFontColor('#ffffff')
      .setHorizontalAlignment('center');
    sheet.setFrozenRows(1);
  }
}

// ─────────────────── UTILITIES ───────────────────
function generateId_(prefix) {
  const ts = new Date().getTime().toString(36).toUpperCase();
  const rnd = Math.random().toString(36).substring(2, 6).toUpperCase();
  return prefix + '-' + ts + rnd;
}

let TZ_CACHE_ = null;
function tz_() {
  if (!TZ_CACHE_) {
    try { TZ_CACHE_ = getSpreadsheet_().getSpreadsheetTimeZone(); }
    catch (e) { TZ_CACHE_ = Session.getScriptTimeZone(); }
  }
  return TZ_CACHE_;
}

function formatDateIN_(date) {
  if (date === null || date === undefined || date === '') return '';
  if (date instanceof Date) return isNaN(date.getTime()) ? '' : Utilities.formatDate(date, tz_(), 'dd/MM/yyyy');
  const s = String(date).trim();
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return s;
  const d = parseDateIN_(s);
  return d ? formatDateIN_(d) : s;
}

function parseDateIN_(v) {
  if (!v) return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    const p = Utilities.formatDate(v, tz_(), 'yyyy-MM-dd').split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function today_() { return parseDateIN_(new Date()); }

// Adds months without overflow (31 Jan + 1 month = 28/29 Feb, not 3 Mar)
function addMonths_(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth() + n, 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(date.getDate(), last));
  return d;
}

// Convert Date objects to strings for safety
function cleanValue_(v) {
  if (v instanceof Date) return formatDateIN_(v);
  return v === undefined ? '' : v;
}

function safe_(o) { return JSON.parse(JSON.stringify(o)); }

function rowToObj_(headers, row) {
  const o = {};
  headers.forEach((h, j) => { o[String(h).trim()] = cleanValue_(row[j]); });
  return o;
}

function sheetToObjects_(sheetName) {
  const data = getSheet_(sheetName).getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  return data.slice(1)
    .filter(r => r.some(cell => cell !== ''))
    .map(r => rowToObj_(headers, r));
}

// ═══════════════════════════════════════════════════════
//  CUSTOMER OPERATIONS
// ═══════════════════════════════════════════════════════

function addCustomer(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const name  = String(data.name || '').trim();
    const phone = String(data.phone || '').replace(/[\s-]/g, '');
    if (!name) return { success: false, message: 'Customer name is required.' };
    if (!/^\+?\d{10,13}$/.test(phone)) return { success: false, message: 'Enter a valid phone number (10 digits).' };
    if (data.email && !/^\S+@\S+\.\S+$/.test(String(data.email).trim())) {
      return { success: false, message: 'Enter a valid email address.' };
    }
    const last10 = s => String(s).replace(/\D/g, '').slice(-10);
    const dup = sheetToObjects_(SHEET_NAMES.CUSTOMERS).find(c => last10(c.Phone) === last10(phone));
    if (dup) return { success: false, message: 'Phone already registered to ' + dup.Name + ' (' + dup.CustomerID + ').' };

    const sheet = getSheet_(SHEET_NAMES.CUSTOMERS);
    const id = generateId_('CUS');
    sheet.appendRow([
      id, name, phone,
      String(data.email || '').trim(),
      String(data.address || '').trim(),
      data.idProof || '',
      String(data.idNumber || '').trim(),
      formatDateIN_(new Date()),
      data.status || 'Active',
      String(data.notes || '').trim()
    ]);
    SpreadsheetApp.flush();
    return { success: true, customerId: id, message: 'Customer "' + name + '" added successfully!' };
  } catch (e) {
    Logger.log('addCustomer ERROR: ' + e.message);
    return { success: false, message: 'Error: ' + e.message };
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function getAllCustomers() {
  let customers = [];
  try {
    customers = sheetToObjects_(SHEET_NAMES.CUSTOMERS);
  } catch (e) {
    Logger.log('CRITICAL — Cannot read Customers sheet: ' + e.message);
    return [];
  }

  try {
    const loans = sheetToObjects_(SHEET_NAMES.LOANS);
    customers.forEach(c => {
      let activeLoans = 0, totalOut = 0;
      loans.forEach(l => {
        if (String(l.CustomerID) === String(c.CustomerID) && l.Status === 'Active') {
          activeLoans++;
          totalOut += Number(l.Outstanding) || 0;
        }
      });
      c.ActiveLoans = activeLoans;
      c.TotalOutstanding = totalOut;
    });
  } catch (loanErr) {
    customers.forEach(c => {
      c.ActiveLoans = 0;
      c.TotalOutstanding = 0;
    });
  }

  return safe_(customers);
}

function getCustomerById(customerId) {
  try {
    const customers = getAllCustomers();
    const customer = customers.find(c => c.CustomerID === customerId);
    if (!customer) return null;

    customer.loans    = getLoansByCustomer(customerId);
    customer.payments = getPaymentsByCustomer_(customerId);

    let totalPaid = 0;
    customer.loans.forEach(l => { totalPaid += Number(l.TotalPaid) || 0; });
    customer.TotalPaid = totalPaid;

    return customer;
  } catch (e) {
    return null;
  }
}

function updateCustomer(data) {
  try {
    const sheet = getSheet_(SHEET_NAMES.CUSTOMERS);
    const allData = sheet.getDataRange().getValues();
    for (let i = 1; i < allData.length; i++) {
      if (allData[i][0] === data.customerId) {
        const row = i + 1;
        sheet.getRange(row, 2).setValue(data.name);
        sheet.getRange(row, 3).setValue(data.phone);
        sheet.getRange(row, 4).setValue(data.email   || '');
        sheet.getRange(row, 5).setValue(data.address  || '');
        sheet.getRange(row, 6).setValue(data.idProof  || '');
        sheet.getRange(row, 7).setValue(data.idNumber || '');
        sheet.getRange(row, 9).setValue(data.status   || 'Active');
        sheet.getRange(row, 10).setValue(data.notes   || '');
        return { success: true, message: 'Customer updated!' };
      }
    }
    return { success: false, message: 'Customer not found!' };
  } catch (e) {
    return { success: false, message: 'Error: ' + e.message };
  }
}

function deleteCustomer(customerId) {
  try {
    const loans = getLoansByCustomer(customerId);
    if (loans.some(l => l.Status === 'Active')) {
      return { success: false, message: 'Cannot delete — active loans exist!' };
    }
    const sheet = getSheet_(SHEET_NAMES.CUSTOMERS);
    const data  = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === customerId) {
        sheet.deleteRow(i + 1);
        return { success: true, message: 'Customer deleted!' };
      }
    }
    return { success: false, message: 'Not found!' };
  } catch (e) {
    return { success: false, message: 'Error: ' + e.message };
  }
}

function searchCustomers(query) {
  const q = String(query).toLowerCase();
  return getAllCustomers().filter(c =>
    (c.Name && c.Name.toLowerCase().includes(q)) ||
    (c.Phone && String(c.Phone).includes(q)) ||
    (c.CustomerID && c.CustomerID.toLowerCase().includes(q))
  );
}

function getCustomerDropdownList() {
  return getAllCustomers()
    .filter(c => c.Status === 'Active')
    .map(c => ({ id: c.CustomerID, name: c.Name, phone: c.Phone }));
}

// ═══════════════════════════════════════════════════════
//  LOAN OPERATIONS (EMI / Interest-Only / Flexible)
// ═══════════════════════════════════════════════════════

function round2_(x) { return Math.round(x * 100) / 100; }
const FREQ_PER_YEAR_ = { 'Daily': 365, 'Weekly': 52, 'Monthly': 12, 'One Time': 12 };

function periodRate_(rate, rateType, freq) {
  const annual = (rateType === 'Monthly' ? Number(rate) * 12 : Number(rate)) / 100;
  return annual / (FREQ_PER_YEAR_[freq] || 12);
}
function installments_(freq, tenure) { return freq === 'One Time' ? 1 : Number(tenure); }

function dueDate_(start, freq, i, tenure) {
  if (freq === 'Daily')  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
  if (freq === 'Weekly') return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7 * i);
  if (freq === 'One Time') return addMonths_(start, Number(tenure));
  return addMonths_(start, i);
}

function buildSchedule_(P, pr, count, type, mult) {
  const rows = [];
  if (type === 'EMI' && count > 1) {
    const emi = pr === 0 ? P / count : P * pr * Math.pow(1 + pr, count) / (Math.pow(1 + pr, count) - 1);
    let bal = P;
    for (let k = 1; k <= count; k++) {
      const last = k === count, interest = round2_(bal * pr);
      const principal = last ? round2_(bal) : round2_(emi - interest);
      bal = last ? 0 : round2_(bal - principal);
      rows.push({ interest: interest, principal: principal, balance: bal });
    }
  } else {
    for (let k = 1; k <= count; k++) {
      const last = k === count;
      rows.push({ interest: round2_(P * pr * (mult || 1)), principal: last ? P : 0, balance: last ? 0 : P });
    }
  }
  return rows;
}

function planLoan_(data) {
  const P = Number(data.loanAmount), n = parseInt(data.tenure, 10), rate = Number(data.interestRate);
  const start = parseDateIN_(data.startDate);
  if (!(P > 0) || !(n > 0) || !(rate >= 0) || !start) return null;
  const type = data.loanType === 'EMI' ? 'EMI' : (data.loanType === 'Flexible' ? 'Flexible' : 'Interest Only');
  const freq = FREQ_PER_YEAR_[data.frequency] ? data.frequency : 'Monthly';
  const cnt = type === 'Flexible' ? 0 : installments_(freq, n);
  const pr = periodRate_(rate, data.interestType, freq);
  const sched = type === 'Flexible' ? [] : buildSchedule_(P, pr, cnt, type, freq === 'One Time' ? n : 1);
  const first = sched[0];
  return {
    P: P, n: n, rate: type === 'Flexible' ? 0 : rate, start: start, type: type, freq: freq, cnt: cnt, sched: sched,
    instalment: type === 'Flexible' ? 0 : ((type === 'EMI' || cnt === 1) ? round2_(first.interest + first.principal) : first.interest),
    total: round2_(P + sched.reduce((s, r) => s + r.interest, 0)),
    end: dueDate_(start, freq, type === 'Flexible' ? n : cnt, n)
  };
}

function principalOutstanding_(loan) {
  const prepaid = sheetToObjects_(SHEET_NAMES.PAYMENTS)
    .filter(p => p.LoanID === loan.LoanID && p.EMINumber === 'Principal')
    .reduce((s, p) => s + (Number(p.Amount) || 0), 0);
  const paidPrin = getEMIScheduleForLoan_(loan.LoanID).filter(e => e.Status === 'Paid')
    .reduce((s, e) => s + (Number(e.Principal) || 0), 0);
  return round2_(Math.max(0, Number(loan.LoanAmount) - prepaid - paidPrin));
}

function createLoan(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const plan = planLoan_(data);
    if (!data.customerId || !plan) return { success: false, message: 'Please enter a valid customer, amount, rate, tenure and start date.' };
    const loanId = generateId_('LN');
    getSheet_(SHEET_NAMES.LOANS).appendRow([
      loanId, data.customerId, data.customerName, plan.P, plan.rate, data.interestType, plan.n,
      plan.instalment, plan.total, 0, plan.P,
      formatDateIN_(plan.start), formatDateIN_(plan.end), 0, plan.cnt, 'Active',
      formatDateIN_(new Date()), data.notes || '', plan.type, plan.freq
    ]);
    generateEMISchedule_(loanId, data.customerId, data.customerName, plan);
    return { success: true, loanId: loanId, emi: plan.instalment, totalPayable: plan.total, message: 'Loan created successfully!' };
  } catch (e) {
    return { success: false, message: 'Error: ' + e.message };
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function generateEMISchedule_(loanId, customerId, customerName, plan) {
  const sheet = getSheet_(SHEET_NAMES.EMI_SCHEDULE);
  const rows = plan.sched.map((r, k) => [
    generateId_('EMI'), loanId, customerId, customerName, k + 1,
    formatDateIN_(dueDate_(plan.start, plan.freq, k + 1, plan.n)),
    round2_(r.interest + r.principal), r.principal, r.interest, r.balance,
    '', '', '', 'Pending', 0, ''
  ]);
  if (!rows.length) return;   // Flexible loans have no fixed schedule
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

// Part-payment / principal reduction
function payPrincipal(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const amt = Number(data.amount);
    const loan = getAllLoans().find(l => l.LoanID === data.loanId);
    if (!loan || loan.Status !== 'Active') return { success: false, message: 'Active loan not found.' };
    if (!(amt > 0)) return { success: false, message: 'Enter a valid amount.' };

    const remaining = principalOutstanding_(loan);
    if (amt > remaining + 0.001) return { success: false, message: 'Amount exceeds principal outstanding (' + remaining + ').' };

    const newRem = round2_(remaining - amt);
    const payDate = parseDateIN_(data.paymentDate) || today_();
    getSheet_(SHEET_NAMES.PAYMENTS).appendRow([
      generateId_('PAY'), loan.LoanID, loan.CustomerID, loan.CustomerName, 'Principal', amt,
      formatDateIN_(payDate), data.paymentMode || 'Cash', data.receivedBy || '', data.remarks || '',
      Utilities.formatDate(new Date(), tz_(), 'dd/MM/yyyy HH:mm:ss')
    ]);

    // Re-price upcoming installments on the reduced principal
    const type = loan.LoanType || 'Interest Only', freq = loan.Frequency || 'Monthly';
    const cnt = installments_(freq, loan.Tenure);
    const pr = periodRate_(loan.InterestRate, loan.InterestType, freq);
    const mult = freq === 'One Time' ? Number(loan.Tenure) : 1;
    const sh = getSheet_(SHEET_NAMES.EMI_SCHEDULE);
    const d = sh.getDataRange().getValues();
    const targets = [];
    let lastRow = -1;
    for (let i = 1; i < d.length; i++) {
      if (d[i][1] !== loan.LoanID) continue;
      const st = d[i][13];
      if (!(st === 'Pending' || st === 'Partial')) continue;
      if (newRem === 0) { sh.getRange(i + 1, 14).setValue('Closed'); continue; }
      if (Number(d[i][4]) === cnt) lastRow = i;
      const due = parseDateIN_(d[i][5]);
      if (st === 'Pending' && due && due > payDate) targets.push(i);
    }
    if (newRem > 0) {
      if (type === 'EMI') {
        if (targets.length) {
          const s = buildSchedule_(newRem, pr, targets.length, 'EMI', mult);
          targets.forEach((i, k) => sh.getRange(i + 1, 7, 1, 4).setValues([[round2_(s[k].interest + s[k].principal), s[k].principal, s[k].interest, s[k].balance]]));
        }
      } else {
        targets.forEach(i => {
          const isLast = Number(d[i][4]) === cnt, interest = round2_(newRem * pr * mult), princ = isLast ? newRem : 0;
          sh.getRange(i + 1, 7, 1, 4).setValues([[round2_(interest + princ), princ, interest, isLast ? 0 : newRem]]);
        });
        if (lastRow >= 0 && targets.indexOf(lastRow) < 0) {
          const interest = Number(d[lastRow][8]);
          sh.getRange(lastRow + 1, 7, 1, 4).setValues([[round2_(interest + newRem), newRem, interest, 0]]);
        }
      }
    }
    updateLoanTotals_(loan.LoanID);
    return { success: true, message: newRem === 0 ? 'Fully repaid — loan closed!' : (loan.LoanType === 'Flexible' ? 'Repayment recorded. Balance: ' + newRem + '.' : 'Principal part-payment recorded. Interest now calculated on ' + newRem + '.') };
  } catch (e) {
    return { success: false, message: 'Error: ' + e.message };
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function deleteRowsByLoan_(sheetName, loanId) {
  const sh = getSheet_(sheetName);
  const d = sh.getDataRange().getValues();
  for (let i = d.length - 1; i >= 1; i--) {
    if (d[i][1] === loanId) sh.deleteRow(i + 1);
  }
}

function updateLoan(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const sh = getSheet_(SHEET_NAMES.LOANS);
    const d = sh.getDataRange().getValues();
    let idx = -1;
    for (let i = 1; i < d.length; i++) { if (d[i][0] === data.loanId) { idx = i; break; } }
    if (idx < 0) return { success: false, message: 'Loan not found.' };
    const row = idx + 1;
    sh.getRange(row, 18).setValue(String(data.notes || '').trim());

    if (sheetToObjects_(SHEET_NAMES.PAYMENTS).some(p => p.LoanID === data.loanId)) {
      return { success: true, message: 'Loan has payments, so only the notes were updated.' };
    }
    const plan = planLoan_(data);
    if (!plan) return { success: false, message: 'Please enter a valid amount, rate, tenure and start date.' };
    deleteRowsByLoan_(SHEET_NAMES.EMI_SCHEDULE, data.loanId);
    sh.getRange(row, 4, 1, 12).setValues([[plan.P, plan.rate, data.interestType, plan.n, plan.instalment, plan.total, 0, plan.P,
      formatDateIN_(plan.start), formatDateIN_(plan.end), 0, plan.cnt]]);
    sh.getRange(row, 16).setValue('Active');
    sh.getRange(row, 19, 1, 2).setValues([[plan.type, plan.freq]]);
    generateEMISchedule_(data.loanId, d[idx][1], d[idx][2], plan);
    return { success: true, emi: plan.instalment, message: 'Loan updated and schedule regenerated.' };
  } catch (e) {
    return { success: false, message: 'Error: ' + e.message };
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function deleteLoan(loanId, withPayments) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const sh = getSheet_(SHEET_NAMES.LOANS);
    const d = sh.getDataRange().getValues();
    let row = -1;
    for (let i = 1; i < d.length; i++) { if (d[i][0] === loanId) { row = i + 1; break; } }
    if (row < 0) return { success: false, message: 'Loan not found.' };

    const payCount = sheetToObjects_(SHEET_NAMES.PAYMENTS).filter(p => p.LoanID === loanId).length;
    if (payCount && !withPayments) {
      return { success: false, needsConfirm: true, paymentCount: payCount, message: 'This loan has recorded payments.' };
    }
    deleteRowsByLoan_(SHEET_NAMES.EMI_SCHEDULE, loanId);
    deleteRowsByLoan_(SHEET_NAMES.PAYMENTS, loanId);
    sh.deleteRow(row);
    return { success: true, message: 'Loan deleted.' };
  } catch (e) {
    return { success: false, message: 'Error: ' + e.message };
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function getAllLoans() {
  return sheetToObjects_(SHEET_NAMES.LOANS).map(l => {
    l.LoanType = l.LoanType || 'Interest Only';
    l.Frequency = l.Frequency || 'Monthly';
    return l;
  });
}

function getLoansByCustomer(customerId) {
  return getAllLoans().filter(l => l.CustomerID === customerId);
}

function getLoanDetail(loanId) {
  const loan = getAllLoans().find(l => l.LoanID === loanId);
  if (!loan) return null;
  loan.emiSchedule = getEMIScheduleForLoan_(loanId);
  loan.payments = sheetToObjects_(SHEET_NAMES.PAYMENTS).filter(p => p.LoanID === loanId).reverse();
  return loan;
}

function getEMIScheduleForLoan_(loanId) {
  const sheet = getSheet_(SHEET_NAMES.EMI_SCHEDULE);
  const data  = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  const today = today_();
  const schedule = [];

  for (let i = 1; i < data.length; i++) {
    if (data[i][1] === loanId) {
      const emi = {};
      Object.assign(emi, rowToObj_(headers, data[i]));
      if (emi.Status === 'Pending') {
        const dd = parseDateIN_(emi.DueDate);
        if (dd && dd < today) {
          emi.Status = 'Overdue';
          emi.daysOverdue = Math.floor((today - dd) / 86400000);
        }
      }
      emi.rowIndex = i + 1;
      schedule.push(emi);
    }
  }
  return schedule;
}

// ═══════════════════════════════════════════════════════
//  EMI PAYMENT OPERATIONS
// ═══════════════════════════════════════════════════════

function markEMIPaid(data) {
  try {
    const emiSheet = getSheet_(SHEET_NAMES.EMI_SCHEDULE);
    const emiData  = emiSheet.getDataRange().getValues();
    const headers  = emiData[0];

    let rowIdx = -1, emiRow = null;
    for (let i = 1; i < emiData.length; i++) {
      if (emiData[i][0] === data.emiId) {
        rowIdx = i + 1;
        emiRow = {};
        headers.forEach((h, j) => { emiRow[h] = emiData[i][j]; });
        break;
      }
    }
    if (!emiRow) return { success: false, message: 'EMI record not found!' };

    if (emiRow.Status === 'Paid') return { success: false, message: 'This EMI is already fully paid.' };
    const prevPaid    = Number(emiRow.PaidAmount) || 0;
    const paidAmt     = Number(data.amount) || (Number(emiRow.EMIAmount) - prevPaid);
    if (!(paidAmt > 0)) return { success: false, message: 'Enter a valid payment amount.' };
    const paymentDate = data.paymentDate ? formatDateIN_(data.paymentDate) : formatDateIN_(new Date());
    const paymentMode = data.paymentMode || 'Cash';
    const status      = (prevPaid + paidAmt) >= Number(emiRow.EMIAmount) - 0.01 ? 'Paid' : 'Partial';

    // Update EMI row
    emiSheet.getRange(rowIdx, 11).setValue(Math.round((prevPaid + paidAmt) * 100) / 100);
    emiSheet.getRange(rowIdx, 12).setValue(paymentDate);
    emiSheet.getRange(rowIdx, 13).setValue(paymentMode);
    emiSheet.getRange(rowIdx, 14).setValue(status);
    emiSheet.getRange(rowIdx, 16).setValue(data.remarks || '');

    // Record payment
    const paySheet = getSheet_(SHEET_NAMES.PAYMENTS);
    paySheet.appendRow([
      generateId_('PAY'),
      emiRow.LoanID,
      emiRow.CustomerID,
      emiRow.CustomerName,
      emiRow.EMINumber,
      paidAmt,
      paymentDate,
      paymentMode,
      data.receivedBy || '',
      data.remarks || '',
      Utilities.formatDate(new Date(), tz_(), 'dd/MM/yyyy HH:mm:ss')
    ]);

    // Recalculate loan totals
    updateLoanTotals_(emiRow.LoanID);

    return { success: true, message: 'Payment recorded successfully!' };
  } catch (e) {
    return { success: false, message: 'Error: ' + e.message };
  }
}

function updateLoanTotals_(loanId) {
  const loanSheet = getSheet_(SHEET_NAMES.LOANS);
  const loanData = loanSheet.getDataRange().getValues();
  const pays = sheetToObjects_(SHEET_NAMES.PAYMENTS).filter(p => p.LoanID === loanId);
  const sum = (arr, f) => arr.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const totalPaid = sum(pays, p => p.Amount);
  const prepaid = sum(pays.filter(p => p.EMINumber === 'Principal'), p => p.Amount);
  const sched = getEMIScheduleForLoan_(loanId);

  for (let i = 1; i < loanData.length; i++) {
    if (loanData[i][0] !== loanId) continue;
    const row = i + 1, P = Number(loanData[i][3]);
    const type = loanData[i][18] || 'Interest Only', freq = loanData[i][19] || 'Monthly';
    const cnt = installments_(freq, loanData[i][6]);
    const last = sched.find(e => Number(e.EMINumber) === cnt);
    const flexible = type === 'Flexible';
    const closed = flexible ? (P - prepaid) <= 0.001 : (!!last && (last.Status === 'Paid' || last.Status === 'Closed'));
    const paidPrin = sum(sched.filter(e => e.Status === 'Paid'), e => e.Principal);
    const outstanding = closed ? 0 : round2_(Math.max(0, P - prepaid - paidPrin));
    const emisPaid = flexible ? 0 : (closed ? cnt : sched.filter(e => e.Status === 'Paid').length);
    const totalInterest = sum(sched.filter(e => e.Status !== 'Closed'), e => e.Interest);
    const next = sched.find(e => e.Status !== 'Paid' && e.Status !== 'Closed');

    loanSheet.getRange(row, 8).setValue(closed || !next ? 0 : Number(type === 'EMI' ? next.EMIAmount : next.Interest));
    loanSheet.getRange(row, 9).setValue(round2_(P + totalInterest));
    loanSheet.getRange(row, 10).setValue(round2_(totalPaid));
    loanSheet.getRange(row, 11).setValue(outstanding);
    loanSheet.getRange(row, 14).setValue(emisPaid);
    loanSheet.getRange(row, 15).setValue(flexible ? 0 : Math.max(0, cnt - emisPaid));
    if (closed) loanSheet.getRange(row, 16).setValue('Closed');
    break;
  }
}

// ═══════════════════════════════════════════════════════
//  ALL EMIs (for EMI Tracker page)
// ═══════════════════════════════════════════════════════

function getAllEMIs() {
  try {
    const sheet = getSheet_(SHEET_NAMES.EMI_SCHEDULE);
    const data  = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];
    const headers = data[0];
    const today = today_();

    return data.slice(1).map((row, idx) => {
      const emi = {};
      Object.assign(emi, rowToObj_(headers, row));
      if (emi.Status === 'Pending') {
        const dd = parseDateIN_(emi.DueDate);
        if (dd && dd < today) {
          emi.Status = 'Overdue';
          emi.daysOverdue = Math.floor((today - dd) / 86400000);
        }
      }
      return emi;
    });
  } catch (e) { return []; }
}

// ═══════════════════════════════════════════════════════
//  DASHBOARD DATA
// ═══════════════════════════════════════════════════════

function getDashboardData() {
  try {
    const customers = getAllCustomers();
    const loans     = getAllLoans();

    const activeLoansList = loans.filter(l => l.Status === 'Active');
    const closedLoansList = loans.filter(l => l.Status === 'Closed');

    let totalDisbursed = 0, totalOutstanding = 0, totalCollected = 0, monthlyTarget = 0;

    activeLoansList.forEach(l => {
      totalDisbursed  += Number(l.LoanAmount)   || 0;
      totalOutstanding += Number(l.Outstanding)  || 0;
      totalCollected  += Number(l.TotalPaid)     || 0;
      monthlyTarget   += Number(l.EMIAmount)     || 0;
    });
    closedLoansList.forEach(l => {
      totalDisbursed += Number(l.LoanAmount) || 0;
      totalCollected += Number(l.TotalPaid)  || 0;
    });

    const overdueEMIs  = getOverdueEMIs_();
    const upcomingEMIs = getUpcomingEMIs_(7);
    const todayCol     = getTodayCollections_();
    const recentPay    = getRecentPayments_(10);
    const monthlyData  = getMonthlyCollectionData_();

    return safe_({
      totalCustomers:  customers.length,
      activeCustomers: customers.filter(c => c.Status === 'Active').length,
      totalLoans:      loans.length,
      activeLoans:     activeLoansList.length,
      closedLoans:     closedLoansList.length,
      totalDisbursed:  totalDisbursed,
      totalOutstanding: totalOutstanding,
      totalCollected:  totalCollected,
      monthlyTarget:   monthlyTarget,
      recentCustomers: customers.slice(-5).reverse(),
      overdueCount:    overdueEMIs.length,
      overdueEMIs:     overdueEMIs.slice(0, 10),
      upcomingEMIs:    upcomingEMIs.slice(0, 10),
      todayCollections: todayCol,
      recentPayments:  recentPay,
      monthlyData:     monthlyData
    });
  } catch (e) {
    Logger.log('Dashboard error: ' + e.message);
    return { error: e.message };
  }
}

function getOverdueEMIs_() {
  const sheet = getSheet_(SHEET_NAMES.EMI_SCHEDULE);
  const data  = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  const today = today_();
  const overdue = [];

  for (let i = 1; i < data.length; i++) {
    const status = data[i][13];
    if (status === 'Pending' || status === 'Overdue' || status === 'Partial') {
      const dd = parseDateIN_(data[i][5]);
      if (dd && dd < today) {
        const emi = {};
        Object.assign(emi, rowToObj_(headers, data[i]));
        emi.daysOverdue = Math.floor((today - dd) / 86400000);
        emi.Status = 'Overdue';
        overdue.push(emi);
      }
    }
  }
  return overdue.sort((a, b) => b.daysOverdue - a.daysOverdue);
}

function getUpcomingEMIs_(days) {
  const sheet = getSheet_(SHEET_NAMES.EMI_SCHEDULE);
  const data  = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  const today = today_();
  const future = new Date(today); future.setDate(future.getDate() + days);
  const upcoming = [];

  for (let i = 1; i < data.length; i++) {
    if (data[i][13] === 'Pending') {
      const dd = parseDateIN_(data[i][5]);
      if (dd && dd >= today && dd <= future) {
        const emi = {};
        Object.assign(emi, rowToObj_(headers, data[i]));
        emi.daysUntilDue = Math.floor((dd - today) / 86400000);
        upcoming.push(emi);
      }
    }
  }
  return upcoming.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}

function getTodayCollections_() {
  const sheet = getSheet_(SHEET_NAMES.PAYMENTS);
  const data  = sheet.getDataRange().getValues();
  const todayStr = formatDateIN_(new Date());
  let total = 0, count = 0;

  for (let i = 1; i < data.length; i++) {
    if (formatDateIN_(data[i][6]) === todayStr) {
      total += Number(data[i][5]) || 0;
      count++;
    }
  }
  return { total, count };
}

function getRecentPayments_(limit) {
  const payments = sheetToObjects_(SHEET_NAMES.PAYMENTS);
  return payments.reverse().slice(0, limit);
}

function getPaymentsByCustomer_(customerId) {
  return sheetToObjects_(SHEET_NAMES.PAYMENTS)
    .filter(p => p.CustomerID === customerId)
    .reverse();
}

function getMonthlyCollectionData_() {
  const payments = sheetToObjects_(SHEET_NAMES.PAYMENTS);
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const buckets = {};

  payments.forEach(p => {
    const d = parseDateIN_(p.PaymentDate);
    if (d) {
      const key = monthNames[d.getMonth()] + ' ' + d.getFullYear();
      buckets[key] = (buckets[key] || 0) + (Number(p.Amount) || 0);
    }
  });

  const now = new Date();
  const labels = [], amounts = [];
  for (let m = 5; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const key = monthNames[d.getMonth()] + ' ' + d.getFullYear();
    labels.push(monthNames[d.getMonth()]);
    amounts.push(buckets[key] || 0);
  }
  return { labels, amounts };
}

// ═══════════════════════════════════════════════════════
//  REPORTS
// ═══════════════════════════════════════════════════════

function getOutstandingReport() {
  return getAllLoans()
    .filter(l => l.Status === 'Active')
    .map(l => ({
      CustomerName: l.CustomerName,
      LoanID:       l.LoanID,
      LoanAmount:   l.LoanAmount,
      EMIAmount:    l.EMIAmount,
      TotalPaid:    l.TotalPaid,
      Outstanding:  l.Outstanding,
      EMIsPaid:     l.EMIsPaid,
      EMIsRemaining: l.EMIsRemaining,
      Tenure:       l.Tenure,
      Frequency:    l.Frequency,
      LoanType:     l.LoanType
    }));
}

function getCollectionReport(startDate, endDate) {
  const payments = sheetToObjects_(SHEET_NAMES.PAYMENTS);
  const start = new Date(startDate); start.setHours(0,0,0,0);
  const end   = new Date(endDate);   end.setHours(23,59,59,999);

  return payments.filter(p => {
    const d = parseDateIN_(p.PaymentDate);
    return d && d >= start && d <= end;
  });
}

// ─────────────────── DIAGNOSTIC ───────────────────
function debugCustomers() {
  const ss = getSpreadsheet_();
  Logger.log('Spreadsheet: ' + ss.getName() + ' | timezone: ' + ss.getSpreadsheetTimeZone());
  Logger.log('Customer rows in sheet: ' + Math.max(0, getSheet_(SHEET_NAMES.CUSTOMERS).getLastRow() - 1));
  const list = getAllCustomers();
  Logger.log('getAllCustomers() returned ' + list.length + ' customers');
  Logger.log(JSON.stringify(list.slice(0, 2)));
}
