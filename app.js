/**
 * 키즈홈 대체 장부관리 도구 - 프론트엔드
 * v0.1.0
 */

const LS_URL = 'kh_backend_url';
const LS_TOKEN = 'kh_token';

const state = {
  apiUrl: localStorage.getItem(LS_URL) || '',
  token: localStorage.getItem(LS_TOKEN) || '',
  categories: [],       // [{type, category, subcategory}]
  settings: {},
  transactions: [],
  currentMonth: '',
  editingId: null,
  uploadHeaders: [],
  uploadRows: [],        // raw rows including header
  previewRows: [],       // built transaction candidates for import
};

// ---------------- API ----------------

async function api(action, payload) {
  const res = await fetch(state.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoid CORS preflight on Apps Script
    body: JSON.stringify({ action: action, token: state.token, payload: payload || {} }),
  });
  const json = await res.json();
  return json;
}

// ---------------- 화면 전환 ----------------

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function (el) { el.hidden = true; });
  document.getElementById(id).hidden = false;
}

function init() {
  if (!state.apiUrl) {
    showScreen('setup-screen');
    return;
  }
  if (!state.token) {
    showScreen('login-screen');
    return;
  }
  boot();
}

document.getElementById('setup-save').addEventListener('click', function () {
  const url = document.getElementById('setup-url').value.trim();
  if (!url) return;
  localStorage.setItem(LS_URL, url);
  state.apiUrl = url;
  showScreen('login-screen');
});

document.getElementById('login-change-url').addEventListener('click', function () {
  document.getElementById('setup-url').value = state.apiUrl;
  showScreen('setup-screen');
});

document.getElementById('login-btn').addEventListener('click', async function () {
  const pw = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.hidden = true;
  state.token = pw; // auth 액션은 token 필드를 비밀번호로 비교함

  let check = null;
  let connectFailed = false;
  try {
    check = await api('auth', {});
  } catch (err) {
    connectFailed = true;
  }

  if (check && check.ok) {
    localStorage.setItem(LS_TOKEN, pw);
    boot();
    return;
  }

  state.token = '';
  if (connectFailed || !check) {
    errEl.textContent = '백엔드 서버에 연결할 수 없습니다. 백엔드 주소(웹 앱 URL)가 정확한지, Apps Script 배포 설정의 "액세스 권한"이 "모든 사용자"로 되어 있는지 확인해주세요.';
  } else {
    errEl.textContent = '비밀번호가 올바르지 않습니다.';
  }
  errEl.hidden = false;
});

document.getElementById('logout-btn').addEventListener('click', function () {
  localStorage.removeItem(LS_TOKEN);
  state.token = '';
  showScreen('login-screen');
});

async function boot() {
  showScreen('app-screen');
  setupMonthSelect();
  await loadCategories();
  await loadSettings();
  await refreshDashboard();
  await refreshList();
  renderCategoryManageTable();
  populateEntryCategorySelects();
}

// ---------------- 탭 ----------------

document.querySelectorAll('.tab-btn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
    document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ---------------- 월 선택 ----------------

function setupMonthSelect() {
  const sel = document.getElementById('month-select');
  sel.innerHTML = '';
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const opt = document.createElement('option');
    opt.value = ym;
    opt.textContent = ym;
    sel.appendChild(opt);
  }
  state.currentMonth = sel.value;
  sel.addEventListener('change', async function () {
    state.currentMonth = sel.value;
    await refreshDashboard();
    await refreshList();
  });
}

// ---------------- 카테고리 ----------------

async function loadCategories() {
  const res = await api('getCategories', {});
  if (res.ok) state.categories = res.categories;
}

function uniqueCategoriesByType(type) {
  const set = new Set();
  state.categories.filter(function (c) { return c.type === type; }).forEach(function (c) { set.add(c.category); });
  return Array.from(set);
}

function subcategoriesFor(type, category) {
  return state.categories
    .filter(function (c) { return c.type === type && c.category === category; })
    .map(function (c) { return c.subcategory; });
}

