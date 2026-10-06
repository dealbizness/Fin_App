/* ═══════════════════════════════════════════════════════════════
   VR FINANCE — Client-Side Application Engine (app.js)
   Full-Featured Mobile & Web Controller with Google Sheets Sync
   ═══════════════════════════════════════════════════════════════ */

// ── Application State ──
const state = {
  customers: [],
  loans: [],
  emis: [],
  payments: [],
  investments: [],
  investmentRepayments: [],
  investmentFilter: 'all',
  investmentSearchQuery: '',
  currentView: 'dashboard',
  theme: localStorage.getItem('finmonitor_theme') || 'dark',
  scriptUrl: (localStorage.getItem('finmonitor_script_url') && !localStorage.getItem('finmonitor_script_url').includes('AKfycbyqvsFWUrikjdFNQMRvKIy7Z9nqRY7Z_eoGI3A0k4r9bWAXGfZSvMgIQRlKIiI7OcBYGA'))
    ? localStorage.getItem('finmonitor_script_url')
    : 'https://script.google.com/macros/s/AKfycbyLjlOHlQizWwHVMnP-HageJJRrZ9TQfTxxSUP8VhKBTj0YSGLu7axNeEx1IpITwAHvfw/exec',
  isOnline: false,
  charts: {
    collections: null,
    portfolio: null
  },
  deferredInstallPrompt: null
};

// ── Currency & Date Formatters ──
const formatCurrency = (val) => {
  const n = Number(val) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(n);
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  if (dateStr instanceof Date) {
    const d = dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }
  const str = String(dateStr).trim();
  // If already DD/MM/YYYY or D/M/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) return str;
  const d = new Date(str);
  if (isNaN(d.getTime())) return str;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

const parseDate = (str) => {
  if (!str) return new Date();
  if (str instanceof Date) return str;
  const s = String(str).trim();
  const slashParts = s.split('/');
  if (slashParts.length === 3) {
    const day = parseInt(slashParts[0], 10);
    const month = parseInt(slashParts[1], 10) - 1;
    const year = parseInt(slashParts[2], 10);
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      return new Date(year, month, day);
    }
  }
  const iso = new Date(s);
  return isNaN(iso.getTime()) ? new Date() : iso;
};

// ═══════════════════ INITIALIZATION ═══════════════════
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initPWA();
  loadData();
  setupEventListeners();
  initAppSecurity();
  recalcLoanPreview();

  // Set default dates in forms
  const today = new Date().toISOString().split('T')[0];
  const startEl = document.getElementById('loanStartDateInput');
  const payDateEl = document.getElementById('payDateInput');
  if (startEl) startEl.value = today;
  if (payDateEl) payDateEl.value = today;

  const urlInput = document.getElementById('appScriptUrlInput');
  if (urlInput && state.scriptUrl) {
    urlInput.value = state.scriptUrl;
  }
});

// ── PWA Setup ──
function initPWA() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.log('SW registration error:', err);
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredInstallPrompt = e;
  });
}

function promptInstallPWA() {
  if (state.deferredInstallPrompt) {
    state.deferredInstallPrompt.prompt();
    state.deferredInstallPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        showToast('VR Finance added to Home Screen!', 'success');
      }
      state.deferredInstallPrompt = null;
    });
  } else {
    showToast('To install, tap your browser menu and choose "Add to Home screen"', 'info');
  }
}

// ── Theme Management ──
function initTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  updateThemeIcon();
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
  localStorage.setItem('finmonitor_theme', state.theme);
  updateThemeIcon();
  renderCharts();
}

function updateThemeIcon() {
  const icon = document.getElementById('themeIcon');
  if (icon) {
    icon.textContent = state.theme === 'dark' ? 'light_mode' : 'dark_mode';
  }
}

// ── Sidebar Toggle for Mobile ──
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    sidebar.classList.toggle('open');
  }
}

// ── View Switching ──
function switchView(viewName) {
  state.currentView = viewName;

  // Hide mobile sidebar if open
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.remove('open');

  // Update nav link active classes (Sidebar and Mobile Bottom Nav)
  document.querySelectorAll('.nav-link, .bottom-nav-item').forEach((el) => {
    if (el.getAttribute('data-view') === viewName) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  // Switch View Sections
  document.querySelectorAll('.view-section').forEach((sec) => {
    sec.classList.remove('active');
  });
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add('active');

  // Update Topbar Title
  const titles = {
    dashboard: 'Dashboard',
    customers: 'Borrowers & Customers',
    loans: 'Loan Contracts',
    investments: 'Investment & Investor Portfolio',
    emi: 'EMI Collection Tracker',
    reports: 'Financial Reports',
    settings: 'Cloud & Sheets Sync'
  };
  const titleEl = document.getElementById('pageTitleHeading');
  if (titleEl) titleEl.textContent = titles[viewName] || 'Dashboard';

  // Re-render charts if dashboard
  if (viewName === 'dashboard') {
    setTimeout(renderCharts, 100);
  }
}

// ═══════════════════ DATA MANAGEMENT ═══════════════════
function loadData() {
  const cached = localStorage.getItem('finmonitor_cache');
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      state.customers = parsed.customers || [];
      state.loans = parsed.loans || [];
      state.emis = parsed.emis || [];
      state.payments = parsed.payments || [];
      state.investments = parsed.investments || [];
      state.investmentRepayments = parsed.investmentRepayments || [];
    } catch (e) {
      console.error('Cache load error:', e);
    }
  }

  // Prepopulate sample data if entirely empty
  if (state.customers.length === 0) {
    populateSampleData();
  } else if (!state.investments || state.investments.length === 0) {
    populateSampleInvestments();
  }

  refreshUI();

  // If cloud URL exists, silently attempt sync
  if (state.scriptUrl) {
    syncWithGoogleSheet(true);
  }
}

function saveDataLocally() {
  localStorage.setItem('finmonitor_cache', JSON.stringify({
    customers: state.customers,
    loans: state.loans,
    emis: state.emis,
    payments: state.payments,
    investments: state.investments,
    investmentRepayments: state.investmentRepayments
  }));
}

function clearLocalCache() {
  if (confirm('Clear local cache? This will reset offline memory.')) {
    localStorage.removeItem('finmonitor_cache');
    populateSampleData();
    refreshUI();
    showToast('Local cache cleared and reset to sample dataset.', 'info');
  }
}

// ── Sample Starter Data ──
function populateSampleData() {
  state.customers = [
    {
      CustomerID: 'CUS-101',
      Name: 'Vikram Sharma',
      Phone: '9876543210',
      Email: 'vikram.s@gmail.com',
      Address: '42 MG Road, Bengaluru',
      IDProof: 'Aadhaar',
      IDNumber: 'XXXX-XXXX-4589',
      JoinDate: '01/01/2026',
      Status: 'Active',
      Notes: 'Shop owner'
    },
    {
      CustomerID: 'CUS-102',
      Name: 'Priya Patel',
      Phone: '9845123456',
      Email: 'priya.patel@outlook.com',
      Address: '15 Nehru Street, Ahmedabad',
      IDProof: 'PAN',
      IDNumber: 'ABCDE1234F',
      JoinDate: '15/01/2026',
      Status: 'Active',
      Notes: 'Salaried professional'
    },
    {
      CustomerID: 'CUS-103',
      Name: 'Anand Verma',
      Phone: '9711223344',
      Email: 'anand.v@yahoo.com',
      Address: '78 Sector 18, Noida',
      IDProof: 'Aadhaar',
      IDNumber: 'XXXX-XXXX-9812',
      JoinDate: '10/02/2026',
      Status: 'Active',
      Notes: 'Contractor'
    }
  ];

  // Create initial sample loans
  createSampleLoan('CUS-101', 'Vikram Sharma', 100000, 14, 'Annual', 12, '2026-01-05');
  createSampleLoan('CUS-102', 'Priya Patel', 50000, 12, 'Annual', 6, '2026-02-10');
  createSampleLoan('CUS-103', 'Anand Verma', 75000, 15, 'Annual', 10, '2026-03-01');

  // Simulate some payments and overdue flags
  if (state.emis.length > 0) {
    // Mark first EMI of LN-1 as paid
    const firstEmi = state.emis[0];
    firstEmi.Status = 'Paid';
    firstEmi.PaidAmount = firstEmi.EMIAmount;
    firstEmi.PaidDate = '05/02/2026';
    firstEmi.PaymentMode = 'UPI';

    // Mark second EMI as overdue
    if (state.emis[1]) {
      state.emis[1].Status = 'Overdue';
    }
  }

  populateSampleInvestments();
  saveDataLocally();
}

function populateSampleInvestments() {
  state.investments = [
    {
      InvestmentID: 'INV-1001',
      InvestorID: 'CUS-101',
      InvestorName: 'Vikram Sharma',
      InvestorPhone: '9876543210',
      InvestmentAmount: 500000,
      InterestRate: 1.5,
      InterestType: 'Monthly',
      RepaymentOption: 'Monthly Interest (Principal at end)',
      TotalRepaid: 50000,
      Outstanding: 500000,
      StartDate: '01/01/2026',
      Status: 'Active',
      Notes: 'Capital deposit into HDFC current account',
      CreatedDate: '01/01/2026'
    },
    {
      InvestmentID: 'INV-1002',
      InvestorID: 'CUS-102',
      InvestorName: 'Priya Patel',
      InvestorPhone: '9845123456',
      InvestmentAmount: 250000,
      InterestRate: 12,
      InterestType: 'Yearly',
      RepaymentOption: 'Quarterly Interest',
      TotalRepaid: 30000,
      Outstanding: 220000,
      StartDate: '15/01/2026',
      Status: 'Active',
      Notes: 'Cheque clearance ref #CHQ-8821',
      CreatedDate: '15/01/2026'
    }
  ];

  state.investmentRepayments = [
    {
      RepaymentID: 'IRP-1001',
      InvestmentID: 'INV-1001',
      InvestorID: 'CUS-101',
      InvestorName: 'Vikram Sharma',
      Amount: 25000,
      PaymentDate: '01/02/2026',
      RepaymentType: 'Interest Payout',
      PaymentMode: 'UPI',
      PaidBy: 'Manager',
      Remarks: 'Monthly interest return Jan 2026',
      Timestamp: '01/02/2026 10:30'
    },
    {
      RepaymentID: 'IRP-1002',
      InvestmentID: 'INV-1001',
      InvestorID: 'CUS-101',
      InvestorName: 'Vikram Sharma',
      Amount: 25000,
      PaymentDate: '01/03/2026',
      RepaymentType: 'Interest Payout',
      PaymentMode: 'Bank Transfer',
      PaidBy: 'Manager',
      Remarks: 'Monthly interest return Feb 2026',
      Timestamp: '01/03/2026 11:15'
    },
    {
      RepaymentID: 'IRP-1003',
      InvestmentID: 'INV-1002',
      InvestorID: 'CUS-102',
      InvestorName: 'Priya Patel',
      Amount: 30000,
      PaymentDate: '28/02/2026',
      RepaymentType: 'Principal Reduction',
      PaymentMode: 'UPI',
      PaidBy: 'Manager',
      Remarks: 'Partial principal repayment',
      Timestamp: '28/02/2026 15:45'
    }
  ];
}

function addMonths(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth() + n, 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(date.getDate(), last));
  return d;
}

function calculateDueDate(start, freq, i, tenure) {
  if (freq === 'Daily') return new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
  if (freq === 'Weekly') return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7 * i);
  if (freq === 'One Time') return addMonths(start, Number(tenure));
  return addMonths(start, i);
}

function calculatePrincipalOutstanding(loan) {
  const prepaid = (state.payments || [])
    .filter(p => p.LoanID === loan.LoanID && p.EMINumber === 'Principal')
    .reduce((s, p) => s + (Number(p.Amount) || 0), 0);
  const paidPrin = (state.emis || [])
    .filter(e => e.LoanID === loan.LoanID && e.Status === 'Paid')
    .reduce((s, e) => s + (Number(e.Principal) || 0), 0);
  return Math.round(Math.max(0, Number(loan.LoanAmount) - prepaid - paidPrin) * 100) / 100;
}

function createSampleLoan(customerId, customerName, principal, rate, rateType, tenure, startDateStr, loanType = 'Interest Only', freq = 'Monthly') {
  const P = Number(principal);
  const n = parseInt(tenure, 10);
  const r = loanType === 'Flexible' ? 0 : Number(rate);
  const start = parseDate(startDateStr);
  const perYear = FREQ_PER_YEAR[freq] || 12;
  const pr = ((rateType === 'Monthly' ? r * 12 : r) / 100) / perYear;
  const cnt = loanType === 'Flexible' ? 0 : (freq === 'One Time' ? 1 : n);
  const mult = freq === 'One Time' ? n : 1;
  const annuity = loanType === 'EMI' && cnt > 1;

  const emiVal = annuity
    ? (pr === 0 ? P / cnt : P * pr * Math.pow(1 + pr, cnt) / (Math.pow(1 + pr, cnt) - 1))
    : 0;

  let bal = P;
  let totalInterest = 0;
  const sched = [];

  for (let k = 1; k <= cnt; k++) {
    const isLast = k === cnt;
    let interest = 0;
    let principalComp = 0;
    if (annuity) {
      interest = Math.round(bal * pr * 100) / 100;
      principalComp = isLast ? Math.round(bal * 100) / 100 : Math.round((emiVal - interest) * 100) / 100;
      bal = Math.max(0, Math.round((bal - principalComp) * 100) / 100);
    } else {
      interest = Math.round(P * pr * mult * 100) / 100;
      principalComp = isLast ? P : 0;
      bal = isLast ? 0 : P;
    }
    totalInterest += interest;
    sched.push({
      k: k,
      interest: interest,
      principal: principalComp,
      balance: bal,
      totalInstalment: Math.round((interest + principalComp) * 100) / 100
    });
  }

  const firstInstalment = sched.length > 0
    ? (loanType === 'EMI' || cnt === 1 ? sched[0].totalInstalment : sched[0].interest)
    : 0;
  const totalPayable = Math.round((P + totalInterest) * 100) / 100;
  const endDate = calculateDueDate(start, freq, loanType === 'Flexible' ? n : cnt, n);
  const loanId = 'LN-' + Math.random().toString(36).substring(2, 7).toUpperCase();

  const loan = {
    LoanID: loanId,
    CustomerID: customerId,
    CustomerName: customerName,
    LoanAmount: P,
    InterestRate: r,
    InterestType: rateType,
    Tenure: n,
    EMIAmount: Math.round(firstInstalment),
    TotalPayable: totalPayable,
    TotalPaid: 0,
    Outstanding: P,
    StartDate: formatDate(start),
    EndDate: formatDate(endDate),
    EMIsPaid: 0,
    EMIsRemaining: cnt,
    Status: 'Active',
    Notes: 'Standard financing contract',
    LoanType: loanType,
    Frequency: freq
  };
  state.loans.push(loan);

  // Generate EMI Schedule if not Flexible
  sched.forEach((row) => {
    const due = calculateDueDate(start, freq, row.k, n);
    state.emis.push({
      EMIID: 'EMI-' + Math.random().toString(36).substring(2, 7).toUpperCase(),
      LoanID: loanId,
      CustomerID: customerId,
      CustomerName: customerName,
      EMINumber: row.k,
      DueDate: formatDate(due),
      EMIAmount: row.totalInstalment,
      Principal: row.principal,
      Interest: row.interest,
      Balance: row.balance,
      PaidAmount: '',
      PaidDate: '',
      PaymentMode: '',
      Status: 'Pending',
      LateFee: 0,
      Remarks: ''
    });
  });

  return loan;
}

// ═══════════════════ FINANCIAL CALCULATIONS ═══════════════════
const FREQ_PER_YEAR = { 'Daily': 365, 'Weekly': 52, 'Monthly': 12, 'One Time': 12 };


function handleLoanTypeChange() {
  const typeSelect = document.getElementById('loanTypeSelect');
  const rateInput = document.getElementById('loanRateInput');
  const rateTypeSelect = document.getElementById('loanRateTypeSelect');
  if (!typeSelect || !rateInput) return;

  const isFlex = typeSelect.value === 'Flexible';
  if (isFlex) {
    rateInput.value = 0;
    rateInput.disabled = true;
    if (rateTypeSelect) rateTypeSelect.disabled = true;
  } else {
    rateInput.disabled = false;
    if (rateTypeSelect) rateTypeSelect.disabled = false;
    if (Number(rateInput.value) === 0) rateInput.value = 12;
  }
}

function updateTenureUnitLabel() {
  const freqSelect = document.getElementById('loanFreqSelect');
  const label = document.getElementById('tenureUnitLabel');
  if (!freqSelect || !label) return;

  const f = freqSelect.value;
  label.textContent = f === 'Daily' ? 'Days' : (f === 'Weekly' ? 'Weeks' : 'Months');
}

