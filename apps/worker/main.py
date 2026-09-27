"""Local replay worker. No external AI, truth data, or equipment connection."""
import signal
import threading

from sqlalchemy import inspect

from apps.api.db import make_session_factory
from apps.worker.replay import RuntimeRow, tick


def main():
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    factory = make_session_factory()
    engine = factory.kw["bind"]
    while not stop.is_set():
        try:
            if not inspect(engine).has_table("scenario_runs"):
                stop.wait(2)
                continue
            RuntimeRow.__table__.create(engine, checkfirst=True)
            break
        except Exception as exc:
            print(f"Waiting for persistence: {type(exc).__name__}", flush=True)
            stop.wait(2)
    print("Replay worker ready: observations only, external AI disabled", flush=True)
    while not stop.is_set():
        try:
            worked = tick(factory)
        except Exception as exc:
            print(f"Worker retry: {type(exc).__name__}", flush=True)
            worked = False
        stop.wait(0.2 if worked else 1)


if __name__ == "__main__":
    main()
