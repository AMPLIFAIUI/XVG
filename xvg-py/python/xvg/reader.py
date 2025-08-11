from .const import *
from .structs import *
from .bitstream import *
import json, io

def load(src: bytes) -> XVGFile:
    b = io.BytesIO(src)
    if read_exact(b, 4) != MAGIC_V2:
        raise ValueError("Not XVG 1.0")

    header_len = read_u16be(b)
    width  = read_u16le(b)
    height = read_u16le(b)
    flags  = read_u16le(b)
    frames = read_u32le(b)
    fps    = read_f32le(b)
    feature_flags = read_u32be(b)

    # JSON
    json_len = read_u32le(b)
    json_blob = read_exact(b, json_len)
    meta = json.loads(json_blob.decode('utf-8'))

    # Frame table
    var_rate = fps == 0.0 or bool(flags & 1)
    frame_tab = []
    for _ in range(frames):
        off = read_u32le(b)
        dur = read_f32le(b) if var_rate else None
        frame_tab.append(Frame(off, dur))

    # Commands
    cmd_len = read_u32le(b)
    cmds = read_exact(b, cmd_len)

    # Assets
    assets = []
    while b.tell() < len(src) - 11:  # leave room for CRC+EOF
        peek = b.read(1)
        if not peek: break
        typ = peek[0]
        if typ == 0xff: break  # sentinel
        comp = bool(read_exact(b, 1)[0])
        name_len = read_exact(b, 1)[0]
        name = read_exact(b, name_len).decode('utf-8')
        comp_len = read_u32le(b)
        if comp:
            decomp_len = read_u32le(b)
            data = decompress(read_exact(b, comp_len))
        else:
            data = read_exact(b, comp_len)
        assets.append(Asset(typ, name, data, comp))

    # Sections 6-9 handled by offsets in meta
    footer_pos = len(src) - 11
    blob = src[:footer_pos]
    crc_expected = struct.unpack('>I', src[footer_pos:footer_pos+4])[0]
    if (zlib.crc32(blob) & 0xffffffff) != crc_expected:
        raise ValueError("CRC mismatch")
    if src[-7:] != EOF_SENTINEL:
        raise ValueError("Truncated file")

    return XVGFile(
        header=Header(width, height, flags, frames, fps, feature_flags),
        json=meta,
        frames=frame_tab,
        cmds=cmds,
        assets=assets,
        # sections 6-9 not decoded here for brevity
    ) 