function fillSelect(sel, options, placeholder) {
  sel.innerHTML = '';
  if (placeholder) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = placeholder;
    sel.appendChild(opt);
  }
  options.forEach(function (o) {
    const opt = document.createElement('option');
    opt.value = o;
    opt.textContent = o;
    sel.appendChild(opt);
  });
}

function populateEntryCategorySelects() {
  const typeSel = document.getElementById('entry-type');
  const catSel = document.getElementById('entry-category');
  const subSel = document.getElementById('entry-subcategory');

  function refreshCat() {
    fillSelect(catSel, uniqueCategoriesByType(typeSel.value));
    refreshSub();
  }
  function refreshSub() {
    fillSelect(subSel, subcategoriesFor(typeSel.value, catSel.value));
  }
  typeSel.onchange = refreshCat;
  catSel.onchange = refreshSub;
  refreshCat();
}

// ---------------- 대시보드 ----------------

function won(n) {
  const num = Number(n) || 0;
  return num.toLocaleString('ko-KR') + '원';
}

async function refreshDashboard() {
  const res = await api('monthlySummary', { yearMonth: state.currentMonth });
  if (!res.ok) return;
  document.getElementById('stat-carryover').textContent = won(res.prevCarryover);
  document.getElementById('stat-income').textContent = won(res.income);
  document.getElementById('stat-expense').textContent = won(res.expense);
  document.getElementById('stat-balance').textContent = won(res.balance);
  document.getElementById('stat-bankbalance').textContent = won(res.bankBalance);
  const diffEl = document.getElementById('stat-diff');
  diffEl.textContent = won(res.diff);
  diffEl.style.color = res.diff === 0 ? '' : '#d64545';

  const tbody = document.querySelector('#category-summary-table tbody');
  tbody.innerHTML = '';
  Object.keys(res.byCategory).sort().forEach(function (key) {
    const parts = key.split('|');
    const tr = document.createElement('tr');
    tr.innerHTML = '<td>' + parts[0] + '</td><td>' + parts[1] + '</td><td class="num">' + won(res.byCategory[key]) + '</td>';
    tbody.appendChild(tr);
  });
}

// ---------------- 거래 입력 ----------------

document.getElementById('entry-submit').addEventListener('click', async function () {
  const payload = {
    date: document.getElementById('entry-date').value,
    type: document.getElementById('entry-type').value,
    category: document.getElementById('entry-category').value,
    subcategory: document.getElementById('entry-subcategory').value,
    amount: document.getElementById('entry-amount').value,
    memo: document.getElementById('entry-memo').value,
    creator: document.getElementById('entry-creator').value,
    source: 'manual',
  };
  if (!payload.date || !payload.amount) return;

  let res;
  if (state.editingId) {
    res = await api('update', { id: state.editingId, fields: payload });
  } else {
    res = await api('add', payload);
  }
  if (res.ok) {
    document.getElementById('entry-ok').hidden = false;
    setTimeout(function () { document.getElementById('entry-ok').hidden = true; }, 1500);
    resetEntryForm();
    await refreshDashboard();
    await refreshList();
  }
});

function resetEntryForm() {
  state.editingId = null;
  document.getElementById('entry-submit').textContent = '저장';
  document.getElementById('entry-date').value = '';
  document.getElementById('entry-amount').value = '';
  document.getElementById('entry-memo').value = '';
  document.getElementById('entry-creator').value = '';
}

function editTransaction(tx) {
  state.editingId = tx.id;
  document.getElementById('entry-submit').textContent = '수정 저장';
  document.getElementById('entry-date').value = tx.date;
  document.getElementById('entry-type').value = tx.type;
  populateEntryCategorySelects();
  document.getElementById('entry-category').value = tx.category;
  document.getElementById('entry-category').dispatchEvent(new Event('change'));
  document.getElementById('entry-subcategory').value = tx.subcategory;
  document.getElementById('entry-amount').value = tx.amount;
  document.getElementById('entry-memo').value = tx.memo;
  document.getElementById('entry-creator').value = tx.creator;

  document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
  document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
  document.querySelector('.tab-btn[data-tab="entry"]').classList.add('active');
  document.getElementById('tab-entry').classList.add('active');
}