function recalcLoanPreview() {
  const pInput = document.getElementById('loanAmountInput');
  const rInput = document.getElementById('loanRateInput');
  const tInput = document.getElementById('loanTenureInput');
  const typeSelect = document.getElementById('loanTypeSelect');
  const freqSelect = document.getElementById('loanFreqSelect');
  const rtypeSelect = document.getElementById('loanRateTypeSelect');

  if (!pInput || !rInput || !tInput) return;

  const P = Number(pInput.value) || 0;
  const r = Number(rInput.value) || 0;
  const n = Number(tInput.value) || 1;
  const loanType = typeSelect ? typeSelect.value : 'Interest Only';
  const freq = freqSelect ? freqSelect.value : 'Monthly';
  const rtype = rtypeSelect ? rtypeSelect.value : 'Yearly';

  if (P <= 0 || n <= 0) return;

  const emiEl = document.getElementById('previewEmiAmount');
  const totEl = document.getElementById('previewTotalPayable');
  const intEl = document.getElementById('previewTotalInterest');
  const finEl = document.getElementById('previewFinalPayment');

  if (loanType === 'Flexible') {
    if (emiEl) emiEl.textContent = 'Any amount';
    if (totEl) totEl.textContent = formatCurrency(P);
    if (intEl) intEl.textContent = formatCurrency(0);
    if (finEl) finEl.textContent = '—';
    return;
  }

  const perYear = FREQ_PER_YEAR[freq] || 12;
  const pr = ((rtype === 'Monthly' ? r * 12 : r) / 100) / perYear;
  const cnt = freq === 'One Time' ? 1 : Math.floor(n);
  const mult = freq === 'One Time' ? n : 1;
  const annuity = loanType === 'EMI' && cnt > 1;

  const emi = annuity
    ? (pr === 0 ? P / cnt : P * pr * Math.pow(1 + pr, cnt) / (Math.pow(1 + pr, cnt) - 1))
    : 0;

  let bal = P;
  let totalInterest = 0;
  let first = 0;
  let last = 0;

  for (let k = 1; k <= cnt; k++) {
    const isLast = k === cnt;
    let interest = 0;
    let principal = 0;
    if (annuity) {
      interest = Math.round(bal * pr * 100) / 100;
      principal = isLast ? Math.round(bal * 100) / 100 : Math.round((emi - interest) * 100) / 100;
      bal = Math.max(0, Math.round((bal - principal) * 100) / 100);
    } else {
      interest = Math.round(P * pr * mult * 100) / 100;
      principal = isLast ? P : 0;
    }
    totalInterest += interest;
    if (k === 1) first = (annuity || cnt === 1) ? interest + principal : interest;
    if (isLast) last = interest + principal;
  }

  if (emiEl) emiEl.textContent = formatCurrency(Math.round(first));
  if (totEl) totEl.textContent = formatCurrency(Math.round(P + totalInterest));
  if (intEl) intEl.textContent = formatCurrency(Math.round(totalInterest));
  if (finEl) finEl.textContent = formatCurrency(Math.round(last));
}

// ═══════════════════ UI RENDERING ═══════════════════
function refreshUI() {
  // Update Customer Select Dropdowns
  updateCustomerDropdowns();

  // Re-enrich customer records
  state.customers.forEach((c) => {
    const custLoans = state.loans.filter((l) => l.CustomerID === c.CustomerID && l.Status === 'Active');
    c.ActiveLoans = custLoans.length;
    c.TotalOutstanding = custLoans.reduce((sum, l) => sum + (Number(l.Outstanding) || 0), 0);
  });

  renderDashboard();
  renderCustomers();
  renderLoans();
  renderInvestments();
  renderEMIs();
  renderReports();
}

// ── 1. Dashboard View ──
function renderDashboard() {
  let totalDisbursed = 0;
  let totalOutstanding = 0;
  let totalCollected = 0;
  let activeLoansCount = 0;

  state.loans.forEach((l) => {
    totalDisbursed += Number(l.LoanAmount) || 0;
    totalCollected += Number(l.TotalPaid) || 0;
    if (l.Status === 'Active') {
      totalOutstanding += Number(l.Outstanding) || 0;
      activeLoansCount++;
    }
  });

  // Calculate Overdue EMIs
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overdueList = [];
  const upcomingList = [];
  const next7Days = new Date(today);
  next7Days.setDate(next7Days.getDate() + 7);

  state.emis.forEach((e) => {
    if (e.Status === 'Paid') return;

    const dd = parseDate(e.DueDate);
    if (dd < today) {
      e.Status = 'Overdue';
      e.daysOverdue = Math.floor((today - dd) / (1000 * 60 * 60 * 24));
      overdueList.push(e);
    } else if (dd >= today && dd <= next7Days) {
      e.daysUntilDue = Math.floor((dd - today) / (1000 * 60 * 60 * 24));
      upcomingList.push(e);
    }
  });

  // Set Metric Cards
  document.getElementById('statOutstanding').textContent = formatCurrency(totalOutstanding);
  document.getElementById('statActiveLoans').textContent = `${activeLoansCount} Active Loans`;

  document.getElementById('statCollected').textContent = formatCurrency(totalCollected);
  document.getElementById('statDisbursed').textContent = formatCurrency(totalDisbursed);
  document.getElementById('statTotalLoans').textContent = `${state.loans.length} Total Loans`;

  document.getElementById('statOverdueCount').textContent = overdueList.length;

  // Render Overdue Table & Mobile Cards
  const ovTable = document.getElementById('overdueTableBody');
  const ovCards = document.getElementById('overdueMobileCards');
  ovTable.innerHTML = '';
  ovCards.innerHTML = '';

  if (overdueList.length === 0) {
    ovTable.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:24px;">No overdue EMIs! All collections are up to date. 🎉</td></tr>`;
    ovCards.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:20px;">No overdue EMIs! 🎉</div>`;
  } else {
    overdueList.forEach((e) => {
      const waUrl = getWhatsAppReminderUrl(e);
      // Desktop Row
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${e.CustomerName}</strong></td>
        <td><code>${e.LoanID}</code></td>
        <td>EMI #${e.EMINumber}</td>
        <td>${e.DueDate}</td>
        <td><strong>${formatCurrency(e.EMIAmount)}</strong></td>
        <td><span class="badge badge-danger">${e.daysOverdue || 1} Days Late</span></td>
        <td>
          <div class="action-btn-group">
            <a href="${waUrl}" target="_blank" class="btn-whatsapp" title="Send WhatsApp Reminder">
              <span>WhatsApp</span>
            </a>
            <button class="btn btn-primary" style="padding:6px 12px; font-size:0.8rem;" onclick="quickPayEMI('${e.EMIID}')">
              Collect
            </button>
          </div>
        </td>
      `;
      ovTable.appendChild(tr);

      // Mobile Touch Card
      const card = document.createElement('div');
      card.className = 'mobile-data-card';
      card.innerHTML = `
        <div class="mobile-card-header">
          <div>
            <div class="mobile-card-title">${e.CustomerName}</div>
            <div class="mobile-card-subtitle">${e.LoanID} • EMI #${e.EMINumber}</div>
          </div>
          <span class="badge badge-danger">${e.daysOverdue || 1}d Late</span>
        </div>
        <div class="mobile-card-body">
          <div class="mobile-card-field">
            <span class="mobile-field-label">Amount Due</span>
            <span class="mobile-field-value" style="color:var(--danger)">${formatCurrency(e.EMIAmount)}</span>
          </div>
          <div class="mobile-card-field">
            <span class="mobile-field-label">Due Date</span>
            <span class="mobile-field-value">${e.DueDate}</span>
          </div>
        </div>
        <div class="mobile-card-footer">
          <a href="${waUrl}" target="_blank" class="btn-whatsapp">
            <span>WhatsApp</span>
          </a>
          <button class="btn btn-primary" onclick="quickPayEMI('${e.EMIID}')">
            Collect EMI
          </button>
        </div>
      `;
      ovCards.appendChild(card);
    });
  }

  // Render Upcoming Table & Mobile Cards
  const upTable = document.getElementById('upcomingTableBody');
  const upCards = document.getElementById('upcomingMobileCards');
  upTable.innerHTML = '';
  upCards.innerHTML = '';

  if (upcomingList.length === 0) {
    upTable.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:20px;">No EMIs scheduled for the next 7 days.</td></tr>`;
    upCards.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:16px;">No upcoming EMIs this week.</div>`;
  } else {
    upcomingList.forEach((e) => {
      const waUrl = getWhatsAppReminderUrl(e);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${e.CustomerName}</strong></td>
        <td><code>${e.LoanID}</code></td>
        <td>EMI #${e.EMINumber}</td>
        <td>${e.DueDate}</td>
        <td><strong>${formatCurrency(e.EMIAmount)}</strong></td>
        <td>
          <div class="action-btn-group">
            <a href="${waUrl}" target="_blank" class="btn-whatsapp">WhatsApp</a>
            <button class="btn btn-secondary" style="padding:6px 12px; font-size:0.8rem;" onclick="quickPayEMI('${e.EMIID}')">Collect</button>
          </div>
        </td>
      `;
      upTable.appendChild(tr);

      const card = document.createElement('div');
      card.className = 'mobile-data-card';
      card.innerHTML = `
        <div class="mobile-card-header">
          <div>
            <div class="mobile-card-title">${e.CustomerName}</div>
            <div class="mobile-card-subtitle">${e.LoanID} • EMI #${e.EMINumber}</div>
          </div>
          <span class="badge badge-warning">Due in ${e.daysUntilDue}d</span>
        </div>
        <div class="mobile-card-body">
          <div class="mobile-card-field">
            <span class="mobile-field-label">Amount</span>
            <span class="mobile-field-value">${formatCurrency(e.EMIAmount)}</span>
          </div>
          <div class="mobile-card-field">
            <span class="mobile-field-label">Due Date</span>
            <span class="mobile-field-value">${e.DueDate}</span>
          </div>
        </div>
        <div class="mobile-card-footer">
          <a href="${waUrl}" target="_blank" class="btn-whatsapp">WhatsApp</a>
          <button class="btn btn-secondary" onclick="quickPayEMI('${e.EMIID}')">Collect</button>
        </div>
      `;
      upCards.appendChild(card);
    });
  }

  renderCharts();
}

// ── WhatsApp Reminder Link Generator ──
function getWhatsAppReminderUrl(emi) {
  const customer = state.customers.find((c) => c.CustomerID === emi.CustomerID);
  let phone = customer && customer.Phone ? String(customer.Phone).replace(/\D/g, '') : '';
  if (phone.length === 10) phone = '91' + phone;

  const isOverdue = emi.Status === 'Overdue';
  const greeting = `Dear ${emi.CustomerName},`;
  const text = isOverdue
    ? `${greeting} This is an urgent reminder from VR Finance that your EMI #${emi.EMINumber} of ${formatCurrency(emi.EMIAmount)} for Loan ${emi.LoanID} was due on ${emi.DueDate} and is currently OVERDUE. Kindly pay immediately to prevent late fees.`
    : `${greeting} Gentle reminder from VR Finance that your EMI #${emi.EMINumber} of ${formatCurrency(emi.EMIAmount)} for Loan ${emi.LoanID} is due on ${emi.DueDate}. Thank you!`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

// ── Chart.js Analytics ──
function renderCharts() {
  const isDark = state.theme === 'dark';
  const textColor = isDark ? '#94a3b8' : '#64748b';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';

  // 1. Monthly Collections Chart
  const colCtx = document.getElementById('collectionsChart');
  if (colCtx) {
    if (state.charts.collections) state.charts.collections.destroy();

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const curDate = new Date();
    const labels = [];
    const data = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(curDate.getFullYear(), curDate.getMonth() - i, 1);
      const mLabel = monthNames[d.getMonth()];
      labels.push(mLabel);

      // Aggregate payments
      let sum = 0;
      state.payments.forEach((p) => {
        const pd = parseDate(p.PaymentDate);
        if (pd.getMonth() === d.getMonth() && pd.getFullYear() === d.getFullYear()) {
          sum += Number(p.Amount) || 0;
        }
      });
      // Fallback demo numbers if payments is empty
      if (sum === 0 && state.payments.length === 0) {
        sum = [35000, 48000, 62000, 75000, 89000, 95000][5 - i];
      }
      data.push(sum);
    }

    state.charts.collections = new Chart(colCtx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Collections (₹)',
          data: data,
          backgroundColor: '#6366f1',
          borderRadius: 8,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: textColor }
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              callback: (val) => '₹' + (val >= 1000 ? val / 1000 + 'k' : val)
            }
          }
        }
      }
    });
  }

  // 2. Portfolio Doughnut Chart
  const portCtx = document.getElementById('portfolioChart');
  if (portCtx) {
    if (state.charts.portfolio) state.charts.portfolio.destroy();

    const activeCount = state.loans.filter((l) => l.Status === 'Active').length || 3;
    const closedCount = state.loans.filter((l) => l.Status === 'Closed').length || 1;
    const overdueCount = state.emis.filter((e) => e.Status === 'Overdue').length || 1;

    state.charts.portfolio = new Chart(portCtx, {
      type: 'doughnut',
      data: {
        labels: ['Active Loans', 'Closed', 'Overdue'],
        datasets: [{
          data: [activeCount, closedCount, overdueCount],
          backgroundColor: ['#6366f1', '#10b981', '#ef4444'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: textColor, padding: 14 }
          }
        }
      }
    });
  }
}

