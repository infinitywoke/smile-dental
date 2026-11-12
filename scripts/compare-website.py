import difflib, re, sys, urllib.request
from html.parser import HTMLParser

sys.stdout.reconfigure(encoding='utf-8')

# Compares a copy of the website with the live one: the words, description, robots and canonical of each page, and
# the Markdown copies and files byte for byte. Usage: python scripts/compare-website.py <copy's address> [live address]
# (for example the local Cloudflare preview, http://localhost:8787, or the Worker's workers.dev address)
LOCAL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8787'
LIVE = sys.argv[2] if len(sys.argv) > 2 else 'https://www.smiledentalkatapadi.com'

class Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.out, self.skip, self.meta = [], 0, []
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'noscript'):
            self.skip += 1
        d = dict(attrs)
        if tag == 'meta' and d.get('name') in ('description', 'robots'):
            self.meta.append((d.get('name'), d.get('content')))
        if tag == 'link' and d.get('rel') in ('canonical', 'alternate'):
            self.meta.append((d.get('rel'), d.get('href'), d.get('type')))
    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'noscript'):
            self.skip -= 1
    def handle_data(self, data):
        if not self.skip:
            self.out.append(data)

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    t = Text()
    t.feed(urllib.request.urlopen(req, timeout=60).read().decode('utf-8'))
    return re.sub(r'\s+', '', ''.join(t.out)), sorted(set(t.meta))

def raw(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    return urllib.request.urlopen(req, timeout=60).read().decode('utf-8').replace('\r\n', '\n')

bad = 0
for path in ['', 'book', 'treatments', 'treatments/fillings', 'treatments/orthodontics', 'privacy']:
    a, ma = get(f'{LOCAL}/{path}')
    b, mb = get(f'{LIVE}/{path}')
    same = a == b and ma == mb
    print(f'/{path}: {len(a)} characters, same={same}')
    if not same:
        bad += 1
        for op, i1, i2, j1, j2 in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
            if op != 'equal':
                print('   ', op, repr(a[max(0, i1 - 30):i2 + 15]), '<>', repr(b[max(0, j1 - 30):j2 + 15]))
        if ma != mb:
            print('    meta:', [m for m in ma if m not in mb], [m for m in mb if m not in ma])
for path in ['llms.txt', 'llms-full.txt', 'index.md', 'book.md', 'treatments.md', 'treatments/fillings.md', 'robots.txt', '.well-known/security.txt']:
    same = raw(f'{LOCAL}/{path}') == raw(f'{LIVE}/{path}')
    print(f'/{path}: same={same}')
    bad += 0 if same else 1
print('differences:', bad)