// ---------------- 거래목록 ----------------

async function refreshList() {
  const res = await api('list', { yearMonth: state.currentMonth });
  if (!res.ok) return;
  state.transactions = res.transactions;
  renderList();
}

function renderList() {
  const filter = document.getElementById('list-filter').value.trim().toLowerCase();
  const tbody = document.querySelector('#tx-table tbody');
  tbody.innerHTML = '';
  state.transactions
    .filter(function (t) { return !filter || String(t.memo).toLowerCase().includes(filter); })
    .forEach(function (t) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + t.date + '</td>' +
        '<td>' + t.type + '</td>' +
        '<td>' + t.category + '</td>' +
        '<td>' + t.subcategory + '</td>' +
        '<td>' + t.memo + '</td>' +
        '<td class="num">' + won(t.amount) + '</td>' +
        '<td>' + (t.creator || '') + '</td>' +
        '<td>' + (t.source === 'upload' ? '업로드' : '수기') + '</td>' +
        '<td></td>';
      const editBtn = document.createElement('button');
      editBtn.className = 'btn small';
      editBtn.textContent = '수정';
      editBtn.onclick = function () { editTransaction(t); };
      const delBtn = document.createElement('button');
      delBtn.className = 'btn small';
      delBtn.textContent = '삭제';
      delBtn.onclick = async function () {
        if (!confirm('삭제하시겠습니까?')) return;
        await api('delete', { id: t.id });
        await refreshDashboard();
        await refreshList();
      };
      const actionsTd = tr.lastElementChild;
      actionsTd.appendChild(editBtn);
      actionsTd.appendChild(delBtn);
      tbody.appendChild(tr);
    });
}

document.getElementById('list-filter').addEventListener('input', renderList);

// ---------------- 파일 업로드 ----------------

document.getElementById('upload-file').addEventListener('change', function (e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (evt) {
    const data = new Uint8Array(evt.target.result);
    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
    state.uploadRows = rows;
    state.uploadHeaders = rows[0] || [];
    renderColumnMapping();
    document.getElementById('upload-mapping').hidden = false;
    document.getElementById('upload-preview').hidden = true;
  };
  reader.readAsArrayBuffer(file);
});

function columnLabel(idx) {
  const h = state.uploadHeaders[idx];
  const sample = (state.uploadRows[1] || [])[idx];
  const label = (h !== undefined && h !== '') ? h : ('열' + (idx + 1));
  return label + (sample !== undefined && sample !== '' ? ' (예: ' + sample + ')' : '');
}

function renderColumnMapping() {
  const count = state.uploadHeaders.length;
  const indices = Array.from({ length: count }, function (_, i) { return i; });
  const options = indices.map(function (i) { return { value: i, label: columnLabel(i) }; });

  [['map-date'], ['map-memo'], ['map-amount'], ['map-sign'], ['map-in'], ['map-out']].forEach(function (arr) {
    const sel = document.getElementById(arr[0]);
    sel.innerHTML = '';
    if (arr[0] === 'map-sign') {
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = '(사용 안 함)';
      sel.appendChild(empty);
    }
    options.forEach(function (o) {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      sel.appendChild(opt);
    });
  });

  // 저장된 매핑이 있으면 그대로 적용, 없으면 헤더 이름으로 자동 추정
  const key = 'kh_colmap_' + state.uploadHeaders.join('|');
  const saved = localStorage.getItem(key);
  if (saved) {
    const map = JSON.parse(saved);
    document.getElementById('map-date').value = map.date;
    document.getElementById('map-memo').value = map.memo;
    document.getElementById('map-amount-mode').value = map.mode;
    if (map.amount !== undefined) document.getElementById('map-amount').value = map.amount;
    if (map.sign !== undefined) document.getElementById('map-sign').value = map.sign;
    if (map.in !== undefined) document.getElementById('map-in').value = map.in;
    if (map.out !== undefined) document.getElementById('map-out').value = map.out;
  } else {
    guessColumnMapping();
  }
  toggleAmountMode();
}