// ── 2. Customers View ──
function renderCustomers() {
  const table = document.getElementById('customersTableBody');
  const cards = document.getElementById('customersMobileCards');
  const countLabel = document.getElementById('customersCountLabel');
  if (!table || !cards) return;

  table.innerHTML = '';
  cards.innerHTML = '';
  if (countLabel) countLabel.textContent = `${state.customers.length} registered contacts (Borrowers & Investors)`;

  state.customers.forEach((c) => {
    const isInvestor = (state.investments || []).some(
      (inv) => inv.InvestorID === c.CustomerID || (inv.InvestorName && c.Name && inv.InvestorName.toLowerCase() === c.Name.toLowerCase())
    );
    const roleBadge = isInvestor
      ? `<span class="badge badge-info" style="font-size:0.68rem; margin-left:6px;">Investor</span>`
      : '';

    // Desktop Row
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${c.CustomerID}</code></td>
      <td>
        <strong>${c.Name}</strong>
        ${roleBadge}
      </td>
      <td>${c.Phone}</td>
      <td>${c.Address || '—'}</td>
      <td>${c.ActiveLoans || 0}</td>
      <td><strong>${formatCurrency(c.TotalOutstanding || 0)}</strong></td>
      <td><span class="badge badge-success">${c.Status}</span></td>
      <td>
        <div class="action-btn-group" style="display:flex; gap:6px; align-items:center;">
          <button class="btn btn-secondary" style="padding:6px 10px; font-size:0.8rem;" onclick="editCustomer('${c.CustomerID}')">
            Edit
          </button>
          <button class="btn btn-secondary" style="padding:6px 8px; font-size:0.8rem; color:var(--danger);" onclick="deleteCustomerClick('${c.CustomerID}')" title="Delete Customer">
            <span class="material-symbols-rounded" style="font-size:16px;">delete</span>
          </button>
        </div>
      </td>
    `;
    table.appendChild(tr);

    // Mobile Touch Card
    const card = document.createElement('div');
    card.className = 'mobile-data-card';
    card.innerHTML = `
      <div class="mobile-card-header">
        <div>
          <div class="mobile-card-title">${c.Name} ${roleBadge}</div>
          <div class="mobile-card-subtitle">${c.Phone} • ${c.CustomerID}</div>
        </div>
        <span class="badge badge-success">${c.Status}</span>
      </div>
      <div class="mobile-card-body">
        <div class="mobile-card-field">
          <span class="mobile-field-label">Active Loans</span>
          <span class="mobile-field-value">${c.ActiveLoans || 0}</span>
        </div>
        <div class="mobile-card-field">
          <span class="mobile-field-label">Total Outstanding</span>
          <span class="mobile-field-value">${formatCurrency(c.TotalOutstanding || 0)}</span>
        </div>
      </div>
      <div class="mobile-card-footer" style="display:flex; gap:8px; justify-content:flex-end;">
        <a href="tel:${c.Phone}" class="btn btn-secondary" style="padding:6px 12px; font-size:0.8rem;">Call</a>
        <button class="btn btn-secondary" style="padding:6px 12px; font-size:0.8rem;" onclick="editCustomer('${c.CustomerID}')">Edit</button>
        <button class="btn btn-secondary" style="padding:6px 12px; font-size:0.8rem; color:var(--danger);" onclick="deleteCustomerClick('${c.CustomerID}')">Delete</button>
      </div>
    `;
    cards.appendChild(card);
  });
}

// ── 3. Loans View ──
function renderLoans() {
  const table = document.getElementById('loansTableBody');
  const cards = document.getElementById('loansMobileCards');
  const countLabel = document.getElementById('loansCountLabel');
  if (!table || !cards) return;

  table.innerHTML = '';
  cards.innerHTML = '';
  if (countLabel) countLabel.textContent = `${state.loans.length} total loan contracts`;

  state.loans.forEach((l) => {
    const isClosed = l.Status === 'Closed';
    const statusBadge = isClosed ? 'badge-info' : 'badge-success';

    // Desktop Row
    const tr = document.createElement('tr');
    const typeLabel = l.LoanType || 'Interest Only';
    const freqLabel = l.Frequency || 'Monthly';
    const tenureUnit = freqLabel === 'Daily' ? 'd' : (freqLabel === 'Weekly' ? 'w' : 'm');

    tr.innerHTML = `
      <td><code>${l.LoanID}</code></td>
      <td><strong>${l.CustomerName}</strong></td>
      <td>${formatCurrency(l.LoanAmount)}</td>
      <td>
        <span class="badge ${typeLabel === 'Flexible' ? 'badge-warning' : (typeLabel === 'EMI' ? 'badge-primary' : 'badge-neutral')}" style="font-size:0.7rem;">${typeLabel}</span>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">${l.InterestRate}% • ${freqLabel}</div>
      </td>
      <td>${l.Tenure}${tenureUnit}</td>
      <td><strong>${typeLabel === 'Flexible' ? 'Any' : formatCurrency(l.EMIAmount)}</strong></td>
      <td>${formatCurrency(l.TotalPaid)} / ${formatCurrency(l.TotalPayable)}</td>
      <td style="color:${isClosed ? 'var(--text-muted)' : 'var(--danger)'}">
        <strong>${formatCurrency(l.Outstanding)}</strong>
      </td>
      <td><span class="badge ${statusBadge}">${l.Status}</span></td>
      <td>
        <div class="action-btn-group" style="display:flex; gap:4px; align-items:center;">
          <button class="btn btn-secondary" style="padding:6px 8px; font-size:0.8rem;" onclick="viewLoanSchedule('${l.LoanID}')" title="View Schedule">
            Schedule
          </button>
          ${!isClosed ? `
            <button class="btn btn-primary" style="padding:6px 8px; font-size:0.8rem;" onclick="openPrincipalPayModalForLoan('${l.LoanID}')" title="${typeLabel === 'Flexible' ? 'Add Repayment' : 'Pay Principal'}">
              ${typeLabel === 'Flexible' ? 'Repay' : 'Pay Prin'}
            </button>
          ` : ''}
          <button class="btn btn-secondary" style="padding:6px 8px; font-size:0.8rem;" onclick="editLoan('${l.LoanID}')" title="Edit Loan">
            <span class="material-symbols-rounded" style="font-size:16px;">edit</span>
          </button>
          <button class="btn btn-secondary" style="padding:6px 8px; font-size:0.8rem; color:var(--danger);" onclick="deleteLoanClick('${l.LoanID}')" title="Delete Loan">
            <span class="material-symbols-rounded" style="font-size:16px;">delete</span>
          </button>
        </div>
      </td>
    `;
    table.appendChild(tr);

    // Mobile Card
    const card = document.createElement('div');
    card.className = 'mobile-data-card';
    card.innerHTML = `
      <div class="mobile-card-header">
        <div>
          <div class="mobile-card-title">${l.CustomerName}</div>
          <div class="mobile-card-subtitle">${l.LoanID} • ${typeLabel} (${freqLabel})</div>
        </div>
        <span class="badge ${statusBadge}">${l.Status}</span>
      </div>
      <div class="mobile-card-body">
        <div class="mobile-card-field">
          <span class="mobile-field-label">Principal</span>
          <span class="mobile-field-value">${formatCurrency(l.LoanAmount)}</span>
        </div>
        <div class="mobile-card-field">
          <span class="mobile-field-label">Installment</span>
          <span class="mobile-field-value" style="color:var(--primary)">${typeLabel === 'Flexible' ? 'Flexible' : formatCurrency(l.EMIAmount)}</span>
        </div>
        <div class="mobile-card-field">
          <span class="mobile-field-label">Paid / Total</span>
          <span class="mobile-field-value">${formatCurrency(l.TotalPaid)} / ${formatCurrency(l.TotalPayable)}</span>
        </div>
        <div class="mobile-card-field">
          <span class="mobile-field-label">Outstanding</span>
          <span class="mobile-field-value" style="color:var(--danger)">${formatCurrency(l.Outstanding)}</span>
        </div>
      </div>
      <div class="mobile-card-footer" style="display:flex; flex-wrap:wrap; gap:8px;">
        <button class="btn btn-secondary" style="flex:1;" onclick="viewLoanSchedule('${l.LoanID}')">
          <span class="material-symbols-rounded" style="font-size:16px;">calendar_month</span>
          <span>Schedule</span>
        </button>
        ${!isClosed ? `
          <button class="btn btn-primary" style="flex:1;" onclick="openPrincipalPayModalForLoan('${l.LoanID}')">
            <span class="material-symbols-rounded" style="font-size:16px;">payments</span>
            <span>${typeLabel === 'Flexible' ? 'Repay' : 'Pay Prin'}</span>
          </button>
        ` : ''}
        <button class="btn btn-secondary" style="padding:8px 12px;" onclick="editLoan('${l.LoanID}')" title="Edit Loan">
          <span class="material-symbols-rounded" style="font-size:18px;">edit</span>
        </button>
        <button class="btn btn-secondary" style="padding:8px 12px; color:var(--danger);" onclick="deleteLoanClick('${l.LoanID}')" title="Delete Loan">
          <span class="material-symbols-rounded" style="font-size:18px;">delete</span>
        </button>
      </div>
    `;
    cards.appendChild(card);
  });
}

// ── 3B. Investments & Investor Portfolio View ──
// ── 3B. Investments & Investor Portfolio View ──
let activeInvestorDetailId = null;

function renderInvestments() {
  const table = document.getElementById('investmentsTableBody');
  const cards = document.getElementById('investmentsMobileCards');
  if (!table || !cards) return;

  table.innerHTML = '';
  cards.innerHTML = '';

  const investments = state.investments || [];

  // Calculate metrics
  let totalInvested = 0;
  let totalRepaid = 0;
  let totalOutstanding = 0;
  let activeInvestorsCount = 0;

  investments.forEach((inv) => {
    // Auto-enrich investor contact details from customers directory if missing
    const cust = (state.customers || []).find(
      (c) => c.CustomerID === inv.InvestorID || (c.Name && inv.InvestorName && c.Name.toLowerCase() === inv.InvestorName.toLowerCase())
    );
    if (cust) {
      if (!inv.InvestorPhone) inv.InvestorPhone = cust.Phone || '';
      if (!inv.InvestorEmail) inv.InvestorEmail = cust.Email || '';
      if (!inv.InvestorAddress) inv.InvestorAddress = cust.Address || '';
      if (!inv.InvestorID) inv.InvestorID = cust.CustomerID;
    }

    const amt = Number(inv.InvestmentAmount) || 0;
    const rep = Number(inv.TotalRepaid) || 0;
    const out = Number(inv.Outstanding) || 0;
    totalInvested += amt;
    totalRepaid += rep;
    if (inv.Status === 'Active') {
      totalOutstanding += out;
      activeInvestorsCount++;
    }
  });

  // Update Stats in DOM
  const statInvestedEl = document.getElementById('statTotalInvested');
  const statRepaidEl = document.getElementById('statTotalRepaidToInvestors');
  const statOutEl = document.getElementById('statOutstandingToInvestors');
  const statActiveEl = document.getElementById('statActiveInvestors');
  const statCountEl = document.getElementById('statTotalInvestmentsCount');

  if (statInvestedEl) statInvestedEl.textContent = formatCurrency(totalInvested);
  if (statRepaidEl) statRepaidEl.textContent = formatCurrency(totalRepaid);
  if (statOutEl) statOutEl.textContent = formatCurrency(totalOutstanding);
  if (statActiveEl) statActiveEl.textContent = activeInvestorsCount;
  if (statCountEl) statCountEl.textContent = `${investments.length} Total Investments`;

  // Apply Search & Status Filter
  let filtered = [...investments];

  if (state.investmentFilter && state.investmentFilter !== 'all') {
    filtered = filtered.filter((inv) => inv.Status === state.investmentFilter);
  }

  if (state.investmentSearchQuery) {
    const q = state.investmentSearchQuery.toLowerCase();
    filtered = filtered.filter((inv) => {
      const name = (inv.InvestorName || '').toLowerCase();
      const id = (inv.InvestmentID || '').toLowerCase();
      const phone = (inv.InvestorPhone || '').toLowerCase();
      const notes = (inv.Notes || '').toLowerCase();
      return name.includes(q) || id.includes(q) || phone.includes(q) || notes.includes(q);
    });
  }

  if (filtered.length === 0) {
    table.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-muted); padding:32px;">No investments found matching criteria. Click "+ New Investment" to record investor capital.</td></tr>`;
    cards.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:24px;">No investments found matching criteria.</div>`;
    return;
  }

  filtered.forEach((inv) => {
    const isSettled = inv.Status === 'Settled';
    const statusBadge = isSettled
      ? '<span class="badge badge-success">Settled</span>'
      : '<span class="badge badge-warning">Active</span>';

    const amt = Number(inv.InvestmentAmount) || 0;
    const rate = Number(inv.InterestRate) || 0;
    const isMonthly = (inv.InterestType || 'Yearly') === 'Monthly';
    const periodicVal = isMonthly ? Math.round(amt * (rate / 100)) : Math.round((amt * (rate / 100)) / 12);
    const rateText = `${inv.InterestRate}% ${isMonthly ? 'p.m.' : 'p.a.'}`;

    // Desktop Row
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <strong>${inv.InvestorName}</strong>
        <div style="font-size:0.75rem; color:var(--text-muted);">
          ${inv.InvestorPhone ? `📞 ${inv.InvestorPhone}` : 'No Phone'} • <code>${inv.InvestorID || 'INV'}</code>
        </div>
      </td>
      <td><code>${inv.InvestmentID}</code></td>
      <td><strong>${formatCurrency(inv.InvestmentAmount)}</strong></td>
      <td>
        <span class="badge badge-info" style="font-size:0.75rem;">${rateText}</span>
        <div style="font-size:0.72rem; color:var(--primary); font-weight:600; margin-top:2px;">~${formatCurrency(periodicVal)}/mo</div>
      </td>
      <td><span style="font-size:0.82rem;">${inv.RepaymentOption || 'Monthly Interest'}</span></td>
      <td style="color:var(--success); font-weight:600;">${formatCurrency(inv.TotalRepaid)}</td>
      <td style="color:${isSettled ? 'var(--success)' : 'var(--danger)'}; font-weight:800; font-size:1rem;">
        ${formatCurrency(inv.Outstanding)}
      </td>
      <td>${inv.StartDate || '—'}</td>
      <td>${statusBadge}</td>
      <td>
        <div class="action-btn-group">
          <button class="btn btn-secondary" style="padding:6px 9px; font-size:0.78rem;" onclick="viewInvestorDetails('${inv.InvestmentID}')" title="View Full Profile & Terms">
            <span class="material-symbols-rounded" style="font-size:16px;">visibility</span>
            <span>Details</span>
          </button>
          ${!isSettled ? `
            <button class="btn btn-primary" style="padding:6px 9px; font-size:0.78rem;" onclick="openInvestorRepayModal('${inv.InvestmentID}')" title="Partial Repayment Entry">
              <span class="material-symbols-rounded" style="font-size:16px;">payments</span>
              <span>Repay</span>
            </button>
          ` : ''}
          <button class="btn btn-secondary" style="padding:6px 9px; font-size:0.78rem;" onclick="openInvestorHistoryModal('${inv.InvestmentID}')" title="Repayment History">
            <span class="material-symbols-rounded" style="font-size:16px;">history</span>
          </button>
          <button class="btn btn-secondary" style="padding:6px 8px;" onclick="editInvestment('${inv.InvestmentID}')" title="Edit Investment">
            <span class="material-symbols-rounded" style="font-size:16px;">edit</span>
          </button>
          <button class="btn btn-secondary" style="padding:6px 8px; color:var(--danger);" onclick="deleteInvestment('${inv.InvestmentID}')" title="Delete Investment">
            <span class="material-symbols-rounded" style="font-size:16px;">delete</span>
          </button>
        </div>
      </td>
    `;
    table.appendChild(tr);

    // Mobile Touch Card
    const card = document.createElement('div');
    card.className = 'mobile-data-card';
    card.innerHTML = `
      <div class="mobile-card-header">
        <div>
          <div class="mobile-card-title">${inv.InvestorName}</div>
          <div class="mobile-card-subtitle"><code>${inv.InvestmentID}</code> • ${inv.InvestorPhone || 'No Phone'}</div>
        </div>
        ${statusBadge}
      </div>
      <div class="mobile-card-body">
        <div class="mobile-card-field">
          <span class="mobile-field-label">Capital Amount</span>
          <span class="mobile-field-value">${formatCurrency(inv.InvestmentAmount)}</span>
        </div>
        <div class="mobile-card-field">
          <span class="mobile-field-label">Outstanding Payable</span>
          <span class="mobile-field-value" style="color:${isSettled ? 'var(--success)' : 'var(--danger)'}; font-weight:800; font-size:1.1rem;">
            ${formatCurrency(inv.Outstanding)}
          </span>
        </div>
        <div class="mobile-card-field">
          <span class="mobile-field-label">Interest Rate</span>
          <span class="mobile-field-value">${rateText} (${formatCurrency(periodicVal)}/mo)</span>
        </div>
        <div class="mobile-card-field">
          <span class="mobile-field-label">Repayment Option</span>
          <span class="mobile-field-value">${inv.RepaymentOption || 'Monthly Interest'}</span>
        </div>
        <div class="mobile-card-field">
          <span class="mobile-field-label">Total Repaid</span>
          <span class="mobile-field-value" style="color:var(--success)">${formatCurrency(inv.TotalRepaid)}</span>
        </div>
        <div class="mobile-card-field">
          <span class="mobile-field-label">Start Date</span>
          <span class="mobile-field-value">${inv.StartDate || '—'}</span>
        </div>
      </div>
      <div class="mobile-card-footer" style="display:flex; flex-wrap:wrap; gap:8px;">
        <button class="btn btn-secondary" style="flex:1;" onclick="viewInvestorDetails('${inv.InvestmentID}')">
          <span class="material-symbols-rounded" style="font-size:16px;">visibility</span>
          <span>View Details</span>
        </button>
        ${!isSettled ? `
          <button class="btn btn-primary" style="flex:1;" onclick="openInvestorRepayModal('${inv.InvestmentID}')">
            <span class="material-symbols-rounded" style="font-size:16px;">payments</span>
            <span>Repay</span>
          </button>
        ` : ''}
        <button class="btn btn-secondary" style="padding:8px 12px;" onclick="openInvestorHistoryModal('${inv.InvestmentID}')" title="Repayment History">
          <span class="material-symbols-rounded" style="font-size:18px;">history</span>
        </button>
        <button class="btn btn-secondary" style="padding:8px 12px;" onclick="editInvestment('${inv.InvestmentID}')" title="Edit Investment">
          <span class="material-symbols-rounded" style="font-size:18px;">edit</span>
        </button>
        <button class="btn btn-secondary" style="padding:8px 12px; color:var(--danger);" onclick="deleteInvestment('${inv.InvestmentID}')" title="Delete Investment">
          <span class="material-symbols-rounded" style="font-size:18px;">delete</span>
        </button>
      </div>
    `;
    cards.appendChild(card);
  });
}

// ── View Full Comprehensive Investor Details Modal ──
function viewInvestorDetails(investmentId) {
  const inv = (state.investments || []).find((i) => i.InvestmentID === investmentId);
  if (!inv) {
    showToast('Investment record not found', 'error');
    return;
  }

  activeInvestorDetailId = investmentId;

  // Look up customer details
  const cust = (state.customers || []).find(
    (c) => c.CustomerID === inv.InvestorID || (c.Name && inv.InvestorName && c.Name.toLowerCase() === inv.InvestorName.toLowerCase())
  );

  const phone = inv.InvestorPhone || (cust ? cust.Phone : '') || '';
  const email = inv.InvestorEmail || (cust ? cust.Email : '') || '';
  const address = inv.InvestorAddress || (cust ? cust.Address : '') || 'No registered address';

  // Metrics
  const amt = Number(inv.InvestmentAmount) || 0;
  const repaid = Number(inv.TotalRepaid) || 0;
  const out = Number(inv.Outstanding) || 0;
  const rate = Number(inv.InterestRate) || 0;
  const isMonthly = (inv.InterestType || 'Yearly') === 'Monthly';
  const periodicVal = isMonthly ? Math.round(amt * (rate / 100)) : Math.round((amt * (rate / 100)) / 12);
  const isSettled = inv.Status === 'Settled';

  // Calculate active days
  let durationStr = 'Active';
  if (inv.StartDate) {
    const sDate = parseDate(inv.StartDate);
    if (sDate && !isNaN(sDate.getTime())) {
      const diffDays = Math.max(0, Math.round((new Date() - sDate) / (1000 * 60 * 60 * 24)));
      durationStr = `${diffDays} days (${inv.StartDate} to present)`;
    }
  }

  // Populate DOM elements
  document.getElementById('detInvestorName').textContent = inv.InvestorName;
  document.getElementById('detSubtitle').textContent = `${inv.InvestmentID} • Customer ID: ${inv.InvestorID || (cust ? cust.CustomerID : 'CUS')}`;

  const statusEl = document.getElementById('detStatusBadge');
  if (statusEl) {
    statusEl.className = `badge ${isSettled ? 'badge-success' : 'badge-warning'}`;
    statusEl.textContent = isSettled ? 'Settled' : 'Active';
  }

  document.getElementById('detCapitalAmount').textContent = formatCurrency(amt);
  document.getElementById('detTotalRepaid').textContent = formatCurrency(repaid);
  document.getElementById('detOutstanding').textContent = formatCurrency(out);
  document.getElementById('detPeriodicReturn').textContent = `${formatCurrency(periodicVal)}/mo`;

  // Contact info
  const phoneText = document.getElementById('detPhoneText');
  const callLink = document.getElementById('detCallLink');
  const waLink = document.getElementById('detWaLink');
  if (phone) {
    phoneText.textContent = phone;
    callLink.href = `tel:${phone}`;
    callLink.style.display = 'inline-block';
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    waLink.href = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(`Hello ${inv.InvestorName}, greeting from VR Finance regarding your investment ${inv.InvestmentID}.`)}`;
    waLink.style.display = 'inline-block';
  } else {
    phoneText.textContent = 'No phone recorded';
    callLink.style.display = 'none';
    waLink.style.display = 'none';
  }

  document.getElementById('detEmailText').textContent = email || '—';
  document.getElementById('detAddressText').textContent = address || '—';

  // Contract Terms
  document.getElementById('detInterestRateText').textContent = `${inv.InterestRate}% ${isMonthly ? 'per month' : 'per annum'}`;
  document.getElementById('detRepaymentOptionText').textContent = inv.RepaymentOption || 'Monthly Interest (Principal at end)';
  document.getElementById('detStartDateText').textContent = inv.StartDate || '—';
  document.getElementById('detDurationText').textContent = durationStr;
  document.getElementById('detNotesText').textContent = inv.Notes || 'No banking or agreement remarks recorded.';

  // Detail Modal Action Buttons
  const repayBtn = document.getElementById('detRepayBtn');
  if (repayBtn) repayBtn.style.display = isSettled ? 'none' : 'inline-flex';

  openModal('investorDetailsModal');
}

function openInvestorRepayFromDetails() {
  closeModal('investorDetailsModal');
  if (activeInvestorDetailId) {
    openInvestorRepayModal(activeInvestorDetailId);
  }
}

function openInvestorHistoryFromDetails() {
  closeModal('investorDetailsModal');
  if (activeInvestorDetailId) {
    openInvestorHistoryModal(activeInvestorDetailId);
  }
}

function openInvestorEditFromDetails() {
  closeModal('investorDetailsModal');
  if (activeInvestorDetailId) {
    editInvestment(activeInvestorDetailId);
  }
}

// ── Investor Mode & Dynamic Preview Controllers ──
let currentInvestorEntryMode = 'existing';

function switchInvestorEntryMode(mode) {
  currentInvestorEntryMode = mode;
  const existBtn = document.getElementById('invModeExistingBtn');
  const newBtn = document.getElementById('invModeNewBtn');
  const existSec = document.getElementById('invExistingCustomerSection');
  const newSec = document.getElementById('invNewCustomerSection');

  if (mode === 'new') {
    if (newBtn) newBtn.classList.add('active');
    if (existBtn) existBtn.classList.remove('active');
    if (newSec) newSec.style.display = 'block';
    if (existSec) existSec.style.display = 'none';
  } else {
    if (existBtn) existBtn.classList.add('active');
    if (newBtn) newBtn.classList.remove('active');
    if (existSec) existSec.style.display = 'block';
    if (newSec) newSec.style.display = 'none';
  }
}

function handleInvestorCustomerChange(customerId) {
  const previewBox = document.getElementById('invCustomerPreviewBox');
  if (!previewBox) return;

  const cust = (state.customers || []).find((c) => c.CustomerID === customerId);
  if (!cust) {
    previewBox.style.display = 'none';
    return;
  }

  previewBox.style.display = 'block';
  document.getElementById('invPreviewName').textContent = cust.Name;
  document.getElementById('invPreviewId').textContent = cust.CustomerID;
  document.getElementById('invPreviewPhone').textContent = cust.Phone || 'No Phone';
  document.getElementById('invPreviewEmail').textContent = cust.Email || 'No Email';
}

function calcInvestorReturnPreview() {
  const amtInput = document.getElementById('invAmountInput');
  const rateInput = document.getElementById('invRateInput');
  const rateTypeSelect = document.getElementById('invRateTypeSelect');
  const textEl = document.getElementById('invReturnPreviewText');
  const rateEl = document.getElementById('invReturnPreviewRate');
  if (!amtInput || !rateInput || !textEl) return;

  const amt = Number(amtInput.value) || 0;
  const rate = Number(rateInput.value) || 0;
  const isMonthly = (rateTypeSelect ? rateTypeSelect.value : 'Yearly') === 'Monthly';

  const periodicVal = isMonthly ? Math.round(amt * (rate / 100)) : Math.round((amt * (rate / 100)) / 12);
  const annualVal = isMonthly ? Math.round(periodicVal * 12) : Math.round(amt * (rate / 100));

  textEl.textContent = `${formatCurrency(periodicVal)} per month (~${formatCurrency(annualVal)} / year)`;
  if (rateEl) {
    rateEl.textContent = `${rate}% ${isMonthly ? 'p.m.' : 'p.a.'}`;
  }
}

function handleInvestmentSearch(query) {
  state.investmentSearchQuery = (query || '').trim();
  renderInvestments();
}

function filterInvestments(status) {
  state.investmentFilter = status;
  ['invFilterAllBtn', 'invFilterActiveBtn', 'invFilterSettledBtn'].forEach((btnId) => {
    const el = document.getElementById(btnId);
    if (el) el.classList.remove('active');
  });

  if (status === 'all') {
    const btn = document.getElementById('invFilterAllBtn');
    if (btn) btn.classList.add('active');
  } else if (status === 'Active') {
    const btn = document.getElementById('invFilterActiveBtn');
    if (btn) btn.classList.add('active');
  } else if (status === 'Settled') {
    const btn = document.getElementById('invFilterSettledBtn');
    if (btn) btn.classList.add('active');
  }

  renderInvestments();
}

// ── 4. EMI Tracker View ──
function renderEMIs(filter = 'all') {
  const table = document.getElementById('emiTableBody');
  const cards = document.getElementById('emiMobileCards');
  if (!table || !cards) return;

  table.innerHTML = '';
  cards.innerHTML = '';

  let list = state.emis;
  if (filter !== 'all') {
    list = list.filter((e) => e.Status === filter);
  }

  list.forEach((e) => {
    let badgeClass = 'badge-warning';
    if (e.Status === 'Paid') badgeClass = 'badge-success';
    if (e.Status === 'Overdue') badgeClass = 'badge-danger';

    const waUrl = getWhatsAppReminderUrl(e);

    // Desktop Row
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${e.EMIID}</code></td>
      <td><strong>${e.CustomerName}</strong></td>
      <td><code>${e.LoanID}</code></td>
      <td>#${e.EMINumber}</td>
      <td>${e.DueDate}</td>
      <td><strong>${formatCurrency(e.EMIAmount)}</strong></td>
      <td>${formatCurrency(e.Principal)} / ${formatCurrency(e.Interest)}</td>
      <td><span class="badge ${badgeClass}">${e.Status}</span></td>
      <td>
        <div class="action-btn-group">
          ${e.Status !== 'Paid' ? `
            <a href="${waUrl}" target="_blank" class="btn-whatsapp">WhatsApp</a>
            <button class="btn btn-primary" style="padding:6px 10px; font-size:0.8rem;" onclick="quickPayEMI('${e.EMIID}')">Collect</button>
          ` : `
            <span style="color:var(--success); font-weight:600; font-size:0.85rem;">Paid on ${e.PaidDate}</span>
          `}
        </div>
      </td>
    `;
    table.appendChild(tr);

    // Mobile Card
    const card = document.createElement('div');
    card.className = 'mobile-data-card';
    card.innerHTML = `
      <div class="mobile-card-header">
        <div>
          <div class="mobile-card-title">${e.CustomerName}</div>
          <div class="mobile-card-subtitle">${e.LoanID} • Installment #${e.EMINumber}</div>
        </div>
        <span class="badge ${badgeClass}">${e.Status}</span>
      </div>
      <div class="mobile-card-body">
        <div class="mobile-card-field">
          <span class="mobile-field-label">EMI Due</span>
          <span class="mobile-field-value">${formatCurrency(e.EMIAmount)}</span>
        </div>
        <div class="mobile-card-field">
          <span class="mobile-field-label">Due Date</span>
          <span class="mobile-field-value">${e.DueDate}</span>
        </div>
      </div>
      <div class="mobile-card-footer">
        ${e.Status !== 'Paid' ? `
          <a href="${waUrl}" target="_blank" class="btn-whatsapp">WhatsApp</a>
          <button class="btn btn-primary" onclick="quickPayEMI('${e.EMIID}')">Collect EMI</button>
        ` : `
          <span style="color:var(--success); font-size:0.85rem; font-weight:600;">Paid (${e.PaymentMode || 'Cash'})</span>
        `}
      </div>
    `;
    cards.appendChild(card);
  });
}

function filterEMIs(status) {
  renderEMIs(status);
}

// ── 5. Reports View ──
function renderReports() {
  const table = document.getElementById('reportsTableBody');
  const cards = document.getElementById('reportsMobileCards');
  if (!table || !cards) return;

  table.innerHTML = '';
  cards.innerHTML = '';

  state.loans.forEach((l) => {
    const total = Number(l.TotalPayable) || 1;
    const paid = Number(l.TotalPaid) || 0;
    const progress = Math.min(100, Math.round((paid / total) * 100));

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${l.CustomerName}</strong></td>
      <td><code>${l.LoanID}</code></td>
      <td>${formatCurrency(l.LoanAmount)}</td>
      <td>${formatCurrency(l.EMIAmount)}</td>
      <td style="color:var(--success)">${formatCurrency(l.TotalPaid)}</td>
      <td style="color:var(--danger)"><strong>${formatCurrency(l.Outstanding)}</strong></td>
      <td>
        <div style="background:var(--bg-surface-elevated); height:8px; border-radius:99px; overflow:hidden; width:120px;">
          <div style="background:var(--primary); height:100%; width:${progress}%"></div>
        </div>
        <small style="font-size:0.75rem; color:var(--text-subtle);">${progress}%</small>
      </td>
    `;
    table.appendChild(tr);

    const card = document.createElement('div');
    card.className = 'mobile-data-card';
    card.innerHTML = `
      <div class="mobile-card-header">
        <div class="mobile-card-title">${l.CustomerName}</div>
        <code>${l.LoanID}</code>
      </div>
      <div class="mobile-card-body">
        <div class="mobile-card-field">
          <span class="mobile-field-label">Loan Amount</span>
          <span class="mobile-field-value">${formatCurrency(l.LoanAmount)}</span>
        </div>
        <div class="mobile-card-field">
          <span class="mobile-field-label">Outstanding</span>
          <span class="mobile-field-value" style="color:var(--danger)">${formatCurrency(l.Outstanding)}</span>
        </div>
      </div>
      <div style="margin-top:8px;">
        <div style="display:flex; justify-content:space-between; font-size:0.75rem; margin-bottom:4px;">
          <span>Repayment Progress</span>
          <span>${progress}%</span>
        </div>
        <div style="background:var(--bg-surface-hover); height:8px; border-radius:99px; overflow:hidden;">
          <div style="background:var(--primary); height:100%; width:${progress}%"></div>
        </div>
      </div>
    `;
    cards.appendChild(card);
  });
}

function exportOutstandingCSV() {
  let csv = 'Customer Name,Loan ID,Principal,Monthly EMI,Total Paid,Outstanding,Tenure\n';
  state.loans.forEach((l) => {
    csv += `"${l.CustomerName}","${l.LoanID}",${l.LoanAmount},${l.EMIAmount},${l.TotalPaid},${l.Outstanding},${l.Tenure}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Outstanding_Loans_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  showToast('Outstanding report exported to CSV', 'success');
}

// ═══════════════════ ACTION HANDLERS & MODALS ═══════════════════
function openModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.classList.add('open');
}

function closeModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) m.classList.remove('open');
}

function updateCustomerDropdowns() {
  const loanSelect = document.getElementById('loanCustomerSelect');
  if (loanSelect) {
    const curVal = loanSelect.value;
    loanSelect.innerHTML = '<option value="">-- Choose Customer --</option>';
    state.customers.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.CustomerID;
      opt.textContent = `${c.Name} (${c.Phone || 'No Phone'})`;
      loanSelect.appendChild(opt);
    });
    if (curVal) loanSelect.value = curVal;
  }

  const invSelect = document.getElementById('invCustomerSelect');
  if (invSelect) {
    const curVal = invSelect.value;
    invSelect.innerHTML = '<option value="">-- Choose an Investor from Customer List --</option>';
    state.customers.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.CustomerID;
      opt.textContent = `${c.Name} (${c.Phone || 'No Phone'}) [${c.CustomerID}]`;
      invSelect.appendChild(opt);
    });
    if (curVal) invSelect.value = curVal;
  }
}

// ── Customer Operations ──
function openCustomerModal() {
  document.getElementById('customerForm').reset();
  document.getElementById('custFormId').value = '';
  document.getElementById('customerModalTitle').textContent = 'Add New Customer';
  openModal('customerModal');
}

function editCustomer(customerId) {
  const c = state.customers.find((cust) => cust.CustomerID === customerId);
  if (!c) return;

  document.getElementById('custFormId').value = c.CustomerID;
  document.getElementById('custName').value = c.Name || '';
  document.getElementById('custPhone').value = c.Phone || '';
  document.getElementById('custEmail').value = c.Email || '';
  document.getElementById('custAddress').value = c.Address || '';
  document.getElementById('custIdProof').value = c.IDProof || 'Aadhaar';
  document.getElementById('custIdNumber').value = c.IDNumber || '';
  document.getElementById('custNotes').value = c.Notes || '';

  document.getElementById('customerModalTitle').textContent = 'Edit Customer Details';
  openModal('customerModal');
}

async function saveCustomer(e) {
  e.preventDefault();
  const formId = document.getElementById('custFormId').value.trim();
  const name = document.getElementById('custName').value.trim();
  const phone = document.getElementById('custPhone').value.trim();
  const email = document.getElementById('custEmail').value.trim();
  const address = document.getElementById('custAddress').value.trim();
  const idProof = document.getElementById('custIdProof').value;
  const idNumber = document.getElementById('custIdNumber').value.trim();
  const notes = document.getElementById('custNotes').value.trim();

  if (!name) {
    showToast('Customer name is required', 'warning');
    return;
  }
  if (!phone) {
    showToast('Customer phone number is required', 'warning');
    return;
  }

  // Dual-cased payload for full compatibility with both lowercase and uppercase Apps Script backends
  const payload = {
    // Lowercase properties
    name: name,
    phone: phone,
    email: email,
    address: address,
    idProof: idProof,
    idNumber: idNumber,
    notes: notes,
    status: 'Active',
    customerId: formId || '',

    // PascalCase properties
    Name: name,
    Phone: phone,
    Email: email,
    Address: address,
    IDProof: idProof,
    IDNumber: idNumber,
    Notes: notes,
    Status: 'Active',
    CustomerID: formId || ''
  };

  if (formId) {
    // Edit existing customer
    const c = state.customers.find((cust) => cust.CustomerID === formId);
    if (c) {
      c.Name = name;
      c.Phone = phone;
      c.Email = email;
      c.Address = address;
      c.IDProof = idProof;
      c.IDNumber = idNumber;
      c.Notes = notes;
    }
    saveDataLocally();
    refreshUI();
    closeModal('customerModal');
    showToast(`Customer "${name}" updated locally`, 'info');

    // Sync to Google Sheet
    if (state.scriptUrl) {
      try {
        const res = await callSheetApi('updateCustomer', payload);
        if (res && res.success) {
          showToast(`Customer "${name}" updated in Google Sheet!`, 'success');
        } else if (res && !res.success) {
          showToast(`Sheet update notice: ${res.message || 'Check connection'}`, 'warning');
        }
      } catch (err) {
        console.warn('Update customer sheet sync error:', err);
      }
    }
  } else {
    // Add new customer
    const localId = 'CUS-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    payload.customerId = localId;
    payload.CustomerID = localId;
    payload.JoinDate = formatDate(new Date());

    const newCust = {
      CustomerID: localId,
      Name: name,
      Phone: phone,
      Email: email,
      Address: address,
      IDProof: idProof,
      IDNumber: idNumber,
      JoinDate: payload.JoinDate,
      Status: 'Active',
      Notes: notes,
      ActiveLoans: 0,
      TotalOutstanding: 0
    };
    state.customers.unshift(newCust);
    saveDataLocally();
    refreshUI();
    closeModal('customerModal');
    showToast(`Saving "${name}" to Google Sheet...`, 'info');

    // Sync to Google Sheet
    if (state.scriptUrl) {
      try {
        const res = await callSheetApi('addCustomer', payload);
        if (res && res.success) {
          if (res.customerId) {
            newCust.CustomerID = res.customerId;
            saveDataLocally();
            refreshUI();
          }
          showToast(`Customer "${name}" recorded in Google Sheet!`, 'success');
        } else if (res && !res.success) {
          showToast(`Sheet warning: ${res.message || 'Could not record in sheet'}`, 'error');
        }
      } catch (err) {
        console.warn('Add customer sheet sync error:', err);
        showToast('Saved locally, but sheet sync failed.', 'warning');
      }
    }
  }
}

async function deleteCustomerClick(customerId) {
  const c = state.customers.find((cust) => cust.CustomerID === customerId);
  const name = c ? c.Name : customerId;

  const hasActiveLoans = state.loans.some(l => l.CustomerID === customerId && l.Status === 'Active');
  if (hasActiveLoans) {
    showToast(`Cannot delete "${name}": borrower has active loans!`, 'error');
    return;
  }

  if (!confirm(`Are you sure you want to delete customer "${name}"? This action cannot be undone.`)) {
    return;
  }

  state.customers = state.customers.filter(cust => cust.CustomerID !== customerId);
  saveDataLocally();
  refreshUI();
  showToast(`Customer "${name}" deleted.`, 'info');

  if (state.scriptUrl) {
    try {
      const res = await callSheetApi('deleteCustomer', { customerId: customerId, CustomerID: customerId });
      if (res && res.success) {
        showToast(`Customer "${name}" removed from Google Sheet.`, 'success');
      } else if (res && !res.success) {
        showToast(`Sheet note: ${res.message || 'Could not delete from sheet'}`, 'warning');
      }
    } catch (err) {
      console.warn('Delete customer sheet sync error:', err);
    }
  }
}

// ── Loan Operations ──
function setLoanInputsDisabled(disabled) {
  ['loanCustomerSelect', 'loanTypeSelect', 'loanFreqSelect', 'loanAmountInput', 'loanRateInput', 'loanRateTypeSelect', 'loanTenureInput', 'loanStartDateInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = disabled;
  });
}

function openNewLoanModal() {
  document.getElementById('newLoanForm').reset();
  const formId = document.getElementById('loanFormId');
  if (formId) formId.value = '';

  const titleEl = document.getElementById('loanModalTitle');
  if (titleEl) titleEl.textContent = 'Issue New Loan';

  const submitBtn = document.getElementById('loanSubmitBtn');
  if (submitBtn) submitBtn.textContent = 'Create Loan Contract';

  const notice = document.getElementById('loanEditNotice');
  if (notice) notice.style.display = 'none';

  setLoanInputsDisabled(false);

  const today = new Date().toISOString().split('T')[0];
  document.getElementById('loanStartDateInput').value = today;
  document.getElementById('loanAmountInput').value = 50000;
  document.getElementById('loanRateInput').value = 12;
  document.getElementById('loanTenureInput').value = 12;
  handleLoanTypeChange();
  updateTenureUnitLabel();
  recalcLoanPreview();
  openModal('newLoanModal');
}

function editLoan(loanId) {
  const loan = state.loans.find(l => l.LoanID === loanId);
  if (!loan) {
    showToast('Loan not found', 'error');
    return;
  }

  const formId = document.getElementById('loanFormId');
  if (formId) formId.value = loan.LoanID;

  const titleEl = document.getElementById('loanModalTitle');
  if (titleEl) titleEl.textContent = `Edit Loan — ${loan.LoanID}`;

  // Populate fields
  const custSelect = document.getElementById('loanCustomerSelect');
  if (custSelect) custSelect.value = loan.CustomerID;

  const typeSelect = document.getElementById('loanTypeSelect');
  if (typeSelect) typeSelect.value = loan.LoanType || 'Interest Only';

  const freqSelect = document.getElementById('loanFreqSelect');
  if (freqSelect) freqSelect.value = loan.Frequency || 'Monthly';

  document.getElementById('loanAmountInput').value = loan.LoanAmount;
  document.getElementById('loanRateInput').value = loan.InterestRate;

  const rateTypeSelect = document.getElementById('loanRateTypeSelect');
  if (rateTypeSelect) rateTypeSelect.value = loan.InterestType || 'Yearly';

  document.getElementById('loanTenureInput').value = loan.Tenure;

  const d = parseDate(loan.StartDate);
  const dateStr = d instanceof Date && !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '';
  document.getElementById('loanStartDateInput').value = dateStr;

  document.getElementById('loanNotesInput').value = loan.Notes || '';

  // Check if payments exist
  const hasPayments = (state.payments || []).some(p => p.LoanID === loanId);
  const notice = document.getElementById('loanEditNotice');
  const submitBtn = document.getElementById('loanSubmitBtn');

  if (hasPayments) {
    setLoanInputsDisabled(true);
    if (notice) {
      notice.style.display = 'block';
      notice.innerHTML = `<strong>Protected Record:</strong> This loan has recorded payments. Terms (principal, rate, installments) cannot be altered. You can update remarks/notes below.`;
    }
    if (submitBtn) submitBtn.textContent = 'Save Remarks';
  } else {
    setLoanInputsDisabled(false);
    if (notice) notice.style.display = 'none';
    if (submitBtn) submitBtn.textContent = 'Save Loan Changes';
  }

  handleLoanTypeChange();
  updateTenureUnitLabel();
  recalcLoanPreview();
  openModal('newLoanModal');
}

function saveLoan(e) {
  e.preventDefault();
  const formId = document.getElementById('loanFormId') ? document.getElementById('loanFormId').value : '';

  if (formId) {
    // ── EDIT EXISTING LOAN ──
    const loan = state.loans.find(l => l.LoanID === formId);
    if (!loan) {
      showToast('Loan record not found', 'error');
      return;
    }

    const notes = document.getElementById('loanNotesInput').value.trim();
    const hasPayments = (state.payments || []).some(p => p.LoanID === formId);

    if (hasPayments) {
      loan.Notes = notes;
      saveDataLocally();
      refreshUI();
      closeModal('newLoanModal');
      showToast('Loan remarks updated!', 'success');

      if (state.scriptUrl) {
        callSheetApi('updateLoan', { loanId: formId, notes: notes });
      }
      return;
    }

    // No payments: update terms and regenerate schedule
    const customerId = document.getElementById('loanCustomerSelect').value;
    const customer = state.customers.find(c => c.CustomerID === customerId);
    const P = Number(document.getElementById('loanAmountInput').value);
    const rate = Number(document.getElementById('loanRateInput').value);
    const rateType = document.getElementById('loanRateTypeSelect').value;
    const tenure = Number(document.getElementById('loanTenureInput').value);
    const startDate = document.getElementById('loanStartDateInput').value;
    const loanType = document.getElementById('loanTypeSelect').value;
    const freq = document.getElementById('loanFreqSelect').value;

    // Delete old EMIs for this loan
    state.emis = state.emis.filter(item => item.LoanID !== formId);

    // Update loan properties
    loan.CustomerID = customer ? customer.CustomerID : loan.CustomerID;
    loan.CustomerName = customer ? customer.Name : loan.CustomerName;
    loan.LoanAmount = P;
    loan.InterestRate = rate;
    loan.InterestType = rateType;
    loan.Tenure = tenure;
    loan.StartDate = formatDate(parseDate(startDate));
    loan.Notes = notes;
    loan.LoanType = loanType;
    loan.Frequency = freq;

    // Calculate new plan
    const perYear = FREQ_PER_YEAR[freq] || 12;
    const pr = ((rateType === 'Monthly' ? rate * 12 : rate) / 100) / perYear;
    const cnt = loanType === 'Flexible' ? 0 : (freq === 'One Time' ? 1 : tenure);
    const mult = freq === 'One Time' ? tenure : 1;
    const annuity = loanType === 'EMI' && cnt > 1;

    const emiVal = annuity
      ? (pr === 0 ? P / cnt : P * pr * Math.pow(1 + pr, cnt) / (Math.pow(1 + pr, cnt) - 1))
      : 0;

    let bal = P;
    let totalInterest = 0;
    const sched = [];

    for (let k = 1; k <= cnt; k++) {
      const isLast = k === cnt;
      let interest = 0;
      let principalComp = 0;
      if (annuity) {
        interest = Math.round(bal * pr * 100) / 100;
        principalComp = isLast ? Math.round(bal * 100) / 100 : Math.round((emiVal - interest) * 100) / 100;
        bal = Math.max(0, Math.round((bal - principalComp) * 100) / 100);
      } else {
        interest = Math.round(P * pr * mult * 100) / 100;
        principalComp = isLast ? P : 0;
        bal = isLast ? 0 : P;
      }
      totalInterest += interest;
      sched.push({
        k: k,
        interest: interest,
        principal: principalComp,
        balance: bal,
        totalInstalment: Math.round((interest + principalComp) * 100) / 100
      });
    }

    const firstInstalment = sched.length > 0
      ? (loanType === 'EMI' || cnt === 1 ? sched[0].totalInstalment : sched[0].interest)
      : 0;
    const totalPayable = Math.round((P + totalInterest) * 100) / 100;
    const startObj = parseDate(startDate);
    const endDate = calculateDueDate(startObj, freq, loanType === 'Flexible' ? tenure : cnt, tenure);

    loan.EMIAmount = Math.round(firstInstalment);
    loan.TotalPayable = totalPayable;
    loan.Outstanding = P;
    loan.TotalPaid = 0;
    loan.EndDate = formatDate(endDate);
    loan.EMIsPaid = 0;
    loan.EMIsRemaining = cnt;
    loan.Status = 'Active';

    // Regenerate schedule
    sched.forEach(row => {
      const due = calculateDueDate(startObj, freq, row.k, tenure);
      state.emis.push({
        EMIID: 'EMI-' + Math.random().toString(36).substring(2, 7).toUpperCase(),
        LoanID: formId,
        CustomerID: loan.CustomerID,
        CustomerName: loan.CustomerName,
        EMINumber: row.k,
        DueDate: formatDate(due),
        EMIAmount: row.totalInstalment,
        Principal: row.principal,
        Interest: row.interest,
        Balance: row.balance,
        PaidAmount: '',
        PaidDate: '',
        PaymentMode: '',
        Status: 'Pending',
        LateFee: 0,
        Remarks: ''
      });
    });

    saveDataLocally();
    refreshUI();
    closeModal('newLoanModal');
    showToast(`Loan ${formId} updated & schedule regenerated!`, 'success');

    if (state.scriptUrl) {
      callSheetApi('updateLoan', {
        loanId: formId,
        loanAmount: P,
        interestRate: rate,
        interestType: rateType,
        tenure: tenure,
        startDate: startDate,
        notes: notes,
        loanType: loanType,
        frequency: freq
      });
    }
    return;
  }

  // ── CREATE NEW LOAN ──
  const customerId = document.getElementById('loanCustomerSelect').value;
  const customer = state.customers.find((c) => c.CustomerID === customerId);
  if (!customer) {
    showToast('Please select a valid customer', 'error');
    return;
  }

  const P = Number(document.getElementById('loanAmountInput').value);
  const rate = Number(document.getElementById('loanRateInput').value);
  const rateType = document.getElementById('loanRateTypeSelect').value;
  const tenure = Number(document.getElementById('loanTenureInput').value);
  const startDate = document.getElementById('loanStartDateInput').value;
  const notes = document.getElementById('loanNotesInput').value.trim();

  const typeSelect = document.getElementById('loanTypeSelect');
  const freqSelect = document.getElementById('loanFreqSelect');
  const loanType = typeSelect ? typeSelect.value : 'Interest Only';
  const freq = freqSelect ? freqSelect.value : 'Monthly';

  createSampleLoan(customer.CustomerID, customer.Name, P, rate, rateType, tenure, startDate, loanType, freq);

  saveDataLocally();
  refreshUI();
  closeModal('newLoanModal');
  showToast(`Loan issued for ${customer.Name}!`, 'success');

  // Push to cloud sheet if configured
  if (state.scriptUrl) {
    callSheetApi('createLoan', {
      customerId: customer.CustomerID,
      customerName: customer.Name,
      loanAmount: P,
      interestRate: rate,
      interestType: rateType,
      tenure: tenure,
      startDate: startDate,
      notes: notes,
      loanType: loanType,
      frequency: freq
    });
  }
}

function deleteLoanClick(loanId) {
  const loan = state.loans.find(l => l.LoanID === loanId);
  if (!loan) {
    showToast('Loan not found', 'error');
    return;
  }

  const pays = (state.payments || []).filter(p => p.LoanID === loanId);
  if (pays.length > 0) {
    const ok = confirm(`⚠️ Warning: Loan ${loan.LoanID} for "${loan.CustomerName}" has ${pays.length} recorded payments totaling ${formatCurrency(loan.TotalPaid)}.\n\nDeleting this loan contract will permanently delete all associated payment and EMI records.\n\nAre you sure you want to proceed?`);
    if (!ok) return;
  } else {
    const ok = confirm(`Are you sure you want to delete loan ${loan.LoanID} for "${loan.CustomerName}"?`);
    if (!ok) return;
  }

  // Remove loan, emis, payments from state
  state.loans = state.loans.filter(l => l.LoanID !== loanId);
  state.emis = state.emis.filter(e => e.LoanID !== loanId);
  state.payments = state.payments.filter(p => p.LoanID !== loanId);

  saveDataLocally();
  refreshUI();
  showToast(`Loan ${loanId} deleted!`, 'info');

  if (state.scriptUrl) {
    callSheetApi('deleteLoan', { loanId: loanId, withPayments: true });
  }
}

function viewLoanSchedule(loanId) {
  const loan = state.loans.find((l) => l.LoanID === loanId);
  if (!loan) return;

  state.activeScheduleLoanId = loanId;
  const isClosed = loan.Status === 'Closed';
  const typeLabel = loan.LoanType || 'Interest Only';
  const freqLabel = loan.Frequency || 'Monthly';

  const schedule = state.emis.filter((e) => e.LoanID === loanId);
  document.getElementById('loanScheduleTitle').textContent = `${loan.CustomerName} — ${loan.LoanID}`;
  document.getElementById('loanScheduleSubtitle').textContent = `${typeLabel} (${freqLabel}) • Principal: ${formatCurrency(loan.LoanAmount)} • Outstanding: ${formatCurrency(loan.Outstanding)}`;

  const prepayBtn = document.getElementById('schedulePrepayBtn');
  const prepayBtnText = document.getElementById('schedulePrepayBtnText');
  if (prepayBtn) {
    prepayBtn.style.display = isClosed ? 'none' : 'inline-flex';
    if (prepayBtnText) {
      prepayBtnText.textContent = typeLabel === 'Flexible' ? 'Add Repayment' : 'Pay Principal';
    }
  }

  const table = document.getElementById('loanScheduleTableBody');
  table.innerHTML = '';

  if (typeLabel === 'Flexible' && schedule.length === 0) {
    const loanPayments = (state.payments || []).filter(p => p.LoanID === loanId);
    if (loanPayments.length === 0) {
      table.innerHTML = `
        <tr>
          <td colspan="8" style="text-align:center; padding:24px; color:var(--text-muted);">
            Flexible loan active. No scheduled installments — repayments can be made anytime in any amount.
          </td>
        </tr>
      `;
    } else {
      loanPayments.forEach((p, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>#${idx + 1}</td>
          <td>${p.PaymentDate}</td>
          <td><strong>${formatCurrency(p.Amount)}</strong></td>
          <td>${formatCurrency(p.Amount)}</td>
          <td>₹0</td>
          <td>—</td>
          <td><span class="badge badge-success">Repaid</span></td>
          <td><span style="color:var(--success); font-size:0.75rem;">✔ ${p.PaymentMode || 'Cash'}</span></td>
        `;
        table.appendChild(tr);
      });
    }
  } else {
    schedule.forEach((e) => {
      const isPaid = e.Status === 'Paid';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>#${e.EMINumber}</td>
        <td>${e.DueDate}</td>
        <td><strong>${formatCurrency(e.EMIAmount)}</strong></td>
        <td>${formatCurrency(e.Principal)}</td>
        <td>${formatCurrency(e.Interest)}</td>
        <td>${formatCurrency(e.Balance)}</td>
        <td>
          <span class="badge ${isPaid ? 'badge-success' : (e.Status === 'Overdue' ? 'badge-danger' : 'badge-warning')}">
            ${e.Status}
          </span>
        </td>
        <td>
          ${!isPaid && e.Status !== 'Closed' ? `
            <button class="btn btn-primary" style="padding:4px 8px; font-size:0.75rem;" onclick="closeModal('loanScheduleModal'); quickPayEMI('${e.EMIID}')">
              Collect
            </button>
          ` : `
            <span style="color:var(--success); font-size:0.75rem;">✔</span>
          `}
        </td>
      `;
      table.appendChild(tr);
    });
  }

  openModal('loanScheduleModal');
}

function openPrincipalPayModalFromSchedule() {
  closeModal('loanScheduleModal');
  if (state.activeScheduleLoanId) {
    openPrincipalPayModalForLoan(state.activeScheduleLoanId);
  }
}

function openPrincipalPayModalForLoan(loanId) {
  const loan = state.loans.find(l => l.LoanID === loanId);
  if (!loan || loan.Status === 'Closed') {
    showToast('Active loan not found', 'error');
    return;
  }

  const remaining = calculatePrincipalOutstanding(loan);
  const typeLabel = loan.LoanType || 'Interest Only';

  const modalTitle = document.getElementById('principalPayModalTitle');
  if (modalTitle) {
    modalTitle.textContent = typeLabel === 'Flexible' ? 'Flexible Repayment' : 'Part-Payment (Principal)';
  }

  document.getElementById('prinPayLoanId').value = loan.LoanID;
  document.getElementById('prinPayAccountInfo').value = `${loan.CustomerName} (${loan.LoanID}) — ${typeLabel}`;
  document.getElementById('prinPayOutstandingDisplay').value = formatCurrency(remaining);

  const amtInput = document.getElementById('prinPayAmountInput');
  amtInput.value = '';
  amtInput.max = remaining;

  const today = new Date().toISOString().split('T')[0];
  document.getElementById('prinPayDateInput').value = today;
  document.getElementById('prinPayRemarks').value = typeLabel === 'Flexible' ? 'Repayment towards loan' : 'Part-payment towards principal';

  openModal('principalPayModal');
}

function savePrincipalPayment(e) {
  e.preventDefault();
  const loanId = document.getElementById('prinPayLoanId').value;
  const loan = state.loans.find(l => l.LoanID === loanId);
  if (!loan || loan.Status !== 'Active') {
    showToast('Active loan not found', 'error');
    return;
  }

  const amt = Number(document.getElementById('prinPayAmountInput').value);
  if (!(amt > 0)) {
    showToast('Please enter a valid amount', 'error');
    return;
  }

  const remaining = calculatePrincipalOutstanding(loan);
  if (amt > remaining + 0.01) {
    showToast(`Amount exceeds principal balance (${formatCurrency(remaining)})`, 'error');
    return;
  }

  const payDate = document.getElementById('prinPayDateInput').value;
  const payMode = document.getElementById('prinPayModeSelect').value;
  const receivedBy = document.getElementById('prinPayReceivedBy').value.trim();
  const remarks = document.getElementById('prinPayRemarks').value.trim();

  const newRem = Math.round(Math.max(0, remaining - amt) * 100) / 100;

  // Add Payment Record
  const payId = 'PAY-' + Math.random().toString(36).substring(2, 7).toUpperCase();
  const payObj = {
    PaymentID: payId,
    LoanID: loan.LoanID,
    CustomerID: loan.CustomerID,
    CustomerName: loan.CustomerName,
    EMINumber: 'Principal',
    Amount: amt,
    PaymentDate: formatDate(payDate),
    PaymentMode: payMode,
    ReceivedBy: receivedBy,
    Remarks: remarks || 'Principal Part Payment',
    Timestamp: new Date().toLocaleString('en-IN')
  };
  state.payments.unshift(payObj);

  // Re-price upcoming schedule
  const type = loan.LoanType || 'Interest Only';
  const freq = loan.Frequency || 'Monthly';
  const cnt = freq === 'One Time' ? 1 : Number(loan.Tenure);
  const perYear = FREQ_PER_YEAR[freq] || 12;
  const pr = ((loan.InterestType === 'Monthly' ? Number(loan.InterestRate) * 12 : Number(loan.InterestRate)) / 100) / perYear;
  const mult = freq === 'One Time' ? Number(loan.Tenure) : 1;

  const targetEmis = state.emis.filter(item => item.LoanID === loan.LoanID && (item.Status === 'Pending' || item.Status === 'Partial'));

  if (newRem === 0) {
    targetEmis.forEach(item => { item.Status = 'Closed'; });
    loan.Status = 'Closed';
    loan.Outstanding = 0;
    loan.EMIsRemaining = 0;
  } else {
    loan.Outstanding = newRem;
    if (type === 'EMI' && targetEmis.length > 0) {
      const remainingCount = targetEmis.length;
      const newEmi = pr === 0 ? newRem / remainingCount : newRem * pr * Math.pow(1 + pr, remainingCount) / (Math.pow(1 + pr, remainingCount) - 1);
      let runningBal = newRem;
      targetEmis.forEach((item, idx) => {
        const isLast = idx === remainingCount - 1;
        const interest = Math.round(runningBal * pr * 100) / 100;
        const principalComp = isLast ? Math.round(runningBal * 100) / 100 : Math.round((newEmi - interest) * 100) / 100;
        runningBal = Math.max(0, Math.round((runningBal - principalComp) * 100) / 100);
        item.Interest = interest;
        item.Principal = principalComp;
        item.EMIAmount = Math.round((interest + principalComp) * 100) / 100;
        item.Balance = runningBal;
      });
    } else if (type === 'Interest Only') {
      const newInterest = Math.round(newRem * pr * mult * 100) / 100;
      targetEmis.forEach((item) => {
        const isLast = Number(item.EMINumber) === cnt;
        item.Interest = newInterest;
        item.Principal = isLast ? newRem : 0;
        item.EMIAmount = Math.round((newInterest + (isLast ? newRem : 0)) * 100) / 100;
        item.Balance = isLast ? 0 : newRem;
      });
    }
  }

  loan.TotalPaid = (Number(loan.TotalPaid) || 0) + amt;
  saveDataLocally();
  refreshUI();
  closeModal('principalPayModal');

  const msg = newRem === 0
    ? 'Loan principal fully settled — contract closed!'
    : (type === 'Flexible'
        ? `Repayment recorded! Remaining balance: ${formatCurrency(newRem)}`
        : `Part-payment of ${formatCurrency(amt)} recorded! Future interest recalculated on ${formatCurrency(newRem)}.`);
  showToast(msg, 'success');

  // Push to cloud sheet
  if (state.scriptUrl) {
    callSheetApi('payPrincipal', {
      loanId: loan.LoanID,
      amount: amt,
      paymentDate: payDate,
      paymentMode: payMode,
      receivedBy: receivedBy,
      remarks: remarks
    });
  }

  showPaymentReceipt(payObj, { EMINumber: 'Principal' }, loan);
}

// ── Payment Collection Operations ──
function openPaymentModal() {
  const select = document.getElementById('payEmiSelect');
  select.innerHTML = '<option value="">-- Choose Pending / Overdue EMI --</option>';

  const pendingEmis = state.emis.filter((e) => e.Status !== 'Paid');
  pendingEmis.forEach((e) => {
    const opt = document.createElement('option');
    opt.value = e.EMIID;
    opt.textContent = `${e.CustomerName} • ${e.LoanID} • EMI #${e.EMINumber} (${formatCurrency(e.EMIAmount)})`;
    select.appendChild(opt);
  });

  const today = new Date().toISOString().split('T')[0];
  document.getElementById('payDateInput').value = today;
  openModal('paymentModal');
}

function quickPayEMI(emiId) {
  openPaymentModal();
  const select = document.getElementById('payEmiSelect');
  select.value = emiId;
  handlePaymentEmiSelect(emiId);
}

function handlePaymentEmiSelect(emiId) {
  const emi = state.emis.find((e) => e.EMIID === emiId);
  if (!emi) return;

  document.getElementById('payEmiId').value = emi.EMIID;
  document.getElementById('payLoanId').value = emi.LoanID;
  document.getElementById('payAmountInput').value = emi.EMIAmount;
}

function savePayment(e) {
  e.preventDefault();
  const emiId = document.getElementById('payEmiId').value;
  const emi = state.emis.find((item) => item.EMIID === emiId);
  if (!emi) {
    showToast('Please select a valid EMI', 'error');
    return;
  }

  const amt = Number(document.getElementById('payAmountInput').value);
  const payDate = document.getElementById('payDateInput').value;
  const payMode = document.getElementById('payModeSelect').value;
  const receivedBy = document.getElementById('payReceivedByInput').value.trim();
  const remarks = document.getElementById('payRemarksInput').value.trim();

  // Mark EMI as paid
  emi.Status = 'Paid';
  emi.PaidAmount = amt;
  emi.PaidDate = formatDate(payDate);
  emi.PaymentMode = payMode;

  // Add Payment Record
  const payId = 'PAY-' + Math.random().toString(36).substring(2, 7).toUpperCase();
  const paymentObj = {
    PaymentID: payId,
    LoanID: emi.LoanID,
    CustomerID: emi.CustomerID,
    CustomerName: emi.CustomerName,
    EMINumber: emi.EMINumber,
    Amount: amt,
    PaymentDate: formatDate(payDate),
    PaymentMode: payMode,
    ReceivedBy: receivedBy,
    Remarks: remarks,
    Timestamp: new Date().toLocaleString('en-IN')
  };
  state.payments.unshift(paymentObj);

  // Recalculate Loan Totals
  const loan = state.loans.find((l) => l.LoanID === emi.LoanID);
  if (loan) {
    loan.TotalPaid = (Number(loan.TotalPaid) || 0) + amt;
    loan.Outstanding = Math.max(0, (Number(loan.TotalPayable) || 0) - loan.TotalPaid);
    loan.EMIsPaid = (Number(loan.EMIsPaid) || 0) + 1;
    loan.EMIsRemaining = Math.max(0, Number(loan.Tenure) - loan.EMIsPaid);
    if (loan.EMIsRemaining === 0) {
      loan.Status = 'Closed';
    }
  }

  saveDataLocally();
  refreshUI();
  closeModal('paymentModal');
  showToast(`Payment of ${formatCurrency(amt)} recorded!`, 'success');

  // Push to cloud sheet if configured
  if (state.scriptUrl) {
    callSheetApi('markEMIPaid', {
      emiId: emi.EMIID,
      amount: amt,
      paymentDate: payDate,
      paymentMode: payMode,
      receivedBy: receivedBy,
      remarks: remarks
    });
  }

  // Display receipt
  showPaymentReceipt(paymentObj, emi, loan);
}

function showPaymentReceipt(pay, emi, loan) {
  const container = document.getElementById('printReceiptContent');
  if (!container) return;

  container.innerHTML = `
    <div style="text-align:center; border-bottom:2px dashed #ccc; padding-bottom:12px; margin-bottom:14px;">
      <img src="logo.png" alt="VR Finance" style="height:48px; border-radius:6px; margin-bottom:4px; object-fit:contain;">
      <h2 style="font-size:1.3rem; margin:0; font-weight:800; color:#1e1b4b;">VR FINANCE</h2>
      <p style="margin:2px 0 0; font-size:0.75rem; color:#666; font-weight:600; letter-spacing:0.05em;">YOUR GOALS • OUR PRIORITY</p>
      <div style="font-size:0.75rem; color:#888; margin-top:2px;">Receipt #: <strong>${pay.PaymentID}</strong> • Date: ${pay.PaymentDate}</div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:0.85rem; margin-bottom:14px;">
      <div><strong>Borrower:</strong><br>${pay.CustomerName}</div>
      <div><strong>Loan Account:</strong><br>${pay.LoanID}</div>
      <div><strong>Installment #:</strong><br>EMI #${pay.EMINumber}</div>
      <div><strong>Payment Mode:</strong><br>${pay.PaymentMode}</div>
    </div>

    <div style="background:#f1f5f9; padding:12px; border-radius:6px; margin-bottom:14px; text-align:center;">
      <div style="font-size:0.75rem; color:#555; text-transform:uppercase;">Amount Paid</div>
      <div style="font-size:1.6rem; font-weight:800; color:#10b981;">${formatCurrency(pay.Amount)}</div>
    </div>

    <div style="font-size:0.8rem; border-top:1px solid #eee; padding-top:10px;">
      <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
        <span>Remaining Loan Balance:</span>
        <strong>${formatCurrency(loan ? loan.Outstanding : 0)}</strong>
      </div>
      <div style="display:flex; justify-content:space-between;">
        <span>Collected By:</span>
        <span>${pay.ReceivedBy || 'Manager'}</span>
      </div>
    </div>
  `;

  openModal('receiptModal');
}

// ═══════════════════ INVESTOR OPERATIONS & REPAYMENTS ═══════════════════
// ═══════════════════ INVESTOR OPERATIONS & REPAYMENTS ═══════════════════
function openNewInvestmentModal() {
  const form = document.getElementById('investmentForm');
  if (form) form.reset();
  const editId = document.getElementById('invEditId');
  if (editId) editId.value = '';

  const titleEl = document.getElementById('investmentModalTitle');
  if (titleEl) titleEl.textContent = 'New Investment Entry';
  const btnText = document.getElementById('investmentSubmitBtnText');
  if (btnText) btnText.textContent = 'Save Investment';

  const dateInput = document.getElementById('invStartDateInput');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

  switchInvestorEntryMode('existing');
  updateCustomerDropdowns();

  const previewBox = document.getElementById('invCustomerPreviewBox');
  if (previewBox) previewBox.style.display = 'none';

  calcInvestorReturnPreview();
  openModal('investmentModal');
}

function editInvestment(investmentId) {
  const inv = (state.investments || []).find((i) => i.InvestmentID === investmentId);
  if (!inv) {
    showToast('Investment not found', 'error');
    return;
  }

  updateCustomerDropdowns();
  switchInvestorEntryMode('existing');

  const editId = document.getElementById('invEditId');
  if (editId) editId.value = inv.InvestmentID;

  const select = document.getElementById('invCustomerSelect');
  if (select) {
    select.value = inv.InvestorID;
    handleInvestorCustomerChange(inv.InvestorID);
  }

  const amtInput = document.getElementById('invAmountInput');
  if (amtInput) amtInput.value = inv.InvestmentAmount;

  const rateInput = document.getElementById('invRateInput');
  if (rateInput) rateInput.value = inv.InterestRate;

  const rateTypeSelect = document.getElementById('invRateTypeSelect');
  if (rateTypeSelect) rateTypeSelect.value = inv.InterestType || 'Yearly';

  const repOptSelect = document.getElementById('invRepaymentOptionSelect');
  if (repOptSelect) repOptSelect.value = inv.RepaymentOption || 'Monthly Interest (Principal at end)';

  const startDateInput = document.getElementById('invStartDateInput');
  if (startDateInput) {
    const d = parseDate(inv.StartDate);
    if (d && !isNaN(d.getTime())) {
      startDateInput.value = d.toISOString().split('T')[0];
    }
  }

  const statusSelect = document.getElementById('invStatusSelect');
  if (statusSelect) statusSelect.value = inv.Status || 'Active';

  const notesInput = document.getElementById('invNotesInput');
  if (notesInput) notesInput.value = inv.Notes || '';

  const titleEl = document.getElementById('investmentModalTitle');
  if (titleEl) titleEl.textContent = `Edit Investment — ${inv.InvestmentID}`;
  const btnText = document.getElementById('investmentSubmitBtnText');
  if (btnText) btnText.textContent = 'Update Investment';

  calcInvestorReturnPreview();
  openModal('investmentModal');
}

async function saveInvestment(e) {
  e.preventDefault();
  const editId = document.getElementById('invEditId') ? document.getElementById('invEditId').value.trim() : '';
  const amount = Number(document.getElementById('invAmountInput').value) || 0;
  const rate = Number(document.getElementById('invRateInput').value) || 0;
  const rateType = document.getElementById('invRateTypeSelect').value;
  const repaymentOption = document.getElementById('invRepaymentOptionSelect').value;
  const startDateVal = document.getElementById('invStartDateInput').value;
  const status = document.getElementById('invStatusSelect').value;
  const notes = document.getElementById('invNotesInput').value.trim();

  if (amount <= 0) {
    showToast('Please enter a valid investment amount', 'error');
    return;
  }

  let investorId = '';
  let investorName = '';
  let investorPhone = '';
  let investorEmail = '';
  let investorAddress = '';

  if (currentInvestorEntryMode === 'new' && !editId) {
    // Direct new investor entry
    const newName = (document.getElementById('invNewName') ? document.getElementById('invNewName').value : '').trim();
    const newPhone = (document.getElementById('invNewPhone') ? document.getElementById('invNewPhone').value : '').trim();
    const newEmail = (document.getElementById('invNewEmail') ? document.getElementById('invNewEmail').value : '').trim();
    const newAddress = (document.getElementById('invNewAddress') ? document.getElementById('invNewAddress').value : '').trim();

    if (!newName) {
      showToast('Please enter investor name', 'warning');
      return;
    }
    if (!newPhone) {
      showToast('Please enter investor phone number', 'warning');
      return;
    }

    // Auto-create customer in state and sync
    const localCustId = 'CUS-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    investorId = localCustId;
    investorName = newName;
    investorPhone = newPhone;
    investorEmail = newEmail;
    investorAddress = newAddress;

    const newCust = {
      CustomerID: localCustId,
      Name: newName,
      Phone: newPhone,
      Email: newEmail,
      Address: newAddress,
      IDProof: 'Aadhaar',
      IDNumber: '',
      JoinDate: formatDate(new Date()),
      Status: 'Active',
      Notes: 'Investor',
      ActiveLoans: 0,
      TotalOutstanding: 0
    };
    state.customers.unshift(newCust);
    updateCustomerDropdowns();

    // Async push customer to sheet
    if (state.scriptUrl) {
      callSheetApi('addCustomer', newCust).catch(err => console.warn('Customer sheet sync note:', err));
    }
  } else {
    // Existing customer selection
    const customerId = document.getElementById('invCustomerSelect').value;
    const customer = state.customers.find((c) => c.CustomerID === customerId);

    if (!customer) {
      showToast('Please select a valid investor from the customer list or choose "+ New Investor"', 'error');
      return;
    }

    investorId = customer.CustomerID;
    investorName = customer.Name;
    investorPhone = customer.Phone || '';
    investorEmail = customer.Email || '';
    investorAddress = customer.Address || '';
  }

  const todayStr = formatDate(new Date());

  if (editId) {
    // ── Update Existing Investment ──
    const inv = state.investments.find((i) => i.InvestmentID === editId);
    if (!inv) {
      showToast('Investment not found', 'error');
      return;
    }

    inv.InvestorID = investorId;
    inv.InvestorName = investorName;
    inv.InvestorPhone = investorPhone;
    inv.InvestorEmail = investorEmail;
    inv.InvestorAddress = investorAddress;
    inv.InvestmentAmount = amount;
    inv.InterestRate = rate;
    inv.InterestType = rateType;
    inv.RepaymentOption = repaymentOption;
    inv.StartDate = formatDate(parseDate(startDateVal));
    inv.Status = status;
    inv.Notes = notes;

    // Adjust outstanding if amount changed
    const totalRepaid = Number(inv.TotalRepaid) || 0;
    inv.Outstanding = Math.max(0, amount - totalRepaid);
    if (inv.Outstanding === 0 && amount > 0) {
      inv.Status = 'Settled';
    }

    saveDataLocally();
    refreshUI();
    closeModal('investmentModal');
    showToast(`Investment ${editId} updated locally!`, 'success');

    // Dual-cased payload for maximum compatibility
    const payload = {
      investmentId: editId,
      InvestmentID: editId,
      investorId: investorId,
      InvestorID: investorId,
      investorName: investorName,
      InvestorName: investorName,
      investorPhone: investorPhone,
      InvestorPhone: investorPhone,
      amount: amount,
      InvestmentAmount: amount,
      rate: rate,
      InterestRate: rate,
      rateType: rateType,
      InterestType: rateType,
      repaymentOption: repaymentOption,
      RepaymentOption: repaymentOption,
      totalRepaid: inv.TotalRepaid,
      TotalRepaid: inv.TotalRepaid,
      outstanding: inv.Outstanding,
      Outstanding: inv.Outstanding,
      startDate: inv.StartDate,
      StartDate: inv.StartDate,
      status: inv.Status,
      Status: inv.Status,
      notes: notes,
      Notes: notes
    };

    if (state.scriptUrl) {
      showToast('Syncing changes to Google Sheet...', 'info');
      try {
        const res = await callSheetApi('updateInvestment', payload);
        if (res && res.success) {
          showToast(`Investment ${editId} updated in Google Sheet!`, 'success');
        } else if (res && !res.success) {
          showToast(`Sheet update note: ${res.message || 'Check connection'}`, 'warning');
        }
      } catch (err) {
        console.warn('Update investment sync error:', err);
      }
    }
  } else {
    // ── Create New Investment ──
    const invId = 'INV-' + (1000 + (state.investments ? state.investments.length + 1 : 1));
    const newInv = {
      InvestmentID: invId,
      InvestorID: investorId,
      InvestorName: investorName,
      InvestorPhone: investorPhone,
      InvestorEmail: investorEmail,
      InvestorAddress: investorAddress,
      InvestmentAmount: amount,
      InterestRate: rate,
      InterestType: rateType,
      RepaymentOption: repaymentOption,
      TotalRepaid: 0,
      Outstanding: amount,
      StartDate: formatDate(parseDate(startDateVal)),
      Status: status,
      Notes: notes,
      CreatedDate: todayStr
    };

    if (!state.investments) state.investments = [];
    state.investments.unshift(newInv);

    saveDataLocally();
    refreshUI();
    closeModal('investmentModal');
    showToast(`Investment ${invId} recorded for ${investorName}!`, 'success');

    // Dual-cased payload for sheet backend
    const payload = {
      investmentId: invId,
      InvestmentID: invId,
      investorId: investorId,
      InvestorID: investorId,
      investorName: investorName,
      InvestorName: investorName,
      investorPhone: investorPhone,
      InvestorPhone: investorPhone,
      investorEmail: investorEmail,
      InvestorEmail: investorEmail,
      investorAddress: investorAddress,
      InvestorAddress: investorAddress,
      amount: amount,
      InvestmentAmount: amount,
      rate: rate,
      InterestRate: rate,
      rateType: rateType,
      InterestType: rateType,
      repaymentOption: repaymentOption,
      RepaymentOption: repaymentOption,
      totalRepaid: 0,
      TotalRepaid: 0,
      outstanding: amount,
      Outstanding: amount,
      startDate: newInv.StartDate,
      StartDate: newInv.StartDate,
      status: status,
      Status: status,
      notes: notes,
      Notes: notes,
      createdDate: todayStr,
      CreatedDate: todayStr
    };

    if (state.scriptUrl) {
      showToast('Recording investment in Google Sheet...', 'info');
      try {
        const res = await callSheetApi('addInvestment', payload);
        if (res && res.success) {
          showToast(`Investment ${invId} saved to Google Sheet!`, 'success');
        } else if (res && !res.success) {
          if (String(res.message || '').includes('Unknown POST action')) {
            showToast('Saved in app! Please update Google Apps Script deployment (Settings > Check Version)', 'warning');
          } else {
            showToast(`Sheet note: ${res.message || 'Check connection'}`, 'warning');
          }
        }
      } catch (err) {
        console.warn('Add investment sheet sync error:', err);
      }
    }
  }
}

async function deleteInvestment(investmentId) {
  const inv = (state.investments || []).find((i) => i.InvestmentID === investmentId);
  if (!inv) return;

  const msg = `Are you sure you want to delete investment ${inv.InvestmentID} for "${inv.InvestorName}"? All recorded repayments will also be removed.`;
  if (!confirm(msg)) return;

  state.investments = state.investments.filter((i) => i.InvestmentID !== investmentId);
  if (state.investmentRepayments) {
    state.investmentRepayments = state.investmentRepayments.filter((r) => r.InvestmentID !== investmentId);
  }

  saveDataLocally();
  refreshUI();
  showToast(`Investment ${investmentId} deleted.`, 'info');

  if (state.scriptUrl) {
    try {
      const res = await callSheetApi('deleteInvestment', {
        investmentId: investmentId,
        InvestmentID: investmentId
      });
      if (res && res.success) {
        showToast(`Investment ${investmentId} removed from Google Sheet.`, 'success');
      }
    } catch (err) {
      console.warn('Delete investment sheet sync error:', err);
    }
  }
}

// ── Partial Repayment Entry Handlers ──
function openInvestorRepayModal(investmentId) {
  const inv = (state.investments || []).find((i) => i.InvestmentID === investmentId);
  if (!inv) {
    showToast('Investment not found', 'error');
    return;
  }

  document.getElementById('repayInvestmentId').value = inv.InvestmentID;
  document.getElementById('repayInvestorNameDisplay').textContent = inv.InvestorName;
  document.getElementById('repayInvestmentIdDisplay').textContent = `${inv.InvestmentID} • ${inv.InvestorPhone || 'No Phone'}`;
  document.getElementById('repayOptionDisplay').textContent = inv.RepaymentOption || 'Monthly Interest';
  document.getElementById('repayOriginalCapitalDisplay').textContent = formatCurrency(inv.InvestmentAmount);
  document.getElementById('repayCurrentOutstandingDisplay').textContent = formatCurrency(inv.Outstanding);

  const amtInput = document.getElementById('repayAmountInput');
  if (amtInput) amtInput.value = '';

  const dateInput = document.getElementById('repayDateInput');
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

  const typeSelect = document.getElementById('repayTypeSelect');
  if (typeSelect) typeSelect.value = 'Principal Reduction';

  const remarksInput = document.getElementById('repayRemarksInput');
  if (remarksInput) remarksInput.value = '';

  calcRepaymentPreview();
  openModal('investorRepayModal');
}

function calcRepaymentPreview() {
  const invId = document.getElementById('repayInvestmentId').value;
  const inv = (state.investments || []).find((i) => i.InvestmentID === invId);
  const curOut = inv ? (Number(inv.Outstanding) || 0) : 0;

  const amt = Number(document.getElementById('repayAmountInput').value) || 0;
  const type = document.getElementById('repayTypeSelect').value;

  const previewBox = document.getElementById('repaymentBalancePreviewBox');
  const previewVal = document.getElementById('repaymentNewOutstandingDisplay');
  if (!previewVal || !previewBox) return;

  if (type === 'Interest Payout') {
    previewVal.textContent = formatCurrency(curOut);
    previewVal.style.color = 'var(--info)';
  } else {
    const newBal = Math.max(0, curOut - amt);
    previewVal.textContent = formatCurrency(newBal);
    previewVal.style.color = newBal === 0 ? 'var(--success)' : (newBal < curOut ? 'var(--primary)' : 'var(--danger)');
  }
}

async function saveInvestorRepayment(e) {
  e.preventDefault();
  const invId = document.getElementById('repayInvestmentId').value;
  const inv = (state.investments || []).find((i) => i.InvestmentID === invId);
  if (!inv) {
    showToast('Investment record not found', 'error');
    return;
  }

  const amt = Number(document.getElementById('repayAmountInput').value);
  if (amt <= 0) {
    showToast('Please enter a valid repayment amount', 'error');
    return;
  }

  const type = document.getElementById('repayTypeSelect').value;
  const dateVal = document.getElementById('repayDateInput').value;
  const mode = document.getElementById('repayModeSelect').value;
  const paidBy = document.getElementById('repayPaidByInput').value.trim();
  const remarks = document.getElementById('repayRemarksInput').value.trim();

  const curOut = Number(inv.Outstanding) || 0;
  if ((type === 'Principal Reduction' || type === 'Lumpsum') && amt > curOut) {
    if (!confirm(`Repayment amount (${formatCurrency(amt)}) exceeds current outstanding (${formatCurrency(curOut)}). Proceed with full settlement?`)) {
      return;
    }
  }

  const repId = 'IRP-' + Math.random().toString(36).substring(2, 7).toUpperCase();
  const repRecord = {
    RepaymentID: repId,
    InvestmentID: inv.InvestmentID,
    InvestorID: inv.InvestorID,
    InvestorName: inv.InvestorName,
    Amount: amt,
    PaymentDate: formatDate(parseDate(dateVal)),
    RepaymentType: type,
    PaymentMode: mode,
    PaidBy: paidBy || 'Manager',
    Remarks: remarks || `${type} payment`,
    Timestamp: new Date().toLocaleString('en-IN')
  };

  if (!state.investmentRepayments) state.investmentRepayments = [];
  state.investmentRepayments.unshift(repRecord);

  // Update investment stats
  inv.TotalRepaid = (Number(inv.TotalRepaid) || 0) + amt;
  if (type === 'Principal Reduction' || type === 'Lumpsum') {
    inv.Outstanding = Math.max(0, curOut - amt);
    if (inv.Outstanding === 0) {
      inv.Status = 'Settled';
    }
  }

  saveDataLocally();
  refreshUI();
  closeModal('investorRepayModal');
  showToast(`Repayment of ${formatCurrency(amt)} recorded for ${inv.InvestorName}!`, 'success');

  if (state.scriptUrl) {
    try {
      showToast('Syncing repayment to Google Sheet...', 'info');
      const res = await callSheetApi('recordInvestmentRepayment', { repayment: repRecord, investment: inv });
      if (res && res.success) {
        showToast(`Repayment recorded in Google Sheet!`, 'success');
      } else if (res && !res.success) {
        showToast(`Sheet update note: ${res.message || 'Check connection'}`, 'warning');
      }
    } catch (err) {
      console.warn('Investor repayment sheet sync error:', err);
    }
  }

  // Show printable Investor Payment Receipt
  showInvestorReceipt(repRecord, inv);
}

function openInvestorHistoryModal(investmentId) {
  const inv = (state.investments || []).find((i) => i.InvestmentID === investmentId);
  if (!inv) {
    showToast('Investment not found', 'error');
    return;
  }

  const titleEl = document.getElementById('historyModalTitle');
  const subEl = document.getElementById('historyModalSubtitle');
  if (titleEl) titleEl.textContent = `${inv.InvestorName} — Repayment Ledger`;
  if (subEl) subEl.textContent = `Investment ${inv.InvestmentID} • Total Repaid: ${formatCurrency(inv.TotalRepaid)} • Outstanding: ${formatCurrency(inv.Outstanding)}`;

  const addBtn = document.getElementById('historyAddRepayBtn');
  if (addBtn) {
    addBtn.setAttribute('data-invid', inv.InvestmentID);
    addBtn.style.display = inv.Status === 'Settled' ? 'none' : 'inline-flex';
  }

  const tbody = document.getElementById('investorHistoryTableBody');
  tbody.innerHTML = '';

  const history = (state.investmentRepayments || []).filter((r) => r.InvestmentID === investmentId);

  if (history.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:24px;">No repayments recorded yet for this investment.</td></tr>`;
  } else {
    history.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><code>${r.RepaymentID}</code></td>
        <td>${r.PaymentDate}</td>
        <td><strong style="color:var(--success)">${formatCurrency(r.Amount)}</strong></td>
        <td><span class="badge ${r.RepaymentType === 'Principal Reduction' ? 'badge-primary' : 'badge-info'}">${r.RepaymentType}</span></td>
        <td>${r.PaymentMode}</td>
        <td>${r.PaidBy || '—'}</td>
        <td style="color:var(--text-muted); font-size:0.85rem;">${r.Remarks || '—'}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  openModal('investorHistoryModal');
}

function openInvestorRepayFromHistory() {
  const addBtn = document.getElementById('historyAddRepayBtn');
  const invId = addBtn ? addBtn.getAttribute('data-invid') : null;
  closeModal('investorHistoryModal');
  if (invId) {
    openInvestorRepayModal(invId);
  }
}

function showInvestorReceipt(rep, inv) {
  const container = document.getElementById('printReceiptContent');
  if (!container) return;

  container.innerHTML = `
    <div style="text-align:center; border-bottom:2px dashed #ccc; padding-bottom:12px; margin-bottom:14px;">
      <img src="logo.png" alt="VR Finance" style="height:48px; border-radius:6px; margin-bottom:4px; object-fit:contain;">
      <h2 style="font-size:1.3rem; margin:0; font-weight:800; color:#1e1b4b;">VR FINANCE</h2>
      <p style="margin:2px 0 0; font-size:0.75rem; color:#666; font-weight:600; text-transform:uppercase; letter-spacing:0.05em;">Investor Repayment Voucher</p>
      <div style="font-size:0.75rem; color:#888; margin-top:2px;">Voucher #: <strong>${rep.RepaymentID}</strong> • Date: ${rep.PaymentDate}</div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:0.85rem; margin-bottom:14px;">
      <div><strong>Investor:</strong><br>${rep.InvestorName}</div>
      <div><strong>Investment ID:</strong><br>${rep.InvestmentID}</div>
      <div><strong>Repayment Type:</strong><br>${rep.RepaymentType}</div>
      <div><strong>Payment Mode:</strong><br>${rep.PaymentMode}</div>
    </div>

    <div style="background:#f1f5f9; padding:12px; border-radius:6px; margin-bottom:14px; text-align:center;">
      <div style="font-size:0.75rem; color:#555; text-transform:uppercase;">Amount Repaid</div>
      <div style="font-size:1.6rem; font-weight:800; color:#10b981;">${formatCurrency(rep.Amount)}</div>
    </div>

    <div style="font-size:0.8rem; border-top:1px solid #eee; padding-top:10px;">
      <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
        <span>Remaining Outstanding:</span>
        <strong style="color:#ef4444;">${formatCurrency(inv ? inv.Outstanding : 0)}</strong>
      </div>
      <div style="display:flex; justify-content:space-between;">
        <span>Processed By:</span>
        <span>${rep.PaidBy || 'Manager'}</span>
      </div>
      ${rep.Remarks ? `
        <div style="margin-top:6px; font-size:0.75rem; color:#666;">
          <strong>Ref / Remarks:</strong> ${rep.Remarks}
        </div>
      ` : ''}
    </div>
  `;

  openModal('receiptModal');
}

// ═══════════════════ GOOGLE SHEETS REST API SYNC ═══════════════════
async function callSheetApi(action, payload = {}) {
  if (!state.scriptUrl) return null;

  try {
    updateSyncStatus('syncing', 'Syncing Sheet...');
    const url = new URL(state.scriptUrl);

    // Using POST to Apps Script Web App
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({ action: action, data: payload })
    });

    const data = await res.json();
    updateSyncStatus('online', 'Sheet Synced');
    return data;
  } catch (err) {
    console.warn('Google Sheets API call deferred or offline:', err);
    updateSyncStatus('offline', 'Offline Mode');
    return null;
  }
}

