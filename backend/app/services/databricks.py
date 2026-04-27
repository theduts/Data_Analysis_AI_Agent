import logging
import re
import asyncio
from typing import Any, Dict, List
from datetime import datetime
from decimal import Decimal
import databricks.sql  # type: ignore
from app.core.config import settings

logger = logging.getLogger(__name__)


class DatabricksConnection:
    """
    Singleton class to manage connections and execute queries against Databricks SQL Warehouse.
    """

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(DatabricksConnection, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        self.access_token = settings.DATABRICKS_ACCESS_TOKEN
        self.server_hostname = settings.DATABRICKS_SERVER_HOSTNAME
        self.http_path = settings.DATABRICKS_HTTP_PATH

        self._initialized = True

    def _validate_query(self, query: str) -> None:
        """
        Safety Gate: Validates the query to prevent destructive commands.
        Raises ValueError if a forbidden command is detected.
        """
        forbidden_commands = [
            r"\bDELETE\b",
            r"\bUPDATE\b",
            r"\bINSERT\b",
            r"\bDROP\b",
            r"\bALTER\b",
            r"\bTRUNCATE\b",
            r"\bGRANT\b",
            r"\bREVOKE\b",
        ]

        query_upper = query.upper()
        for pattern in forbidden_commands:
            if re.search(pattern, query_upper):
                raise ValueError(
                    f"Forbidden command detected in query. Pattern matched: {pattern}"
                )

    def _clean_data(self, rows: List[Any], columns: List[str]) -> List[Dict[str, Any]]:
        """
        Phase 3: Standardize output data types (Decimals to floats, Datetimes to ISO strings).
        """
        if rows is None:
            return []

        cleaned_data = []
        for row in rows:
            row_dict: Dict[str, Any] = {}
            for idx, col_name in enumerate(columns):
                val = row[idx]
                if isinstance(val, Decimal):
                    row_dict[col_name] = float(val)
                elif isinstance(val, datetime):
                    row_dict[col_name] = val.isoformat()
                else:
                    row_dict[col_name] = val
            cleaned_data.append(row_dict)
        return cleaned_data

    def get_connection(self):
        """
        Initializes and returns a connection to Databricks.
        """
        if not self.access_token or not self.server_hostname or not self.http_path:
            raise ValueError(
                "Databricks credentials not configured in environment variables."
            )

        return databricks.sql.connect(
            server_hostname=self.server_hostname,
            http_path=self.http_path,
            access_token=self.access_token,
            # We can configure timeouts here at the connection level if supported by the driver.
        )

    def execute_query(self, query: str, subagent_id: str) -> Dict[str, Any]:
        """
        Phase 2 & 5: Universal execution method with Safety Gate and Logging.
        """
        start_time = datetime.now()

        logger.info(f"[Databricks] Subagent {subagent_id} requested query execution.")

        try:
            self._validate_query(query)

            # Using closing context managers to ensure cleanup
            with self.get_connection() as connection:
                with connection.cursor() as cursor:
                    # Timeout configuration (Safety gate timeouts)
                    # For databricks-sql-connector, we can execute with a timeout if desired,
                    # though native support depends on the version. We'll rely on the driver's default or connection timeouts.
                    logger.debug(f"[Databricks] Executing query: {query}")
                    cursor.execute(query)

                    # Fetch rows and handle potential None return for non-DQL queries
                    rows = cursor.fetchall()
                    if rows is None:
                        rows = []

                    # Columns extract - handle potential None for cursor.description
                    description = cursor.description
                    columns = [desc[0] for desc in description] if description else []

                    cleaned_data = self._clean_data(rows, columns)
                    row_count = len(cleaned_data)

            execution_time = (datetime.now() - start_time).total_seconds()
            logger.info(
                f"[Databricks] Query successful. Subagent: {subagent_id}, Time: {execution_time}s, Rows: {row_count}"
            )

            return {
                "status": "success",
                "metadata": {
                    "row_count": row_count,
                    "execution_time_seconds": execution_time,
                    "subagent_id": subagent_id,
                },
                "result": cleaned_data,
            }

        except Exception as e:
            execution_time = (datetime.now() - start_time).total_seconds()
            logger.error(
                f"[Databricks] Query failed. Subagent: {subagent_id}, Time: {execution_time}s, Error: {str(e)}"
            )

            return {
                "status": "error",
                "metadata": {
                    "execution_time_seconds": execution_time,
                    "subagent_id": subagent_id,
                },
                "error_message": str(e),
                "result": [],
            }

    async def execute_query_async(self, query: str, subagent_id: str) -> Dict[str, Any]:
        """
        Asynchronous wrapper around `execute_query`.
        Runs the blocking databricks-sql-connector execution in a separate thread.
        """
        return await asyncio.to_thread(self.execute_query, query, subagent_id)  # type: ignore


# Instantiate the singleton instance for easy import
databricks_connection = DatabricksConnection()
