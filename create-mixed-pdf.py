#!/usr/bin/env python3
"""
Create a test PDF with mixed page dimensions to test smart scaling.

Pages (20 total):
1-5:   Standard letter size (612×792 pt)
6:     Double-width fold-out (1224×792 pt)
7-8:   Standard letter size (612×792 pt)
9:     Square page (792×792 pt)
10-12: Standard letter size (612×792 pt)
13:    Tall narrow page (400×900 pt)
14:    Wide short page (900×500 pt)
15:    Square page (612×612 pt)
16-18: Standard letter size (612×792 pt)
19:    Triple-width poster (1836×792 pt)
20:    Standard letter size (612×792 pt)
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
draw_page_content(c, 9, square_size, square_size, "Square Page (792×792)")
c.showPage()

# Pages 10-12: Standard letter
for i in range(10, 13):
    c.setPageSize((std_width, std_height))
    draw_page_content(c, i, std_width, std_height, "Standard Letter")
    c.showPage()

# Page 13: Tall narrow
tall_width = 400
tall_height = 900
c.setPageSize((tall_width, tall_height))
draw_page_content(c, 13, tall_width, tall_height, "Tall Narrow (400×900)")
c.showPage()

# Page 14: Wide short
wide_width = 900
wide_height = 500
c.setPageSize((wide_width, wide_height))
draw_page_content(c, 14, wide_width, wide_height, "Wide Short (900×500)")
c.showPage()

# Page 15: Square (smaller)
small_square = 612
c.setPageSize((small_square, small_square))
draw_page_content(c, 15, small_square, small_square, "Square Page (612×612)")
c.showPage()

# Pages 16-18: Standard letter
for i in range(16, 19):
    c.setPageSize((std_width, std_height))
    draw_page_content(c, i, std_width, std_height, "Standard Letter")
    c.showPage()

# Page 19: Triple-width poster
poster_width = std_width * 3
c.setPageSize((poster_width, std_height))
draw_page_content(c, 19, poster_width, std_height, "POSTER (3× width)")
c.showPage()

# Page 20: Standard letter
c.setPageSize((std_width, std_height))
draw_page_content(c, 20, std_width, std_height, "Standard Letter")
c.showPage()

# Save PDF
c.save()

print(f"✓ Created {output_file}")
print(f"  Pages 1-5, 7-8, 10-12, 16-18, 20: Standard (612×792) [14 pages]")
print(f"  Page 6: Fold-out (1224×792)")
print(f"  Page 9: Square (792×792)")
print(f"  Page 13: Tall narrow (400×900)")
print(f"  Page 14: Wide short (900×500)")
print(f"  Page 15: Small square (612×612)")
print(f"  Page 19: Poster (1836×792)")
print(f"  Total: 20 pages with 7 different aspect ratios")