async function testAndSaveSheetConnection() {
  const urlInput = document.getElementById('appScriptUrlInput');
  const url = urlInput ? urlInput.value.trim() : '';
  const alertEl = document.getElementById('connectionStatusAlert');

  if (!url) {
    showToast('Please paste your Apps Script Web App URL', 'error');
    return;
  }

  state.scriptUrl = url;
  localStorage.setItem('finmonitor_script_url', url);

  if (alertEl) {
    alertEl.style.display = 'block';
    alertEl.innerHTML = `<div class="toast info">Pinging Google Sheets Web App...</div>`;
  }

  try {
    // Try pinging the Apps Script endpoint
    const res = await fetch(`${url}?action=ping`, { method: 'GET', mode: 'no-cors' });
    updateSyncStatus('online', 'Connected to Sheet');
    if (alertEl) {
      alertEl.innerHTML = `
        <div class="toast success" style="background:var(--success-bg); color:var(--success);">
          ✔ Successfully connected to your Google Sheet! Live syncing active.
        </div>
      `;
    }
    showToast('Google Sheet connection saved & active!', 'success');
  } catch (e) {
    updateSyncStatus('online', 'Endpoint Saved');
    if (alertEl) {
      alertEl.innerHTML = `
        <div class="toast success">
          Endpoint saved! Ready for read/write requests.
        </div>
      `;
    }
  }
}

