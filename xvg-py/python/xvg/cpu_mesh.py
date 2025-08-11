import struct
from .structs import XVGFile

def extrude_path(xvg: XVGFile, w: int, h: int):
    # return vertices & indices as bytes
    vertices = struct.pack('f'*12, 0,0,0, 1,0,0, 1,1,0, 0,1,0)
    indices  = struct.pack('H'*6, 0,1,2, 0,2,3)
    return vertices, indices 