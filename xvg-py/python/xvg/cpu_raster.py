from PIL import Image, ImageDraw
from .structs import XVGFile
from .bitstream import *
import struct

# XVG command opcodes
MOVE_TO = 0x01
LINE_TO = 0x02
CURVE_TO = 0x03
CLOSE_PATH = 0x04
SET_FILL_COLOR = 0x10
SET_STROKE_COLOR = 0x11
SET_FILL_INDEXED = 0x12
SET_STROKE_INDEXED = 0x13

def rasterize(xvg: XVGFile, w: int, h: int) -> bytes:
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Parse and execute XVG commands
    b = io.BytesIO(xvg.cmds)
    current_x, current_y = 0, 0
    fill_color = None
    stroke_color = None
    stroke_width = 1.0
    path_points = []
    
    while b.tell() < len(xvg.cmds):
        try:
            opcode = b.read(1)[0]
        except IndexError:
            break
            
        if opcode == MOVE_TO:
            x = struct.unpack('>f', b.read(4))[0]
            y = struct.unpack('>f', b.read(4))[0]
            current_x, current_y = x, y
            path_points = [(current_x, current_y)]
            
        elif opcode == LINE_TO:
            x = struct.unpack('>f', b.read(4))[0]
            y = struct.unpack('>f', b.read(4))[0]
            path_points.append((x, y))
            current_x, current_y = x, y
            
        elif opcode == CURVE_TO:
            x1 = struct.unpack('>f', b.read(4))[0]
            y1 = struct.unpack('>f', b.read(4))[0]
            x2 = struct.unpack('>f', b.read(4))[0]
            y2 = struct.unpack('>f', b.read(4))[0]
            x = struct.unpack('>f', b.read(4))[0]
            y = struct.unpack('>f', b.read(4))[0]
            # For now, approximate curve with line segments
            path_points.append((x, y))
            current_x, current_y = x, y
            
        elif opcode == CLOSE_PATH:
            if len(path_points) > 2:
                path_points.append(path_points[0])  # Close the path
                
        elif opcode == SET_FILL_COLOR:
            r = b.read(1)[0]
            g = b.read(1)[0]
            b_val = b.read(1)[0]
            a = b.read(1)[0]
            fill_color = (r, g, b_val, a)
            
        elif opcode == SET_STROKE_COLOR:
            r = b.read(1)[0]
            g = b.read(1)[0]
            b_val = b.read(1)[0]
            a = b.read(1)[0]
            stroke_color = (r, g, b_val, a)
            stroke_width = struct.unpack('>f', b.read(4))[0]
            
        elif opcode == SET_FILL_INDEXED:
            palette_index = b.read(1)[0]
            # Use a default palette for now
            palette = [(255, 0, 0, 255), (0, 255, 0, 255), (0, 0, 255, 255), 
                      (255, 255, 0, 255), (255, 0, 255, 255), (0, 255, 255, 255)]
            if palette_index < len(palette):
                fill_color = palette[palette_index]
                
        elif opcode == SET_STROKE_INDEXED:
            palette_index = b.read(1)[0]
            # Use a default palette for now
            palette = [(255, 0, 0, 255), (0, 255, 0, 255), (0, 0, 255, 255), 
                      (255, 255, 0, 255), (255, 0, 255, 255), (0, 255, 255, 255)]
            if palette_index < len(palette):
                stroke_color = palette[palette_index]
    
    # Draw the collected path
    if len(path_points) > 1:
        # Convert to PIL coordinates
        pil_points = [(int(x), int(y)) for x, y in path_points]
        
        if fill_color:
            draw.polygon(pil_points, fill=fill_color)
        if stroke_color and stroke_width > 0:
            draw.line(pil_points, fill=stroke_color, width=int(stroke_width))
    
    return img.tobytes() 