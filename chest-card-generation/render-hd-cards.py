import os
import fitz

CHEST_CARD_DIR = os.path.dirname(os.path.abspath(__file__))

cards = [
    ("chest-card-organiser.pdf", "chest-card-organiser_hd.png"),
    ("chest-card-participant.pdf", "chest-card-participant_hd.png"),
]

for pdf_name, png_name in cards:
    pdf_path = os.path.join(CHEST_CARD_DIR, pdf_name)
    png_path = os.path.join(CHEST_CARD_DIR, png_name)
    
    if not os.path.exists(pdf_path):
        print(f"Error: PDF not found at {pdf_path}")
        continue
        
    doc = fitz.open(pdf_path)
    page = doc[0]
    zoom = 450.0 / 72.0  # Ultra-crisp HD 450 DPI
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    pix.save(png_path)
    print(f"[OK] Generated HD Chest Card: {png_name} [{pix.width}x{pix.height}px, {os.path.getsize(png_path)} bytes]")

print("All HD cards rendered successfully.")
