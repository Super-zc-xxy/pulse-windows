import sys
from PIL import Image

img_path = r"C:\Users\纾宜\.gemini\antigravity\brain\1792d9c6-28e7-4a41-8eeb-1ef5de05606e\pulse_logo_1788761837168.jpg"
out_path = r"C:\Users\纾宜\.gemini\antigravity\scratch\pulse-win\icon.ico"

img = Image.open(img_path)
img = img.resize((256, 256))
img.save(out_path, format="ICO", sizes=[(256, 256)])
print(f"Saved {out_path}")
