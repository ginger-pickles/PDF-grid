#!/usr/bin/env python3
"""
Create a test PDF with mixed page dimensions to test smart scaling.

Pages:
1-5: Standard letter size (612×792 pt)
6:   Double-width fold-out (1224×792 pt)
7-8: Standard letter size (612×792 pt)
9:   Square page (792×792 pt)
10:  Standard letter size (612×792 pt)
"""

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import HexColor

# Output file
output_file = "demo/mixed-dimensions.pdf"

# Create PDF
c = canvas.Canvas(output_file)

# Standard letter size (612×792)
std_width, std_height = letter

# Helper to draw page content
def draw_page_content(canvas, page_num, width, height, label):
    # Background color
    canvas.setFillColor(HexColor('#f0f0f0'))
    canvas.rect(0, 0, width, height, fill=1, stroke=0)

    # Border
    canvas.setStrokeColor(HexColor('#333333'))
    canvas.setLineWidth(2)
    canvas.rect(10, 10, width-20, height-20, fill=0, stroke=1)

    # Page number (large)
    canvas.setFillColor(HexColor('#1f2937'))
    canvas.setFont("Helvetica-Bold", 72)
    canvas.drawCentredString(width/2, height/2 + 50, str(page_num))

    # Page label
    canvas.setFont("Helvetica", 24)
    canvas.drawCentredString(width/2, height/2 - 20, label)

    # Dimensions
    canvas.setFont("Helvetica", 16)
    canvas.drawCentredString(width/2, height/2 - 60, f"{int(width)}×{int(height)} pt")

# Pages 1-5: Standard letter
for i in range(1, 6):
    c.setPageSize((std_width, std_height))
    draw_page_content(c, i, std_width, std_height, "Standard Letter")
    c.showPage()

# Page 6: Double-width fold-out
fold_width = std_width * 2
c.setPageSize((fold_width, std_height))
draw_page_content(c, 6, fold_width, std_height, "FOLD-OUT (2× width)")
c.showPage()

# Pages 7-8: Standard letter
for i in range(7, 9):
    c.setPageSize((std_width, std_height))
    draw_page_content(c, i, std_width, std_height, "Standard Letter")
    c.showPage()

# Page 9: Square page
square_size = std_height  # 792×792
c.setPageSize((square_size, square_size))
draw_page_content(c, 9, square_size, square_size, "Square Page")
c.showPage()

# Page 10: Standard letter
c.setPageSize((std_width, std_height))
draw_page_content(c, 10, std_width, std_height, "Standard Letter")
c.showPage()

# Save PDF
c.save()

print(f"✓ Created {output_file}")
print(f"  Pages 1-5, 7-8, 10: Standard (612×792)")
print(f"  Page 6: Fold-out (1224×792)")
print(f"  Page 9: Square (792×792)")
