import struct, io, zlib

def u16le(v) -> bytes: return struct.pack('<H', v)
def u32le(v) -> bytes: return struct.pack('<I', v)
def f32le(v) -> bytes: return struct.pack('<f', v)
def u16be(v) -> bytes: return struct.pack('>H', v)
def u32be(v) -> bytes: return struct.pack('>I', v)
def f32be(v) -> bytes: return struct.pack('>f', v)

def read_u16le(b) -> int: return struct.unpack('<H', b.read(2))[0]
def read_u32le(b) -> int: return struct.unpack('<I', b.read(4))[0]
def read_f32le(b) -> float: return struct.unpack('<f', b.read(4))[0]
def read_exact(b, n) -> bytes:
    d = b.read(n)
    if len(d) != n: raise EOFError
    return d

def compress(b): return zlib.compress(b, 9)
def decompress(b): return zlib.decompress(b) 