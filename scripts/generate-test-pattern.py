#!/usr/bin/env python3
"""
Generate Test Pattern PDF - Multi-Color Quadrant Design

Each page has:
1. FOUR DISTINCT COLORED CORNERS (different hues, not gradients):
   - TL: Bright saturated color (page hue)
   - TR: White with colored border
   - BL: Black with colored border
   - BR: Complementary color (page hue + 180°)

2. BORDER FRAME around entire page edge - will be obviously clipped if cropped

3. CROSS-HAIRS through center - shows alignment issues

4. CORNER LABELS in contrasting boxes - TL/TR/BL/BR text

5. PAGE NUMBER in center - large, clear identification

6. QUADRANT PATTERNS - each quadrant has different pattern:
   - TL: Horizontal stripes
   - TR: Vertical stripes
   - BL: Diagonal stripes
   - BR: Checkerboard

This design makes it OBVIOUS when:
- Content is clipped (border/corners missing)
- Content is at wrong scale (patterns look wrong)
- Content is misaligned (cross-hairs off-center)
"""

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
import colorsys
import os
import math

def hsv_to_rgb(h, s, v):
    """Convert HSV to RGB (h in degrees, s and v in 0-1)."""
    r, g, b = colorsys.hsv_to_rgb(h / 360.0, s, v)
    return (r, g, b)

def draw_horizontal_stripes(c, x, y, w, h, color1, color2, stripe_height=8):
    """Draw horizontal stripes."""
    num_stripes = int(h / stripe_height) + 1
    for i in range(num_stripes):
        if i % 2 == 0:
            c.setFillColorRGB(*color1)
        else:
            c.setFillColorRGB(*color2)
        sy = y + i * stripe_height
        sh = min(stripe_height, y + h - sy)
        if sh > 0:
            c.rect(x, sy, w, sh, fill=1, stroke=0)

def draw_vertical_stripes(c, x, y, w, h, color1, color2, stripe_width=8):
    """Draw vertical stripes."""
    num_stripes = int(w / stripe_width) + 1
    for i in range(num_stripes):
        if i % 2 == 0:
            c.setFillColorRGB(*color1)
        else:
            c.setFillColorRGB(*color2)
        sx = x + i * stripe_width
        sw = min(stripe_width, x + w - sx)
        if sw > 0:
            c.rect(sx, y, sw, h, fill=1, stroke=0)

def draw_diagonal_stripes(c, x, y, w, h, color1, color2, stripe_width=12):
    """Draw diagonal stripes (top-left to bottom-right)."""
    c.saveState()
    # Clip to the target rectangle
    p = c.beginPath()
    p.rect(x, y, w, h)
    c.clipPath(p, stroke=0, fill=0)

    # Draw diagonal stripes
    total_length = w + h
    num_stripes = int(total_length / stripe_width) + 2

    for i in range(-num_stripes, num_stripes):
        if i % 2 == 0:
            c.setFillColorRGB(*color1)
        else:
            c.setFillColorRGB(*color2)

        offset = i * stripe_width
        # Draw a parallelogram for each stripe
        path = c.beginPath()
        path.moveTo(x + offset, y + h)
        path.lineTo(x + offset + stripe_width, y + h)
        path.lineTo(x + offset + stripe_width + h, y)
        path.lineTo(x + offset + h, y)
        path.close()
        c.drawPath(path, fill=1, stroke=0)

    c.restoreState()

def draw_checkerboard(c, x, y, w, h, color1, color2, cell_size=16):
    """Draw a checkerboard pattern."""
    cols = int(w / cell_size) + 1
    rows = int(h / cell_size) + 1

    for row in range(rows):
        for col in range(cols):
            if (row + col) % 2 == 0:
                c.setFillColorRGB(*color1)
            else:
                c.setFillColorRGB(*color2)

            cx = x + col * cell_size
            cy = y + row * cell_size
            cw = min(cell_size, x + w - cx)
            ch = min(cell_size, y + h - cy)
            if cw > 0 and ch > 0:
                c.rect(cx, cy, cw, ch, fill=1, stroke=0)

def draw_corner_label(c, x, y, size, label, bg_color, text_color):
    """Draw a corner label box with text."""
    c.setFillColorRGB(*bg_color)
    c.rect(x, y, size, size, fill=1, stroke=0)

    # Border
    c.setStrokeColorRGB(*text_color)
    c.setLineWidth(3)
    c.rect(x, y, size, size, fill=0, stroke=1)

    # Text
    c.setFillColorRGB(*text_color)
    c.setFont("Helvetica-Bold", size * 0.4)
    text_width = c.stringWidth(label, "Helvetica-Bold", size * 0.4)
    c.drawString(x + (size - text_width) / 2, y + size * 0.35, label)