function guessColumnIndex(keywords) {
  for (let i = 0; i < state.uploadHeaders.length; i++) {
    const h = String(state.uploadHeaders[i] || '');
    if (keywords.some(function (k) { return h.includes(k); })) return i;
  }
  return -1;
}

function guessColumnMapping() {
  const dateGuess = guessColumnIndex(['일자', '일시', '날짜']);
  const memoGuess = guessColumnIndex(['적요', '내용', '메모']);
  const inGuess = guessColumnIndex(['입금']);
  const outGuess = guessColumnIndex(['출금']);
  const amountGuess = guessColumnIndex(['금액']);

  if (dateGuess >= 0) document.getElementById('map-date').value = dateGuess;
  if (memoGuess >= 0) document.getElementById('map-memo').value = memoGuess;

  if (inGuess >= 0 && outGuess >= 0) {
    document.getElementById('map-amount-mode').value = 'separate';
    document.getElementById('map-in').value = inGuess;
    document.getElementById('map-out').value = outGuess;
  } else if (amountGuess >= 0) {
    document.getElementById('map-amount-mode').value = 'single';
    document.getElementById('map-amount').value = amountGuess;
  }
}

document.getElementById('map-amount-mode').addEventListener('change', toggleAmountMode);
function toggleAmountMode() {
  const mode = document.getElementById('map-amount-mode').value;
  document.getElementById('map-amount-single-fields').hidden = mode !== 'single';
  document.getElementById('map-amount-separate-fields').hidden = mode !== 'separate';
}

function pad2(n) { return String(n).padStart(2, '0'); }

function normalizeDateCell(cell) {
  if (cell instanceof Date) {
    return cell.getFullYear() + '-' + pad2(cell.getMonth() + 1) + '-' + pad2(cell.getDate());
  }
  if (typeof cell === 'number' && typeof XLSX !== 'undefined' && XLSX.SSF) {
    const d = XLSX.SSF.parse_date_code(cell);
    if (d) return d.y + '-' + pad2(d.m) + '-' + pad2(d.d);
  }
  if (typeof cell === 'string') {
    const s = cell.trim();
    let m = s.match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
    if (m) return m[1] + '-' + pad2(m[2]) + '-' + pad2(m[3]);
    m = s.match(/^(\d{4})(\d{2})(\d{2})/);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
  }
  return '';
}

function parseAmountCell(cell) {
  if (typeof cell === 'number') return cell;
  if (typeof cell === 'string') {
    const cleaned = cell.replace(/[^0-9.\-]/g, '');
    return cleaned ? parseFloat(cleaned) : 0;
  }
  return 0;
}

document.getElementById('upload-preview-btn').addEventListener('click', function () {
  const dateIdx = Number(document.getElementById('map-date').value);
  const memoIdx = Number(document.getElementById('map-memo').value);
  const mode = document.getElementById('map-amount-mode').value;
  const amountIdx = document.getElementById('map-amount').value;
  const signIdx = document.getElementById('map-sign').value;
  const inIdx = document.getElementById('map-in').value;
  const outIdx = document.getElementById('map-out').value;

  // 매핑 저장 (다음 업로드 시 자동 적용)
  const key = 'kh_colmap_' + state.uploadHeaders.join('|');
  localStorage.setItem(key, JSON.stringify({
    date: dateIdx, memo: memoIdx, mode: mode, amount: amountIdx, sign: signIdx, in: inIdx, out: outIdx,
  }));

  const dataRows = state.uploadRows.slice(1);
  const results = [];
  dataRows.forEach(function (row) {
    const date = normalizeDateCell(row[dateIdx]);
    const memo = String(row[memoIdx] !== undefined ? row[memoIdx] : '');
    let amount = 0, type = '수입';

    if (mode === 'single') {
      amount = parseAmountCell(row[amountIdx]);
      if (signIdx !== '') {
        const signText = String(row[Number(signIdx)] || '');
        type = (signText.includes('출') ) ? '지출' : '수입';
        amount = Math.abs(amount);
      } else {
        type = amount < 0 ? '지출' : '수입';
        amount = Math.abs(amount);
      }
    } else {
      const inAmt = parseAmountCell(row[Number(inIdx)]);
      const outAmt = parseAmountCell(row[Number(outIdx)]);
      if (outAmt > 0) { amount = outAmt; type = '지출'; }
      else { amount = inAmt; type = '수입'; }
    }

    if (!date || !amount) return; // 빈 행/합계 행 등은 건너뜀
    results.push({ date: date, type: type, amount: amount, memo: memo, category: '', subcategory: '', include: true });
  });

  state.previewRows = results;
  renderPreviewTable();
  document.getElementById('upload-preview').hidden = false;
});

