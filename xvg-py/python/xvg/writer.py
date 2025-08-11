from .const import *
from .structs import *
from .bitstream import *
import json, io

def dump(xvg: XVGFile) -> bytes:
    out = io.BytesIO()
    # 1. Header
    header_len = HEADER_BASE_LEN + 4
    out.write(MAGIC_V2)
    out.write(u16be(header_len))
    out.write(u16le(xvg.header.width))
    out.write(u16le(xvg.header.height))
    out.write(u16le(xvg.header.flags))
    out.write(u32le(xvg.header.frame_count))
    out.write(f32be(xvg.header.frame_rate))
    out.write(u32be(xvg.header.feature_flags))

    # 2. JSON meta
    json_blob = json.dumps(xvg.json, separators=(',', ':')).encode('utf-8')
    out.write(u32le(len(json_blob)))
    out.write(json_blob)

    # 3. Frame table
    var_rate = xvg.header.frame_rate == 0.0 or bool(xvg.header.flags & 1)
    for f in xvg.frames:
        out.write(u32le(f.offset))
        if var_rate:
            out.write(f32le(f.duration or 0.0))

    # 4. Vector commands
    out.write(u32le(len(xvg.cmds)))
    out.write(xvg.cmds)

    # 5. Assets
    for a in xvg.assets:
        comp = a.compressed
        data = compress(a.data) if comp else a.data
        out.write(bytes([a.type, comp]))
        name_bytes = a.name.encode('utf-8')
        out.write(bytes([len(name_bytes)]))
        out.write(name_bytes)
        out.write(u32le(len(data)))
        if comp: out.write(u32le(len(a.data)))
        out.write(data)

    # 6. SDF Weights
    if xvg.sdf:
        w = compress(xvg.sdf.weights)
        out.write(u32le(len(w)))
        out.write(u16le(xvg.sdf.grid_hint))
        out.write(w)
        xvg.header.feature_flags |= 1 << 4

    # 7. CRDT log
    if xvg.crdt:
        tmp = io.BytesIO()
        for e in xvg.crdt:
            tmp.write(u16le(e.author))
            tmp.write(u64le(e.lamport))
            tmp.write(u16le(len(e.payload)))
            tmp.write(e.payload)
        blob = tmp.getvalue()
        out.write(u32le(len(blob)))
        out.write(blob)
        xvg.header.feature_flags |= 1 << 5

    # 8. CRC-32 footer
    blob = out.getvalue()
    crc = zlib.crc32(blob) & 0xffffffff
    out.write(u32be(crc))
    out.write(EOF_SENTINEL)
    return out.getvalue()

# helper for 64-bit LE
def u64le(v): return struct.pack('<Q', v) 