"""Streaming reader for the very large top-level-array JSON dumps (Parltrack).

json.load() on a 650 MB dump costs several GB of RAM and gives us no way to fail
early on a truncated file.  These helpers walk the top-level array one element at
a time using the stdlib decoder, so memory stays proportional to a single record.
"""

import json
from typing import Iterator, Any

_DECODER = json.JSONDecoder()
_WS = " \t\n\r"


def iter_json_array(path: str, chunk_size: int = 8 << 20) -> Iterator[Any]:
    """Yield each element of a JSON file whose top level is an array.

    Raises ValueError if the file is not a top-level array or is truncated.
    """
    with open(path, "r", encoding="utf-8") as fh:
        buf = fh.read(chunk_size)
        if not buf:
            raise ValueError(f"{path}: file is empty")
        pos = 0
        while pos < len(buf) and buf[pos] in _WS:
            pos += 1
        if pos >= len(buf) or buf[pos] != "[":
            raise ValueError(f"{path}: expected a top-level JSON array")
        pos += 1
        buf = buf[pos:]

        expect_value = True
        while True:
            # Drop leading whitespace/commas, refilling as needed.
            while True:
                i = 0
                while i < len(buf) and buf[i] in _WS:
                    i += 1
                buf = buf[i:]
                if buf:
                    break
                more = fh.read(chunk_size)
                if not more:
                    raise ValueError(f"{path}: truncated before end of array")
                buf = more

            if buf[0] == "]":
                return
            if buf[0] == ",":
                buf = buf[1:]
                expect_value = True
                continue
            if not expect_value:
                raise ValueError(f"{path}: expected ',' or ']' near {buf[:40]!r}")

            # Decode one element, growing the buffer until it parses.
            while True:
                try:
                    obj, end = _DECODER.raw_decode(buf)
                except ValueError:
                    more = fh.read(chunk_size)
                    if not more:
                        raise ValueError(f"{path}: truncated mid-element")
                    buf += more
                    continue
                break
            yield obj
            buf = buf[end:]
            expect_value = False


def read_object_head(path: str, stop_after: str, chunk_size: int = 8 << 20) -> dict:
    """Read the leading keys of a large JSON object and stop.

    The network payloads put the heavy `edgesBySubject` map last, so a reader
    that stops once it has seen `stop_after` never has to hold it in memory.
    """
    out = {}
    with open(path, "r", encoding="utf-8") as fh:
        buf = fh.read(chunk_size)
        pos = 0
        while pos < len(buf) and buf[pos] in _WS:
            pos += 1
        if pos >= len(buf) or buf[pos] != "{":
            raise ValueError(f"{path}: expected a top-level JSON object")
        buf = buf[pos + 1:]

        while True:
            while True:
                i = 0
                while i < len(buf) and (buf[i] in _WS or buf[i] == ","):
                    i += 1
                buf = buf[i:]
                if buf:
                    break
                more = fh.read(chunk_size)
                if not more:
                    return out
                buf = more
            if buf[0] == "}":
                return out

            while True:  # key
                try:
                    key, end = _DECODER.raw_decode(buf)
                except ValueError:
                    more = fh.read(chunk_size)
                    if not more:
                        raise ValueError(f"{path}: truncated reading a key")
                    buf += more
                    continue
                break
            buf = buf[end:].lstrip()
            while not buf:
                buf = fh.read(chunk_size).lstrip()
                if not buf:
                    raise ValueError(f"{path}: truncated before ':'")
            if buf[0] != ":":
                raise ValueError(f"{path}: expected ':' after key {key!r}")
            # raw_decode does not tolerate leading whitespace, and json.dump
            # writes ": " between key and value.
            buf = buf[1:].lstrip()
            while not buf:
                buf = fh.read(chunk_size).lstrip()
                if not buf:
                    raise ValueError(f"{path}: truncated before value of {key!r}")

            while True:  # value
                try:
                    value, end = _DECODER.raw_decode(buf)
                except ValueError:
                    more = fh.read(chunk_size)
                    if not more:
                        raise ValueError(f"{path}: truncated reading value of {key!r}")
                    buf += more
                    continue
                break
            out[key] = value
            buf = buf[end:]
            if key == stop_after:
                return out


class JsonArrayWriter:
    """Write a JSON array incrementally so we never hold the whole output."""

    def __init__(self, path: str, indent: int | None = None):
        self.path = path
        self.indent = indent
        self._fh = None
        self._count = 0

    def __enter__(self):
        self._fh = open(self.path, "w", encoding="utf-8")
        self._fh.write("[")
        return self

    def write(self, obj: Any) -> None:
        if self._count:
            self._fh.write(",")
        if self.indent:
            self._fh.write("\n" + " " * self.indent)
        self._fh.write(json.dumps(obj, ensure_ascii=False))
        self._count += 1

    @property
    def count(self) -> int:
        return self._count

    def __exit__(self, exc_type, exc, tb):
        if exc_type is None:
            if self.indent and self._count:
                self._fh.write("\n")
            self._fh.write("]")
        self._fh.close()
        self._fh = None
        # Never leave a half-written file behind that a later step would read as valid.
        if exc_type is not None:
            import os
            try:
                os.remove(self.path)
            except OSError:
                pass
        return False
