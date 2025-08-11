from .structs import *
from .cpu_raster import rasterize
from .cpu_mesh import extrude_path
import io, base64, struct, json

def render(xvg: XVGFile, width: int, height: int,
           *, target='bitmap', device=None):
    """
    Returns RenderOutput union:
      {type:'bitmap', data:ImageData}  (Pillow.Image.tobytes())
      {type:'mesh', vertices:bytes, indices:bytes}
    """
    if target == 'bitmap':
        img = rasterize(xvg, width, height)
        return {'type': 'bitmap', 'data': img}
    elif target == 'mesh':
        v, i = extrude_path(xvg, width, height)
        return {'type': 'mesh', 'vertices': v, 'indices': i}
    else:
        raise ValueError("unknown target")

def extract(xvg: XVGFile, fmt: str) -> bytes:
    """
    Legacy exporters.
    """
    if fmt == 'svg':
        return _to_svg(xvg)
    if fmt == 'png':
        from PIL import Image
        bmp = render(xvg, xvg.header.width, xvg.header.height, target='bitmap')['data']
        img = Image.frombytes('RGBA', (xvg.header.width, xvg.header.height), bmp)
        buf = io.BytesIO(); img.save(buf, 'PNG'); return buf.getvalue()
    if fmt == 'ico':
        png = extract(xvg, 'png')
        # 6-byte ICO header + PNG
        sizes = [16, 32, 48, 256]
        ico = b'\x00\x00\x01\x00' + struct.pack('<H', len(sizes))
        for s in sizes:
            ico += struct.pack('<BBBBHHII', s, s, 0, 0, 1, 32, len(png), 22+len(sizes)*16)
        ico += png
        return ico
    raise ValueError("unsupported extract format")

def _to_svg(xvg: XVGFile) -> bytes:
    # minimal straight-line SVG fallback
    svg = ['<svg xmlns="http://www.w3.org/2000/svg" '
           f'viewBox="0 0 {xvg.header.width} {xvg.header.height}">']
    # very naive: emit <path> for every move/line/curve opcode
    # omitted for brevity
    svg.append('</svg>')
    return ''.join(svg).encode('utf-8') 