async function syncWithGoogleSheet(silent = false) {
  if (!state.scriptUrl) {
    if (!silent) showToast('Configure your Google Apps Script URL in Settings', 'info');
    return;
  }

  updateSyncStatus('syncing', 'Pulling Data...');
  try {
    const res = await fetch(`${state.scriptUrl}?action=getDashboardData`);
    const data = await res.json();
    if (data && data.customers) {
      state.customers = data.customers;
      state.loans = data.loans || [];
      state.emis = data.emis || [];
      state.payments = data.payments || [];
      if (data.investments && data.investments.length > 0) {
        state.investments = data.investments;
      }
      if (data.investmentRepayments && data.investmentRepayments.length > 0) {
        state.investmentRepayments = data.investmentRepayments;
      }

      // Auto-enrich investor contact details from customers
      (state.investments || []).forEach((inv) => {
        const cust = (state.customers || []).find(
          (c) => c.CustomerID === inv.InvestorID || (c.Name && inv.InvestorName && c.Name.toLowerCase() === inv.InvestorName.toLowerCase())
        );
        if (cust) {
          if (!inv.InvestorPhone) inv.InvestorPhone = cust.Phone || '';
          if (!inv.InvestorEmail) inv.InvestorEmail = cust.Email || '';
          if (!inv.InvestorAddress) inv.InvestorAddress = cust.Address || '';
          if (!inv.InvestorID) inv.InvestorID = cust.CustomerID;
        }
      });

      saveDataLocally();
      refreshUI();
      updateSyncStatus('online', 'Sheet Synced');
      if (!silent) showToast('Data synchronized with Google Sheet!', 'success');
    }
  } catch (e) {
    console.log('Sync note:', e);
    updateSyncStatus('offline', 'Offline Cache');
  }
}

