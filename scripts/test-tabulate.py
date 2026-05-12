#!/usr/bin/env python3
"""Smoke test: create a Tabulate session against the JV agreement, watch it run."""
import json
import http.client
import time

# Load JV text
text = open('/tmp/jv-text.txt').read()

# Build session payload
payload = {
    'workflow': 'tabulate',
    'request': {
        'type': 'general',
        'requestText': (
            'Extract every tabular structure from this Joint Venture Agreement. '
            'Look at: Schedule 1 (Initial Participating Interests + MEC), '
            'Schedule 2 (Dilution Formula), Schedule 3 (Initial Programme & Budget), '
            'Schedule 4 (Encumbrances), Schedule 5 (Notice details), and any body-clause '
            'mechanics worth tabulating (Reserved Matters under cl 6.6, Cash Call mechanics '
            'under cl 9, Liability Cap mechanics under cl 18). Use Schedule numbers and '
            'clause numbers as source citations.'
        ),
        'context': {
            'moment': 'routine',
            'audience': 'enterprise',
            'jurisdiction': 'AU',
        },
    },
    'documents': [{
        'id': 'doc-jv-bellrock',
        'name': 'Bellrock_JV_Agreement.docx',
        'fullText': text,
        'mimeType': 'text/plain',
        'size': len(text),
        'pageCount': 21,
        'wordCount': len(text.split()),
        'sections': [],
        'tables': [],
        'definedTerms': [],
        'parseMethod': 'plaintext',
        'parsedAt': '2026-05-03T08:00:00Z',
    }],
    'options': {'budget': 5.0, 'intensity': 'standard'},
}

# Read cookie
with open('/tmp/cookies.txt') as f:
    cookie_line = next((l for l in f if 'lavern_token' in l), None)
if not cookie_line:
    print('No cookie — login first')
    raise SystemExit(1)
parts = cookie_line.strip().split('\t')
token = parts[-1]
cookie = f'lavern_token={token}'

body = json.dumps(payload).encode('utf-8')
conn = http.client.HTTPConnection('127.0.0.1', 3000, timeout=120)
conn.request('POST', '/api/sessions', body=body, headers={
    'Content-Type': 'application/json',
    'Cookie': cookie,
    'Content-Length': str(len(body)),
})
res = conn.getresponse()
data = res.read().decode('utf-8')
print(f'POST /api/sessions → {res.status}')
print(data[:500])

if res.status != 201 and res.status != 200:
    raise SystemExit(1)
parsed = json.loads(data)
session_id = parsed.get('sessionId') or parsed.get('id')
print(f'\nsessionId: {session_id}')
print(f'\n--- watching for completion ---')

for i in range(60):  # up to 5 min
    time.sleep(5)
    conn = http.client.HTTPConnection('127.0.0.1', 3000, timeout=10)
    conn.request('GET', f'/api/sessions/{session_id}', headers={'Cookie': cookie})
    r = conn.getresponse()
    d = json.loads(r.read().decode('utf-8'))
    step = d.get('currentStep') or (d.get('workflow') or {}).get('currentStep') or 'unknown'
    cost = d.get('totalCost') or d.get('accumulatedCost') or 0
    has_doc = bool(d.get('assembledDocument'))
    has_tab = d.get('tabulateResult') is not None
    print(f'  {i*5:3d}s  step={step!s:25s}  cost=${float(cost):.3f}  assembled={has_doc}  tabulate={has_tab}')
    if step == 'delivered' or has_doc:
        break
    if d.get('errorMessage'):
        print(f'  ERROR: {d["errorMessage"]}')
        break

# Final dump
print('\n--- final state ---')
conn = http.client.HTTPConnection('127.0.0.1', 3000, timeout=10)
conn.request('GET', f'/api/sessions/{session_id}', headers={'Cookie': cookie})
r = conn.getresponse()
d = json.loads(r.read().decode('utf-8'))
print(f'currentStep: {d.get("currentStep")}')
print(f'cost: ${d.get("totalCost") or d.get("accumulatedCost", 0):.3f}')
print(f'assembledDocument chars: {len(d.get("assembledDocument") or "")}')
tab = d.get('tabulateResult')
if tab:
    print(f'\nTABULATE RESULT:')
    print(f'  documentTitle: {tab.get("documentTitle")}')
    print(f'  summary: {tab.get("summary")}')
    print(f'  tables: {len(tab.get("tables", []))}')
    for t in tab.get('tables', []):
        print(f'    - {t.get("title")} ({t.get("source")}) — {len(t.get("rows", []))} rows × {len(t.get("columns", []))} cols')
    print(f'  defined terms: {len(tab.get("definedTerms", []))}')
    print(f'  specialist referrals: {len(tab.get("specialistReferrals", []))}')

print(f'\nDownload URLs to test:')
print(f'  curl -b /tmp/cookies.txt http://127.0.0.1:3000/api/sessions/{session_id}/download?format=csv -o /tmp/tab.csv')
print(f'  curl -b /tmp/cookies.txt http://127.0.0.1:3000/api/sessions/{session_id}/download?format=docx -o /tmp/tab.docx')
print(f'  curl -b /tmp/cookies.txt http://127.0.0.1:3000/api/sessions/{session_id}/download?format=html -o /tmp/tab.html')
print(f'  curl -b /tmp/cookies.txt http://127.0.0.1:3000/api/sessions/{session_id}/download?format=tabulate-json -o /tmp/tab.json')
