'use strict';
const fields = [
  ['sleep', 'Wie erholsam war die Nacht?', [['bad', 'Schlecht'], ['medium', 'Mittel'], ['good', 'Gut']]],
  ['freshness', 'Wie frisch fühlst du dich?', [['tired', 'Müde'], ['normal', 'Normal'], ['fresh', 'Frisch']]],
  ['stress', 'Wie hoch ist dein Alltagsstress?', [['low', 'Niedrig'], ['medium', 'Mittel'], ['high', 'Hoch']]],
  ['complaints', 'Beschwerden / Gesundheit', [['none', 'Keine'], ['unchanged', 'Bekannt und unverändert'], ['better', 'Besser'], ['new_or_worse', 'Neu oder schlechter']]],
];
const params = new URLSearchParams(location.search);
const day = params.get('day');
const revision = Number(params.get('revision'));
const zone = params.get('zone');
const mode = params.get('mode');
const telegram = window.Telegram?.WebApp;
const form = document.querySelector('#checkin');
const status = document.querySelector('#status');
const send = document.querySelector('#send');
const detail = document.querySelector('#complaint_detail');
for (const [name, title, choices] of fields) {
  const group = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.textContent = title;
  group.append(legend);
  const options = document.createElement('div');
  options.className = 'options';
  for (const [value, label] of [...choices, ['', 'Überspringen']]) {
    const choice = document.createElement('label');
    choice.className = `choice${value ? '' : ' skip'}`;
    const input = document.createElement('input');
    input.type = 'radio'; input.name = name; input.value = value;
    const text = document.createElement('span'); text.textContent = label;
    choice.append(input, text); options.append(choice);
  }
  group.append(options); document.querySelector('#fields').append(group);
}
form.addEventListener('change', () => {
  const changed = new FormData(form).get('complaints') === 'new_or_worse';
  document.querySelector('#detail-block').hidden = !changed;
  detail.required = changed;
});
let contextValid = false;
try {
  contextValid = /^\d{4}-\d{2}-\d{2}$/.test(day || '') &&
    new Date(day + 'T12:00:00Z').toISOString().slice(0, 10) === day &&
    params.has('revision') && Number.isSafeInteger(revision) && revision >= 0 &&
    ['test', 'production'].includes(mode) && Boolean(zone);
  new Intl.DateTimeFormat('de-CH', {timeZone: zone}).format(new Date());
} catch { contextValid = false; }
const inTelegram = Boolean(telegram && telegram.platform !== 'unknown' && telegram.platform);
if (contextValid) {
  document.querySelector('#context').textContent = `${mode === 'test' ? 'TEST · ' : ''}${day} · ${zone}`;
  if (revision > 0) document.querySelector('#revision').textContent = 'Korrektur: Bitte den vollständigen Check neu ausfüllen. Übersprungene Felder werden als fehlend gespeichert. Frühere Versionen bleiben erhalten.';
}
if (!contextValid || !inTelegram) {
  status.textContent = 'Bitte über den «Morgencheck öffnen»-Tastaturknopf im privaten Bot-Chat starten. Ein normaler Weblink kann keine Antworten speichern.';
} else {
  telegram.ready(); telegram.expand(); send.disabled = false;
}
let requestId = null;
let attempted = false;
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!contextValid || !inTelegram || attempted || !form.reportValidity()) return;
  const values = new FormData(form);
  const answers = Object.fromEntries(fields.map(([name]) => [name, values.get(name) || null]));
  answers.note = document.querySelector('#note').value;
  answers.complaint_detail = answers.complaints === 'new_or_worse' ? detail.value : '';
  if (answers.complaints === 'new_or_worse' && !answers.complaint_detail.trim()) {
    status.textContent = 'Bitte Ort und Veränderung kurz ergänzen.'; return;
  }
  // Nothing is persisted in browser storage or sent to analytics/HTTP APIs.
  requestId ||= crypto.randomUUID();
  const payload = JSON.stringify({schema: 1, mode, request_id: requestId, day, base_revision: revision, answers});
  if (new TextEncoder().encode(payload).length > 4096) {
    status.textContent = 'Die Eingabe ist zu lang (maximal 4096 UTF-8-Bytes). Bitte kürzen.'; return;
  }
  attempted = true; send.disabled = true;
  try {
    telegram.sendData(payload);
    status.textContent = 'An Telegram übergeben, noch nicht als gespeichert bestätigt. Bitte die Bestätigung im Bot-Chat abwarten; bei Unsicherheit /morgenstatus nutzen.';
  } catch {
    attempted = false; requestId = null; send.disabled = false;
    status.textContent = 'Senden fehlgeschlagen. Deine Eingabe steht noch hier; bitte erneut versuchen.';
  }
});