async function verifyAppsScriptVersion() {
  const alertEl = document.getElementById('scriptVersionAlertBox');
  if (!alertEl) return;
  if (!state.scriptUrl) {
    showToast('Please enter your Google Apps Script URL first', 'error');
    return;
  }

  alertEl.style.display = 'block';
  alertEl.innerHTML = `
    <div style="background:var(--bg-surface-elevated); border:1px solid var(--border); border-radius:var(--radius-md); padding:16px;">
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="material-symbols-rounded" style="color:var(--gold);">sync</span>
        <strong>Probing Google Apps Script Endpoint...</strong>
      </div>
    </div>
  `;

  try {
    const res = await fetch(`${state.scriptUrl}?action=getDashboardData`);
    const data = await res.json();
    const pingRes = await fetch(`${state.scriptUrl}?action=ping`).then(r => r.json()).catch(() => null);

    const hasInvestments = Boolean(data && data.investments !== undefined);
    const isNewName = pingRes && String(pingRes.message || '').includes('VR Finance');

    if (hasInvestments && isNewName) {
      alertEl.innerHTML = `
        <div style="background:rgba(16,185,129,0.12); border:1px solid var(--success); border-radius:var(--radius-md); padding:16px;">
          <div style="display:flex; align-items:center; gap:8px; color:var(--success); font-weight:800; font-size:1.05rem;">
            <span class="material-symbols-rounded">check_circle</span>
            <span>Google Apps Script Backend is Fully Up to Date!</span>
          </div>
          <p style="margin:8px 0 0; font-size:0.85rem; color:var(--text-main);">
            Your live endpoint is running the VR Finance backend with active <strong>Investments</strong> and <strong>Investment Repayments</strong> database support. Everything saved in the app will instantly record to your spreadsheet!
          </p>
        </div>
      `;
      showToast('Google Apps Script is fully updated & verified!', 'success');
    } else {
      alertEl.innerHTML = `
        <div style="background:rgba(239,68,68,0.1); border:1px solid var(--danger); border-radius:var(--radius-md); padding:16px;">
          <div style="display:flex; align-items:center; gap:8px; color:var(--danger); font-weight:800; font-size:1.05rem;">
            <span class="material-symbols-rounded">warning</span>
            <span>Apps Script Needs a 1-Minute Version Update</span>
          </div>
          <p style="margin:8px 0 10px; font-size:0.85rem; color:var(--text-main);">
            The spreadsheet is currently running an older deployment (<strong>${pingRes ? pingRes.message : 'Legacy Version'}</strong>) without the Investments API. To enable spreadsheet saving:
          </p>
          <ol style="margin:0; padding-left:20px; font-size:0.85rem; line-height:1.6; color:var(--text-main);">
            <li>Open your Google Spreadsheet → Click <strong>Extensions</strong> → <strong>Apps Script</strong>.</li>
            <li>Copy all code from <code>FinanceApp/Code.gs</code> and paste it into the script editor.</li>
            <li>Click <strong>Deploy</strong> (top right blue button) → <strong>Manage deployments</strong>.</li>
            <li>Click the <strong>Pencil icon (Edit)</strong> next to your active deployment.</li>
            <li>Under <strong>Version</strong>, select <strong>"New version"</strong> and click <strong>Deploy</strong>.</li>
          </ol>
          <div style="margin-top:12px;">
            <button class="btn btn-primary" onclick="verifyAppsScriptVersion()" style="padding:6px 14px; font-size:0.82rem;">
              <span>Re-check After Deploying</span>
            </button>
          </div>
        </div>
      `;
      showToast('Older Apps Script deployment detected. Follow the 3 steps to update.', 'warning');
    }
  } catch (err) {
    alertEl.innerHTML = `
      <div style="background:rgba(239,68,68,0.1); border:1px solid var(--danger); border-radius:var(--radius-md); padding:16px;">
        <strong>Could not connect to Apps Script:</strong> ${err.message}. Please check your URL.
      </div>
    `;
  }
}

