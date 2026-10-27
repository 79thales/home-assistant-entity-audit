"""Native Brother print validation and simulated-printer transport tests.

No physical printer is contacted. Local TCP peers exercise the actual binary
and XML framing, request deduplication, media mismatches and ambiguous failures.
"""

import asyncio
import base64
import importlib.util
import struct
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    "entity_audit_printing", Path(__file__).resolve().parents[1] / "custom_components/entity_audit/printing.py"
)
assert SPEC and SPEC.loader
PRINT = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = PRINT
SPEC.loader.exec_module(PRINT)


def jpeg(width, height):
    """Minimal frame for header validation only; not an image decoder fixture."""
    return b"\xff\xd8\xff\xc0" + struct.pack(">HBHHB", 11, 8, height, width, 1) + b"\x01\x11\x00\xff\xd9"


def ql_label():
    return PRINT.prepare_label("ql820nwb", "dk_11209", 29, base64.b64encode(bytes(87 * 271)).decode())


def vc_label():
    return PRINT.prepare_label("vc500w", "cz_1005", 40, base64.b64encode(jpeg(616, 499)).decode())


def ql_status(width=62, media=0x4B, length=29, kind=0):
    frame = bytearray(32)
    frame[:5] = b"\x80\x20\x42\x34\x41"
    frame[10], frame[11], frame[17], frame[18] = width, media, length, kind
    return frame


def vc_reply(payload=None, code=0):
    data = payload.encode() if payload else b""
    return f"<?xml version=\"1.0\"?><status><code>{code}</code><datasize>{len(data)}</datasize></status>\n".encode() + (b" " + data if data else b"")