function renderPreviewTable() {
  // 일괄 적용용 계정항목/세목 셀렉트 채우기 (수입/지출 섞여있을 수 있어 전체 목록 노출)
  const bulkCat = document.getElementById('bulk-category');
  const bulkSub = document.getElementById('bulk-subcategory');
  const allCats = Array.from(new Set(state.categories.map(function (c) { return c.category; })));
  fillSelect(bulkCat, allCats, '선택');
  bulkCat.onchange = function () {
    const subs = Array.from(new Set(state.categories.filter(function (c) { return c.category === bulkCat.value; }).map(function (c) { return c.subcategory; })));
    fillSelect(bulkSub, subs, '선택');
  };

  const tbody = document.querySelector('#preview-table tbody');
  tbody.innerHTML = '';
  state.previewRows.forEach(function (r, idx) {
    const tr = document.createElement('tr');
    const checkTd = document.createElement('td');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = r.include;
    check.onchange = function () { r.include = check.checked; };
    check.dataset.idx = idx;
    check.className = 'preview-row-check';
    checkTd.appendChild(check);
    tr.appendChild(checkTd);

    tr.innerHTML +=
      '<td>' + r.date + '</td>' +
      '<td>' + r.type + '</td>' +
      '<td class="num">' + won(r.amount) + '</td>' +
      '<td>' + r.memo + '</td>';

    const catTd = document.createElement('td');
    const catSel = document.createElement('select');
    fillSelect(catSel, Array.from(new Set(state.categories.filter(function (c) { return c.type === r.type; }).map(function (c) { return c.category; }))), '선택');
    catSel.value = r.category;
    const subTd = document.createElement('td');
    const subSel = document.createElement('select');
    function refreshRowSub() {
      fillSelect(subSel, subcategoriesFor(r.type, catSel.value), '선택');
      subSel.value = r.subcategory;
    }
    catSel.onchange = function () { r.category = catSel.value; refreshRowSub(); r.subcategory = subSel.value; };
    subSel.onchange = function () { r.subcategory = subSel.value; };
    refreshRowSub();
    catTd.appendChild(catSel);
    subTd.appendChild(subSel);
    tr.appendChild(catTd);
    tr.appendChild(subTd);

    tbody.appendChild(tr);
  });
}

document.getElementById('preview-check-all').addEventListener('change', function (e) {
  document.querySelectorAll('.preview-row-check').forEach(function (cb) {
    cb.checked = e.target.checked;
    state.previewRows[Number(cb.dataset.idx)].include = e.target.checked;
  });
});

document.getElementById('bulk-apply-btn').addEventListener('click', function () {
  const cat = document.getElementById('bulk-category').value;
  const sub = document.getElementById('bulk-subcategory').value;
  document.querySelectorAll('.preview-row-check:checked').forEach(function (cb) {
    const r = state.previewRows[Number(cb.dataset.idx)];
    r.category = cat;
    r.subcategory = sub;
  });
  renderPreviewTable();
});

document.getElementById('upload-confirm-btn').addEventListener('click', async function () {
  const toImport = state.previewRows.filter(function (r) { return r.include; });
  if (toImport.length === 0) return;
  const res = await api('bulkAdd', { transactions: toImport });
  const resultEl = document.getElementById('upload-result');
  resultEl.hidden = false;
  if (res.ok) {
    resultEl.textContent = res.added + '건 추가되었습니다. (중복으로 건너뜀: ' + res.skipped + '건)';
    await refreshDashboard();
    await refreshList();
  } else {
    resultEl.textContent = '오류가 발생했습니다: ' + (res.error || '');
  }
});

