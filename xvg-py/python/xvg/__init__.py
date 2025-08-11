"""
XVG 1.0 Tesseract – pure-Python, zero-dependency reference
----------------------------------------------------------
render(width, height, **kw)  -> RenderOutput
extract(fmt)                 -> bytes
All other symbols are private.
"""
from .reader import load
from .writer import dump
from .api import render, extract

__all__ = ["load", "dump", "render", "extract"] 