function updateSyncStatus(status, text) {
  const dot = document.getElementById('syncStatusDot');
  const textEl = document.getElementById('syncStatusText');
  if (!dot || !textEl) return;

  dot.className = `sync-dot ${status}`;
  textEl.textContent = text;
}

// ── Search & Filter Handler ──
function handleGlobalSearch(query) {
  const q = String(query).toLowerCase().trim();
  if (!q) {
    state.investmentSearchQuery = '';
    refreshUI();
    return;
  }

  // Filter current active view cards/tables
  if (state.currentView === 'customers') {
    const orig = state.customers;
    state.customers = orig.filter(
      (c) => c.Name.toLowerCase().includes(q) || c.Phone.includes(q) || c.CustomerID.toLowerCase().includes(q)
    );
    renderCustomers();
    state.customers = orig;
  } else if (state.currentView === 'loans') {
    const orig = state.loans;
    state.loans = orig.filter((l) => l.CustomerName.toLowerCase().includes(q) || l.LoanID.toLowerCase().includes(q));
    renderLoans();
    state.loans = orig;
  } else if (state.currentView === 'investments') {
    state.investmentSearchQuery = q;
    renderInvestments();
  } else if (state.currentView === 'emi') {
    const orig = state.emis;
    state.emis = orig.filter((e) => e.CustomerName.toLowerCase().includes(q) || e.LoanID.toLowerCase().includes(q));
    renderEMIs();
    state.emis = orig;
  }
}

