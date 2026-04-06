import urllib.request
response = urllib.request.urlopen("http://localhost:8000/ImageToParticle.html")
html = response.read().decode('utf-8')
import re
scripts = re.findall(r'<script type="module">(.*?)</script>', html, re.DOTALL)
with open('test.js', 'w', encoding='utf-8') as f:
    f.write(scripts[0])