// ---------------- 설정 ----------------

async function loadSettings() {
  const res = await api('getSettings', {});
  if (!res.ok) return;
  state.settings = res.settings;
  document.getElementById('set-orgname').value = state.settings.orgName || '';
  document.getElementById('set-bankname').value = state.settings.bankName || '';
  document.getElementById('set-accountno').value = state.settings.accountNoMasked || '';
  document.getElementById('set-carryover').value = state.settings.prevCarryover || 0;
  document.getElementById('set-bankbalance').value = state.settings.bankBalance || 0;
}

document.getElementById('settings-save-btn').addEventListener('click', async function () {
  const settings = {
    orgName: document.getElementById('set-orgname').value,
    bankName: document.getElementById('set-bankname').value,
    accountNoMasked: document.getElementById('set-accountno').value,
    prevCarryover: document.getElementById('set-carryover').value,
    bankBalance: document.getElementById('set-bankbalance').value,
  };
  const res = await api('saveSettings', { settings: settings });
  if (res.ok) {
    document.getElementById('settings-ok').hidden = false;
    setTimeout(function () { document.getElementById('settings-ok').hidden = true; }, 1500);
    await refreshDashboard();
  }
});

document.getElementById('pw-save-btn').addEventListener('click', async function () {
  const newPw = document.getElementById('set-newpw').value;
  if (!newPw) return;
  const res = await api('changePassword', { newPassword: newPw });
  if (res.ok) {
    document.getElementById('pw-ok').hidden = false;
    document.getElementById('set-newpw').value = '';
  }
});

// ---------------- 계정항목 관리 ----------------

function renderCategoryManageTable() {
  const tbody = document.querySelector('#category-manage-table tbody');
  tbody.innerHTML = '';
  state.categories.forEach(function (c, idx) {
    appendCategoryRow(c.type, c.category, c.subcategory, idx);
  });
}

function appendCategoryRow(type, category, subcategory) {
  const tbody = document.querySelector('#category-manage-table tbody');
  const tr = document.createElement('tr');

  const typeTd = document.createElement('td');
  const typeSel = document.createElement('select');
  ['수입', '지출'].forEach(function (t) {
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = t;
    typeSel.appendChild(opt);
  });
  typeSel.value = type || '지출';
  typeTd.appendChild(typeSel);

  const catTd = document.createElement('td');
  const catInput = document.createElement('input');
  catInput.type = 'text';
  catInput.value = category || '';
  catTd.appendChild(catInput);

  const subTd = document.createElement('td');
  const subInput = document.createElement('input');
  subInput.type = 'text';
  subInput.value = subcategory || '';
  subTd.appendChild(subInput);

  const delTd = document.createElement('td');
  const delBtn = document.createElement('button');
  delBtn.className = 'btn small';
  delBtn.textContent = '삭제';
  delBtn.onclick = function () { tr.remove(); };
  delTd.appendChild(delBtn);

  tr.appendChild(typeTd);
  tr.appendChild(catTd);
  tr.appendChild(subTd);
  tr.appendChild(delTd);
  tbody.appendChild(tr);
}

document.getElementById('category-add-row-btn').addEventListener('click', function () {
  appendCategoryRow('지출', '', '');
});

document.getElementById('category-save-btn').addEventListener('click', async function () {
  const rows = document.querySelectorAll('#category-manage-table tbody tr');
  const categories = [];
  rows.forEach(function (tr) {
    const type = tr.children[0].querySelector('select').value;
    const category = tr.children[1].querySelector('input').value.trim();
    const subcategory = tr.children[2].querySelector('input').value.trim();
    if (category && subcategory) categories.push({ type: type, category: category, subcategory: subcategory });
  });
  const res = await api('saveCategories', { categories: categories });
  if (res.ok) {
    document.getElementById('category-ok').hidden = false;
    setTimeout(function () { document.getElementById('category-ok').hidden = true; }, 1500);
    await loadCategories();
    populateEntryCategorySelects();
  }
});

// ---------------- 시작 ----------------

init();