class ValidationTest(unittest.TestCase):
    def test_ql_native_geometry_and_orientation(self):
        pixels = bytearray(87 * 271)
        pixels[0] = 0x80  # First visible pixel on the left of the label.
        label = PRINT.prepare_label("ql820nwb", "dk_11209", 29, base64.b64encode(pixels).decode())
        row = label.data.split(b"g\x00\x5a", 1)[1][:90]
        pin = 12 + 695  # QL head runs right-to-left, unlike canvas coordinates.
        self.assertEqual(row[pin // 8], 0x80 >> (pin % 8))
        self.assertEqual(sum(value.bit_count() for value in row), 1)
        self.assertEqual(label.data[-1:], b"\x1a")
        self.assertEqual((label.width, label.height), (696, 271))

    def test_every_dk_roll_has_native_print_geometry(self):
        for roll, (_width, length, dots, _right, height) in PRINT.QL_ROLLS.items():
            length = length or 40
            height = height or round(length / 25.4 * 300) - 70
            label = PRINT.prepare_label("ql820nwb", roll, length, base64.b64encode(bytes((dots + 7) // 8 * height)).decode())
            self.assertEqual((label.width, label.height), (dots, height))

    def test_vc_jpeg_matches_native_vivid_resolution(self):
        self.assertEqual((vc_label().width, vc_label().height), (616, 499))
        for roll, width in PRINT.VC_ROLLS.items():
            dots = round(width / 25.4 * 313)
            label = PRINT.prepare_label("vc500w", roll, 40, base64.b64encode(jpeg(dots, 499)).decode())
            self.assertEqual(label.width_mm, width)

    def test_invalid_data_and_cross_model_rolls_fail_before_network(self):
        for model, roll, length, data in [
            ("ql820nwb", "cz_1005", 40, "AA=="),
            ("vc500w", "dk_11209", 29, "AA=="),
            ("ql820nwb", "dk_11209", 40, "AA=="),
            ("ql820nwb", "dk_11209", 29, "bad-base64!"),
            ("ql820nwb", "dk_22205", 400, "AA=="),
            ("vc500w", "cz_1005", 40, base64.b64encode(jpeg(616, 493)).decode()),
        ]:
            with self.subTest(roll=roll, data=data[:15]), self.assertRaises(PRINT.PrintError):
                PRINT.prepare_label(model, roll, length, data)

    def test_printer_address_is_not_an_arbitrary_url(self):
        self.assertEqual(PRINT.printer_host(" printer.local "), "printer.local")
        self.assertEqual(PRINT.printer_host("192.0.2.5"), "192.0.2.5")
        for host in ("http://printer.local", "user:secret@printer", "printer:9100", "0.0.0.0", "224.0.0.1"):
            with self.assertRaises(PRINT.PrintError):
                PRINT.printer_host(host)


class TransportTest(unittest.IsolatedAsyncioTestCase):
    async def run_with_peer(self, handler, action):
        async def peer(reader, writer):
            try:
                await handler(reader, writer)
            finally:
                writer.close()
                await writer.wait_closed()
        server = await asyncio.start_server(peer, "127.0.0.1", 0)
        original_connect = asyncio.open_connection
        port = server.sockets[0].getsockname()[1]

        async def connect(_host, _port, **kwargs):
            self.assertEqual(_port, 9100)
            return await original_connect("127.0.0.1", port, **kwargs)
        try:
            with patch.object(PRINT.asyncio, "open_connection", connect):
                return await action()
        finally:
            server.close()
            await server.wait_closed()

    async def test_ql_completion_and_duplicate_request_is_not_reprinted(self):
        received = []
        label = ql_label()
        async def peer(reader, writer):
            self.assertEqual(await reader.readexactly(3), b"\x1b\x69\x53")
            writer.write(ql_status())
            await writer.drain()
            received.append(await reader.readexactly(len(label.data)))
            writer.write(ql_status(kind=6) + ql_status(kind=1))
            await writer.drain()
        async def action():
            service = PRINT.PrintService({"ql820nwb": "printer.local"})
            first = await service.submit("request-1", label)
            second = await service.submit("request-1", label)
            self.assertEqual(first, second)
            self.assertEqual(first["state"], "completed")
            self.assertTrue(first["submitted"])
        await self.run_with_peer(peer, action)
        self.assertEqual(received, [label.data])

    async def test_wrong_loaded_roll_sends_no_print_data(self):
        received = []
        async def peer(reader, writer):
            await reader.readexactly(3)
            writer.write(ql_status(width=29))
            await writer.drain()
            received.append(await reader.read())
        async def action():
            result = await PRINT.PrintService({"ql820nwb": "printer.local"}).submit("wrong-roll", ql_label())
            self.assertEqual(result["state"], "failed")
            self.assertFalse(result["submitted"])
            self.assertIn("roll", result["message"])
            await asyncio.sleep(0)
        await self.run_with_peer(peer, action)
        self.assertTrue(all(data == b"" for data in received))

    async def test_lost_reply_after_submission_is_unknown_and_not_retried(self):
        count = 0
        label = ql_label()
        async def peer(reader, writer):
            nonlocal count
            count += 1
            await reader.readexactly(3)
            writer.write(ql_status())
            await writer.drain()
            await reader.readexactly(len(label.data))
            # EOF after bytes were accepted is not evidence of completion.
        async def action():
            service = PRINT.PrintService({"ql820nwb": "printer.local"})
            first = await service.submit("lost-reply", label)
            self.assertEqual(first["state"], "unknown")
            self.assertTrue(first["submitted"])
            self.assertEqual(await service.submit("lost-reply", label), first)
        await self.run_with_peer(peer, action)
        self.assertEqual(count, 1)

    async def test_vc_native_acknowledgements_mean_accepted_not_printed(self):
        label = vc_label()
        async def peer(reader, writer):
            request = await reader.readuntil(b"</read>")
            self.assertIn(b"/config.xml", request)
            # Odpovídá zjištěnému označení modelu, šířce a oddělovači reálné tiskárny.
            writer.write(vc_reply('<config><model_name>Wedge</model_name><media_features><width_inches>2.000</width_inches></media_features></config>').replace(b'\n ', b'\n\x00'))
            await writer.drain()
            self.assertIn(b"/status.xml", await reader.readuntil(b"</read>"))
            writer.write(vc_reply("<status><print_state>IDLE</print_state><print_job_error>NONE</print_job_error></status>"))
            await writer.drain()
            request = await reader.readuntil(b"</print>")
            self.assertIn(b"<lpi>317</lpi>", request)
            self.assertIn(b"<cutmode>full</cutmode>", request)
            writer.write(vc_reply())
            await writer.drain()
            self.assertEqual(await reader.readexactly(len(label.data)), label.data)
            writer.write(vc_reply())
            await writer.drain()
        async def action():
            result = await PRINT.PrintService({"vc500w": "printer.local"}).submit("vc-job", label)
            self.assertEqual(result["state"], "accepted")
            self.assertTrue(result["submitted"])
        await self.run_with_peer(peer, action)

    async def test_fragmented_vc_reply_and_error_rejection(self):
        payload = "<config><model_name>VC-500W</model_name></config>"
        reader = asyncio.StreamReader()
        for value in vc_reply(payload):
            reader.feed_data(bytes([value]))
        reader.feed_eof()
        _, parsed = await PRINT._vc_reply(reader)
        self.assertEqual(parsed.findtext("model_name"), "VC-500W")
        reader = asyncio.StreamReader()
        reader.feed_data(vc_reply(code=1))
        reader.feed_eof()
        with self.assertRaises(PRINT.PrintError):
            await PRINT._vc_reply(reader)

    async def test_wrong_cz_roll_is_rejected_before_print_header(self):
        async def peer(reader, writer):
            await reader.readuntil(b"</read>")
            writer.write(vc_reply('<config><model_name>Wedge</model_name><media_features><width_inches>1.000</width_inches></media_features></config>'))
            await writer.drain()
            self.assertEqual(await reader.read(), b"")
        async def action():
            result = await PRINT.PrintService({"vc500w": "printer.local"}).submit("wrong-cz-roll", vc_label())
            self.assertEqual(result["state"], "failed")
            self.assertFalse(result["submitted"])
            self.assertIn("CZ roll", result["message"])
        await self.run_with_peer(peer, action)

    async def test_same_printer_cannot_receive_concurrent_labels(self):
        waiting = asyncio.Event()
        release = asyncio.Event()
        async def peer(reader, writer):
            await reader.readexactly(3)
            waiting.set()
            await release.wait()
            writer.write(ql_status())
            await writer.drain()
            await reader.readexactly(len(ql_label().data))
            writer.write(ql_status(kind=1))
            await writer.drain()
        async def action():
            service = PRINT.PrintService({"ql820nwb": "printer.local"})
            first = asyncio.create_task(service.submit("first-label", ql_label()))
            try:
                await asyncio.wait_for(waiting.wait(), 2)
                pending = await service.submit("first-label", ql_label())
                self.assertEqual(pending["state"], "in_progress")
                with self.assertRaises(PRINT.PrintError):
                    await service.submit("second-label", ql_label())
            finally:
                release.set()
                result = await first
            self.assertEqual(result["state"], "completed")
        await self.run_with_peer(peer, action)

    async def test_timeout_is_bounded(self):
        reader = asyncio.StreamReader()
        with patch.object(PRINT, "REPLY_TIMEOUT", 0.01), self.assertRaises(TimeoutError):
            await PRINT._ql_status(reader)

    async def test_configured_addresses_are_not_exposed(self):
        service = PRINT.PrintService({"ql820nwb": "192.0.2.5", "vc500w": ""})
        self.assertEqual(service.configured(), {"ql820nwb": True, "vc500w": False})
        with self.assertRaises(PRINT.PrintError):
            await service.submit("not-configured", vc_label())
