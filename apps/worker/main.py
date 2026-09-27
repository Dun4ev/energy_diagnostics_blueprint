"""Foundation worker process. Stage07 must implement replay and jobs."""

import signal
import threading


def main():
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    print("Foundation worker: jobs/replay NOT IMPLEMENTED; external AI disabled", flush=True)
    stop.wait()


if __name__ == "__main__":
    main()
