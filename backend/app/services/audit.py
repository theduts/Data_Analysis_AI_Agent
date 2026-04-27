import logging
from app.db.mongodb import get_database
from app.models.audit import AuditTrace

logger = logging.getLogger(__name__)


class AuditLogger:
    def __init__(self):
        self.collection_name = "audit_logs"

    async def log_trace(self, trace: AuditTrace) -> None:
        """
        Logs the execution trace to MongoDB asynchronously.
        Catches and logs any exceptions so horizontal features
        like auditing do not disrupt the core application flow.
        """
        try:
            db = get_database()
            collection = db[self.collection_name]
            trace_dict = trace.model_dump()
            await collection.insert_one(trace_dict)
            logger.info(
                f"Successfully logged audit trace for session_id: {trace.session_id}"
            )
        except Exception as e:
            logger.error(f"Failed to save audit log to MongoDB: {e}", exc_info=True)


audit_logger = AuditLogger()