def draw_page(c, page_num, width, height, total_pages=12):
    """Draw a page with multi-color quadrant design."""

    # Page base hue (0-360°)
    base_hue = ((page_num - 1) * 360 / total_pages) % 360

    # Define colors
    primary = hsv_to_rgb(base_hue, 0.8, 0.9)       # Main page color
    complement = hsv_to_rgb((base_hue + 180) % 360, 0.8, 0.9)  # Opposite color
    light = hsv_to_rgb(base_hue, 0.3, 0.95)       # Light version
    dark = hsv_to_rgb(base_hue, 0.9, 0.3)         # Dark version
    white = (1, 1, 1)
    black = (0, 0, 0)

    # === BACKGROUND ===
    c.setFillColorRGB(*light)
    c.rect(0, 0, width, height, fill=1, stroke=0)

    # === BORDER FRAME ===
    # Thick colored border around entire page - will be obviously clipped if cropped
    border_width = 15
    c.setStrokeColorRGB(*primary)
    c.setLineWidth(border_width)
    c.rect(border_width/2, border_width/2,
           width - border_width, height - border_width,
           fill=0, stroke=1)

    # Inner border in complement color
    c.setStrokeColorRGB(*complement)
    c.setLineWidth(5)
    c.rect(border_width + 2.5, border_width + 2.5,
           width - 2*border_width - 5, height - 2*border_width - 5,
           fill=0, stroke=1)

    # === QUADRANT PATTERNS ===
    margin = 40
    quad_w = (width - 2*margin) / 2 - 10
    quad_h = (height - 2*margin) / 2 - 10
    quad_margin = 80  # Distance from edges

    # TL quadrant: Horizontal stripes in primary color
    draw_horizontal_stripes(c, quad_margin, height - quad_margin - quad_h,
                           quad_w, quad_h, primary, white, 12)

    # TR quadrant: Vertical stripes in complement color
    draw_vertical_stripes(c, width - quad_margin - quad_w, height - quad_margin - quad_h,
                         quad_w, quad_h, complement, white, 12)

    # BL quadrant: Diagonal stripes in dark color
    draw_diagonal_stripes(c, quad_margin, quad_margin,
                         quad_w, quad_h, dark, light, 16)

    # BR quadrant: Checkerboard in primary and complement
    draw_checkerboard(c, width - quad_margin - quad_w, quad_margin,
                     quad_w, quad_h, primary, complement, 20)

    # === CROSS-HAIRS ===
    cx, cy = width / 2, height / 2
    crosshair_size = 100
    c.setStrokeColorRGB(*black)
    c.setLineWidth(3)
    # Horizontal line
    c.line(cx - crosshair_size, cy, cx + crosshair_size, cy)
    # Vertical line
    c.line(cx, cy - crosshair_size, cx, cy + crosshair_size)
    # Circle at center
    c.circle(cx, cy, 20, fill=0, stroke=1)

    # === CORNER LABELS ===
    corner_size = 50
    corner_margin = 25

    # TL: Primary color with white text
    draw_corner_label(c, corner_margin, height - corner_margin - corner_size,
                     corner_size, "TL", primary, white)

    # TR: White with primary border/text
    draw_corner_label(c, width - corner_margin - corner_size, height - corner_margin - corner_size,
                     corner_size, "TR", white, primary)

    # BL: Black with primary text
    draw_corner_label(c, corner_margin, corner_margin,
                     corner_size, "BL", black, primary)

    # BR: Complement color with white text
    draw_corner_label(c, width - corner_margin - corner_size, corner_margin,
                     corner_size, "BR", complement, white)

    # === PAGE NUMBER ===
    c.setFillColorRGB(*black)
    c.setFont("Helvetica-Bold", 180)
    num_str = str(page_num)
    text_width = c.stringWidth(num_str, "Helvetica-Bold", 180)
    c.drawString(cx - text_width / 2, cy - 50, num_str)

    # White outline for visibility
    c.setStrokeColorRGB(*white)
    c.setLineWidth(4)

    # === PAGE INFO ===
    c.setFont("Helvetica", 14)
    c.setFillColorRGB(*black)
    info = f"Page {page_num}/{total_pages} | Hue: {base_hue:.0f}°"
    text_width = c.stringWidth(info, "Helvetica", 14)
    c.drawString(cx - text_width / 2, 50, info)

    # === SCALE INDICATOR ===
    # A specific-sized rectangle that will look obviously wrong if scaled incorrectly
    scale_box_size = 100
    c.setStrokeColorRGB(*black)
    c.setLineWidth(2)
    c.setFillColorRGB(*white)
    c.rect(cx - scale_box_size/2, cy + 80, scale_box_size, 30, fill=1, stroke=1)
    c.setFillColorRGB(*black)
    c.setFont("Helvetica", 10)
    c.drawString(cx - 40, cy + 92, "100pt scale")

def generate_test_pattern(output_path, num_pages=12):
    """Generate the complete test pattern PDF."""
    width, height = letter

    c = canvas.Canvas(output_path, pagesize=letter)
    c.setTitle("PDF Grid Test Pattern - Multi-Color Quadrants")
    c.setAuthor("Test Pattern Generator")

    for page_num in range(1, num_pages + 1):
        draw_page(c, page_num, width, height, num_pages)
        c.showPage()

    c.save()

    print(f"Generated: {output_path}")
    print(f"  Pages: {num_pages}")
    print(f"  Size: {width:.0f} x {height:.0f} points")
    print(f"")
    print(f"  Features that break visibly when content is incomplete:")
    print(f"    - Colored border frame (clipped if cropped)")
    print(f"    - Four distinct corner labels (TL/TR/BL/BR)")
    print(f"    - Four quadrant patterns (stripes, checker)")
    print(f"    - Cross-hairs at center (shows misalignment)")
    print(f"    - Scale indicator box (wrong if scaled)")
    print(f"    - Page hue: N*30° for page N")

if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)
    output_path = os.path.join(project_dir, "demo", "test-pattern.pdf")

    generate_test_pattern(output_path)
