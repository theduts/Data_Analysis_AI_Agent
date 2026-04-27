import logging
import sys


def setup_logging():
    """
    Configures the root logger to output structured logs to stdout.
    This ensures all container logs (Docker) can capture the application outputs.
    """
    # Create an explicit handler for stdout
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.INFO)

    # Define a clear format compatible with CloudWatch / Docker logs
    formatter = logging.Formatter(
        "[%(asctime)s] [%(levelname)s] [%(name)s] - %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S%z",
    )
    handler.setFormatter(formatter)

    # Configure the root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)

    # Avoid duplicate handlers if setup_logging is called multiple times
    if root_logger.handlers:
        root_logger.handlers.clear()

    root_logger.addHandler(handler)

    # Silence overly verbose libraries if needed
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