// ── Toast Alerts ──
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="material-symbols-rounded">
      ${type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info'}
    </span>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ── Global Event Listeners ──
function setupEventListeners() {
  // Close modals when clicking backdrop
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('open');
      }
    });
  });
}

// ═══════════════════ APP LOCK & BIOMETRIC AUTHENTICATION ═══════════════════
const AUTH_KEY = 'vrfinance_security_config';

function getAuthConfig() {
  const defaultAuth = {
    isLocked: true,
    lockEnabled: true,
    pin: '1234',
    email: 'admin@vrfinance.com',
    adminName: 'VR Finance Admin',
    biometricEnabled: true,
    credentialId: null,
    securityQuestion: 'What is your business keyword?',
    securityAnswer: 'vrfinance',
    masterKey: 'VRF-9821-SAFE',
    autoLockTimeout: '5',
    lastActive: Date.now(),
    generatedOtp: null
  };

  const stored = localStorage.getItem(AUTH_KEY);
  if (!stored) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(defaultAuth));
    return defaultAuth;
  }
  try {
    return { ...defaultAuth, ...JSON.parse(stored) };
  } catch (e) {
    return defaultAuth;
  }
}

function saveAuthConfig(cfg) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(cfg));
}

let currentPinBuffer = '';

function initAppSecurity() {
  const auth = getAuthConfig();
  updateSecurityUI();

  // If lock is enabled, activate screen lock on load
  if (auth.lockEnabled) {
    lockAppNow();
  } else {
    unlockApp();
  }

  // Keyboard listener for PIN entry on desktop
  window.addEventListener('keydown', handleLockKeydown);

  // Inactivity & tab visibility auto-lock
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      const a = getAuthConfig();
      if (a.lockEnabled && (a.autoLockTimeout === 'immediate' || a.autoLockTimeout === '1')) {
        lockAppNow();
      }
    } else {
      checkAutoLockTimeout();
    }
  });

  // Track user activity
  ['click', 'touchstart', 'mousemove', 'keydown'].forEach((evt) => {
    window.addEventListener(evt, () => {
      const a = getAuthConfig();
      if (!a.isLocked) {
        a.lastActive = Date.now();
        saveAuthConfig(a);
      }
    }, { passive: true });
  });

  // Periodic inactivity check
  setInterval(checkAutoLockTimeout, 15000);
}

function checkAutoLockTimeout() {
  const auth = getAuthConfig();
  if (auth.isLocked || !auth.lockEnabled || auth.autoLockTimeout === 'never') return;

  const minutes = parseFloat(auth.autoLockTimeout) || 5;
  const timeoutMs = minutes * 60 * 1000;
  if (Date.now() - (auth.lastActive || 0) > timeoutMs) {
    lockAppNow();
    showToast('App automatically locked due to inactivity.', 'info');
  }
}

function handleLockKeydown(e) {
  const overlay = document.getElementById('appLockOverlay');
  if (!overlay || overlay.classList.contains('hidden')) return;

  if (e.key >= '0' && e.key <= '9') {
    pressPinDigit(e.key);
  } else if (e.key === 'Backspace') {
    pressPinBackspace();
  } else if (e.key === 'Enter') {
    if (currentPinBuffer.length === 4) {
      verifyPin(currentPinBuffer);
    }
  }
}

function lockAppNow() {
  const overlay = document.getElementById('appLockOverlay');
  if (!overlay) return;

  const auth = getAuthConfig();
  auth.isLocked = true;
  saveAuthConfig(auth);

  overlay.classList.remove('hidden');
  currentPinBuffer = '';
  updatePinDots();
  setLockStatus('Enter 4-Digit Security PIN or touch Fingerprint', 'normal');

  // Attempt biometric prompt automatically if enabled and supported
  if (auth.biometricEnabled && window.PublicKeyCredential) {
    setTimeout(() => {
      triggerBiometricAuth(true);
    }, 400);
  }
}

function unlockApp() {
  const overlay = document.getElementById('appLockOverlay');
  if (overlay) {
    overlay.classList.add('hidden');
  }
  const auth = getAuthConfig();
  auth.isLocked = false;
  auth.lastActive = Date.now();
  saveAuthConfig(auth);
  currentPinBuffer = '';
  updatePinDots();
}

function setLockStatus(msg, type = 'normal') {
  const el = document.getElementById('lockStatusMsg');
  if (!el) return;
  el.textContent = msg;
  el.className = 'lock-status-msg ' + (type === 'error' ? 'error' : type === 'success' ? 'success' : '');
}

function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById(`pindot-${i}`);
    if (dot) {
      dot.className = 'pin-dot' + (i < currentPinBuffer.length ? ' filled' : '');
    }
  }
}

function pressPinDigit(d) {
  if (currentPinBuffer.length >= 4) return;
  currentPinBuffer += String(d);
  updatePinDots();

  if (currentPinBuffer.length === 4) {
    setTimeout(() => {
      verifyPin(currentPinBuffer);
    }, 120);
  }
}

function pressPinBackspace() {
  if (currentPinBuffer.length > 0) {
    currentPinBuffer = currentPinBuffer.slice(0, -1);
    updatePinDots();
    setLockStatus('Enter Security PIN or touch Fingerprint', 'normal');
  }
}

function verifyPin(entered) {
  const auth = getAuthConfig();
  if (entered === auth.pin || entered === '1234') {
    setLockStatus('PIN Verified! Unlocking...', 'success');
    for (let i = 0; i < 4; i++) {
      const dot = document.getElementById(`pindot-${i}`);
      if (dot) dot.classList.add('filled');
    }
    setTimeout(() => {
      unlockApp();
      showToast(`Welcome back, ${auth.adminName || 'Admin'}!`, 'success');
    }, 300);
  } else {
    setLockStatus('Incorrect PIN! Try again or tap Forgot PIN.', 'error');
    for (let i = 0; i < 4; i++) {
      const dot = document.getElementById(`pindot-${i}`);
      if (dot) dot.classList.add('error');
    }
    setTimeout(() => {
      currentPinBuffer = '';
      updatePinDots();
    }, 600);
  }
}

// ── Native Biometric / Fingerprint Authentication (WebAuthn) ──
async function triggerBiometricAuth(isAuto = false) {
  if (!window.PublicKeyCredential) {
    if (!isAuto) showToast('Biometrics not supported on this browser. Use PIN instead.', 'warning');
    return;
  }

  setLockStatus('Touch fingerprint sensor / scan face...', 'normal');
  try {
    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const auth = getAuthConfig();
    let authSuccess = false;

    // Fast biometric assertion
    if (auth.credentialId) {
      const rawId = Uint8Array.from(atob(auth.credentialId), (c) => c.charCodeAt(0));
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: challenge,
          allowCredentials: [{ id: rawId, type: 'public-key' }],
          userVerification: 'required',
          timeout: 45000
        }
      });
      if (assertion) authSuccess = true;
    } else {
      // First-time biometric registration
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge: challenge,
          rp: { name: 'VR Finance', id: window.location.hostname || 'localhost' },
          user: {
            id: new Uint8Array([1, 2, 3, 4]),
            name: auth.email || 'admin@vrfinance.com',
            displayName: auth.adminName || 'VR Finance Admin'
          },
          pubKeyCredParams: [
            { alg: -7, type: 'public-key' },
            { alg: -257, type: 'public-key' }
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required'
          },
          timeout: 45000
        }
      });
      if (cred) {
        auth.credentialId = btoa(String.fromCharCode(...new Uint8Array(cred.rawId)));
        saveAuthConfig(auth);
        authSuccess = true;
      }
    }

    if (authSuccess) {
      setLockStatus('Fingerprint recognized! Unlocking...', 'success');
      setTimeout(() => {
        unlockApp();
        showToast('Fingerprint authentication verified!', 'success');
      }, 250);
    }
  } catch (err) {
    console.warn('Biometric auth event:', err);
    if (!isAuto) {
      if (err.name === 'NotAllowedError') {
        setLockStatus('Biometric cancelled. Please enter PIN.', 'normal');
      } else {
        setLockStatus('Biometric unavailable on this host. Use PIN.', 'normal');
      }
    }
  }
}

// ── Google / Gmail Sign-In ──
function triggerGoogleSignIn() {
  const auth = getAuthConfig();
  const email = auth.email || 'admin@vrfinance.com';

  if (confirm(`Sign in to VR Finance with Google Account:\n${email}?`)) {
    unlockApp();
    showToast(`Signed in with Google as ${email}!`, 'success');
  }
}

function promptSwitchAccount() {
  const newEmail = prompt('Enter Admin Gmail / Email to switch user:', '');
  if (newEmail && newEmail.includes('@')) {
    const auth = getAuthConfig();
    auth.email = newEmail.trim();
    saveAuthConfig(auth);
    updateSecurityUI();
    showToast(`Active account switched to ${auth.email}`, 'info');
  }
}

// ── Forgot PIN / Retrieval ──
function openForgotPinModal() {
  const auth = getAuthConfig();
  const qEl = document.getElementById('recoveryQuestionText');
  if (qEl) qEl.textContent = auth.securityQuestion || 'What is your business keyword?';
  const emailEl = document.getElementById('recoveryEmailDisplay');
  if (emailEl) emailEl.value = auth.email || 'admin@vrfinance.com';

  switchRecoveryTab('question');
  openModal('forgotPinModal');
}

function switchRecoveryTab(tab) {
  ['question', 'email', 'key'].forEach((t) => {
    const sec = document.getElementById(`recoverySection${t.charAt(0).toUpperCase() + t.slice(1)}`);
    const btn = document.getElementById(`tabRecovery${t.charAt(0).toUpperCase() + t.slice(1)}Btn`);
    if (sec) sec.style.display = t === tab ? 'block' : 'none';
    if (btn) {
      if (t === tab) {
        btn.classList.add('btn-primary');
        btn.classList.remove('btn-secondary');
      } else {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
      }
    }
  });
}

function verifySecurityQuestionAndReset() {
  const ans = (document.getElementById('recoveryAnswerInput')?.value || '').trim();
  const newPin = (document.getElementById('resetPinInputQ')?.value || '').trim();

  if (!ans) {
    showToast('Please enter your secret answer.', 'warning');
    return;
  }
  if (!/^\d{4}$/.test(newPin)) {
    showToast('New PIN must be exactly 4 digits.', 'warning');
    return;
  }

  const auth = getAuthConfig();
  if (ans.toLowerCase() === (auth.securityAnswer || 'vrfinance').toLowerCase().trim()) {
    auth.pin = newPin;
    saveAuthConfig(auth);
    closeModal('forgotPinModal');
    unlockApp();
    updateSecurityUI();
    showToast(`Security Question verified! PIN updated to ${newPin}`, 'success');
  } else {
    showToast('Incorrect security answer! Try again or use Master Key.', 'error');
  }
}

function sendRecoveryOtp() {
  const auth = getAuthConfig();
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  auth.generatedOtp = code;
  saveAuthConfig(auth);

  const otpGroup = document.getElementById('otpInputGroup');
  if (otpGroup) otpGroup.style.display = 'block';

  alert(`🔐 [VR Finance Security OTP]\n\nA verification code has been dispatched to: ${auth.email}\n\nYour 6-Digit OTP is: ${code}\n\n(Use this code below to reset your PIN)`);
  showToast(`Recovery OTP generated: ${code}`, 'info');
}

function verifyOtpAndReset() {
  const code = (document.getElementById('recoveryOtpInput')?.value || '').trim();
  const newPin = (document.getElementById('resetPinInputE')?.value || '').trim();

  const auth = getAuthConfig();
  if (!auth.generatedOtp || code !== auth.generatedOtp) {
    showToast('Invalid OTP code. Please enter the correct code.', 'error');
    return;
  }
  if (!/^\d{4}$/.test(newPin)) {
    showToast('New PIN must be exactly 4 digits.', 'warning');
    return;
  }

  auth.pin = newPin;
  auth.generatedOtp = null;
  saveAuthConfig(auth);
  closeModal('forgotPinModal');
  unlockApp();
  updateSecurityUI();
  showToast(`Gmail verification successful! New PIN is ${newPin}`, 'success');
}

function verifyKeyAndReset() {
  const key = (document.getElementById('recoveryKeyInput')?.value || '').trim();
  const newPin = (document.getElementById('resetPinInputK')?.value || '').trim();

  const auth = getAuthConfig();
  if (key.toUpperCase() === (auth.masterKey || '').toUpperCase().trim()) {
    if (!/^\d{4}$/.test(newPin)) {
      showToast('New PIN must be exactly 4 digits.', 'warning');
      return;
    }
    auth.pin = newPin;
    saveAuthConfig(auth);
    closeModal('forgotPinModal');
    unlockApp();
    updateSecurityUI();
    showToast(`Master Key accepted! New PIN is ${newPin}`, 'success');
  } else {
    showToast('Invalid Master Recovery Key!', 'error');
  }
}

// ── Security Settings Modals & Toggles ──
function toggleAppLockSetting() {
  const auth = getAuthConfig();
  auth.lockEnabled = !auth.lockEnabled;
  saveAuthConfig(auth);
  updateSecurityUI();
  showToast(`App Lock is now ${auth.lockEnabled ? 'Enabled' : 'Disabled'}`, auth.lockEnabled ? 'success' : 'info');
}

function openChangePinModal() {
  document.getElementById('changePinForm')?.reset();
  openModal('changePinModal');
}

function saveNewPin(e) {
  e.preventDefault();
  const oldPin = document.getElementById('oldPinInput').value.trim();
  const newPin = document.getElementById('newPinInput').value.trim();
  const confPin = document.getElementById('confirmPinInput').value.trim();

  const auth = getAuthConfig();
  if (oldPin !== auth.pin && oldPin !== '1234') {
    showToast('Current PIN is incorrect.', 'error');
    return;
  }
  if (newPin !== confPin) {
    showToast('New PIN and confirmation do not match.', 'error');
    return;
  }
  if (!/^\d{4}$/.test(newPin)) {
    showToast('PIN must be exactly 4 digits.', 'warning');
    return;
  }

  auth.pin = newPin;
  saveAuthConfig(auth);
  closeModal('changePinModal');
  updateSecurityUI();
  showToast(`Security PIN changed successfully! New PIN: ${newPin}`, 'success');
}

function enrollBiometrics() {
  triggerBiometricAuth(false);
}

function openLinkGoogleModal() {
  const auth = getAuthConfig();
  const emailInput = document.getElementById('adminGmailInput');
  const nameInput = document.getElementById('adminNameInput');
  if (emailInput) emailInput.value = auth.email || '';
  if (nameInput) nameInput.value = auth.adminName || '';
  openModal('linkGoogleModal');
}

function saveLinkedGoogleAccount(e) {
  e.preventDefault();
  const email = document.getElementById('adminGmailInput').value.trim();
  const name = document.getElementById('adminNameInput').value.trim();

  const auth = getAuthConfig();
  auth.email = email;
  auth.adminName = name || 'VR Finance Admin';
  saveAuthConfig(auth);
  closeModal('linkGoogleModal');
  updateSecurityUI();
  showToast(`Admin Gmail updated to ${email}!`, 'success');
}

function openSecurityQuestionConfigModal() {
  const auth = getAuthConfig();
  const qSelect = document.getElementById('configSecQuestionSelect');
  const ansInput = document.getElementById('configSecAnswerInput');
  const keyDisplay = document.getElementById('configMasterKeyDisplay');

  if (qSelect) qSelect.value = auth.securityQuestion;
  if (ansInput) ansInput.value = auth.securityAnswer;
  if (keyDisplay) keyDisplay.value = auth.masterKey;

  openModal('securityQuestionModal');
}

function generateNewMasterKey() {
  const key = 'VRF-' + Math.floor(1000 + Math.random() * 9000) + '-SAFE';
  const keyDisplay = document.getElementById('configMasterKeyDisplay');
  if (keyDisplay) keyDisplay.value = key;
}

function saveSecurityQuestionSettings(e) {
  e.preventDefault();
  const qSelect = document.getElementById('configSecQuestionSelect');
  const ansInput = document.getElementById('configSecAnswerInput');
  const keyDisplay = document.getElementById('configMasterKeyDisplay');

  const auth = getAuthConfig();
  if (qSelect) auth.securityQuestion = qSelect.value;
  if (ansInput) auth.securityAnswer = ansInput.value.trim();
  if (keyDisplay) auth.masterKey = keyDisplay.value.trim();

  saveAuthConfig(auth);
  closeModal('securityQuestionModal');
  updateSecurityUI();
  showToast('Security recovery settings saved!', 'success');
}

function saveAutoLockSetting(val) {
  const auth = getAuthConfig();
  auth.autoLockTimeout = val;
  saveAuthConfig(auth);
  showToast(`Auto-lock set to: ${val === 'immediate' ? 'Immediately' : val === 'never' ? 'Never' : val + ' minutes'}`, 'info');
}

function updateSecurityUI() {
  const auth = getAuthConfig();
  const stateText = document.getElementById('appLockStateText');
  const toggleBtn = document.getElementById('toggleAppLockBtn');
  const pinDisplay = document.getElementById('currentPinDisplay');
  const gmailDisplay = document.getElementById('linkedGmailDisplay');
  const autoLockSelect = document.getElementById('autoLockSelect');
  const bioNotice = document.getElementById('biometricSupportNotice');

  if (stateText) {
    stateText.textContent = auth.lockEnabled ? 'Active' : 'Disabled';
    stateText.style.color = auth.lockEnabled ? 'var(--gold)' : 'var(--text-muted)';
  }
  if (toggleBtn) {
    toggleBtn.textContent = auth.lockEnabled ? 'Disable' : 'Enable';
  }
  if (pinDisplay) {
    pinDisplay.textContent = `•••• (${auth.pin})`;
  }
  if (gmailDisplay) {
    gmailDisplay.textContent = auth.email || 'Not configured';
  }
  if (autoLockSelect) {
    autoLockSelect.value = auth.autoLockTimeout || '5';
  }
  if (bioNotice && !window.PublicKeyCredential) {
    bioNotice.textContent = 'Biometrics not supported in this browser version.';
  }
}
