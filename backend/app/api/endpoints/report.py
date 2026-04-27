from fastapi import APIRouter, Depends, Response, HTTPException
from fastapi.responses import StreamingResponse
from app.api import deps
from pydantic import BaseModel
import markdown
from xhtml2pdf import pisa
from io import BytesIO
from datetime import datetime
from app.schemas.report import ReportResponse, StateBranchesResponse
from app.services.report_service import report_service
from app.services.executive_report_service import executive_report_service
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/", response_model=ReportResponse)
async def get_weekly_report(
    refresh: bool = False,
    current_user: str = Depends(deps.get_current_user_subject),
):
    """
    Get the weekly report metrics sourced entirely from Databricks.
    """
    return await report_service.get_weekly_report(current_user, refresh)


@router.delete("/cache", status_code=204)
async def invalidate_report_cache(
    current_user: str = Depends(deps.get_current_user_subject),
):
    """
    Invalidate the weekly report Redis cache.
    The next GET /report will trigger a full Databricks refresh.
    """
    from app.db.redis_client import get_cache_client

    client = get_cache_client()
    await client.delete(f"customer_profile_session_{current_user}")
    await client.delete(f"state_branches_session_{current_user}")


@router.get("/heatmap/branches", response_model=StateBranchesResponse)
async def get_state_branches(
    state: str,
    channel: str,
    is_target: bool,
    current_user: str = Depends(deps.get_current_user_subject),
):
    """
    Get the ordered list of branches for a given state, channel, and target filter.
    """
    return await report_service.get_state_branches(
        state, channel, is_target, current_user
    )


@router.post("/executive-summary/stream")
async def stream_executive_summary(
    current_user: str = Depends(deps.get_current_user_subject),
):
    """
    Streams a full Monthly Executive Summary using Bedrock Claude LLM.
    Strictly stateless, does not insert into MongoDB.
    """
    return StreamingResponse(
        executive_report_service.stream_executive_summary(current_user),
        media_type="text/event-stream"
    )


class PDFRequest(BaseModel):
    markdown_text: str


# Ajustado o path para evitar sobreposição de prefixos.
# Se a sua URL do frontend chama /api/report/pdf, garanta que o router base já cuida do /api/report
@router.post("/pdf")
async def generate_pdf_on_the_fly(request: PDFRequest):
    # 1. Pré-processamento de Emojis para compatibilidade com xhtml2pdf
    # Substituímos emojis por spans coloridos com símbolos que a fonte padrão (Helvetica/Arial) suporta.
    processed_text = request.markdown_text.replace("✅", '<span style="color: green;">&#10004;</span>') # Checkmark
    processed_text = processed_text.replace("⚠️", '<span style="color: #f6ad55;">&#9888;</span>')      # Warning Sign
    processed_text = processed_text.replace("🔴", '<span style="color: #e53e3e;">&#9679;</span>')      # Red Circle (Bullet)
    processed_text = processed_text.replace("🟡", '<span style="color: #d69e2e;">&#9679;</span>')      # Yellow Circle
    processed_text = processed_text.replace("🟢", '<span style="color: #38a169;">&#9679;</span>')      # Green Circle
    processed_text = processed_text.replace("⛔", '<span style="color: #c53030;">&#9746;</span>')      # X Square

    # 2. Converte Markdown para HTML (suportando tabelas)
    html_content = markdown.markdown(processed_text, extensions=["tables"])

    # 3. Injeta CSS Corporativo adaptado para xhtml2pdf
    styled_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            @page {{ size: a4 portrait; margin: 1.5cm; }}
            body {{ font-family: Helvetica, Arial, sans-serif; color: #1a202c; font-size: 11px; }}
            h1, h2, h3 {{ color: #2d3748; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-top: 15px; }}
            h1 {{ font-size: 17px; }}
            h2 {{ font-size: 14px; }}
            /* FIX 1: Evitar quebras de página dentro de tabelas e linhas */
            table {{ width: 100%; border-collapse: collapse; margin: 10px 0; page-break-inside: avoid; }}
            tr {{ page-break-inside: avoid; }}
            th, td {{ border: 1px solid #cbd5e0; padding: 5px; text-align: left; }}
            th {{ background-color: #f7fafc; font-weight: bold; }}
            li {{ margin-bottom: 3px; }}
            span {{ font-family: DejaVu Sans, Arial, sans-serif; }} /* fallback para símbolos unicode */
        </style>
    </head>
    <body>
        <h1 style="text-align: center; color: #1a365d;">RetailCo | Fechamento Executivo</h1>
        <div style="text-align: center; font-size: 9px; color: #718096; margin-bottom: 20px;">
            Relatório Gerencial Confidencial - Gerado em {datetime.now().strftime('%d/%m/%Y')}
        </div>
        {html_content}
    </body>
    </html>
    """

    # 3. Gera PDF na RAM
    pdf_buffer = BytesIO()
    # pisa.CreatePDF retorna um objeto pisaContext que possui o atributo 'err'
    pisa_status = pisa.CreatePDF(src=styled_html, dest=pdf_buffer)

    # 4. Tratamento de erro com Log
    # O analisador estático pode identificar incorretamente o tipo como 'bytes'
    if getattr(pisa_status, "err", 0):
        logger.error("Erro interno na biblioteca xhtml2pdf ao gerar o documento.")
        raise HTTPException(status_code=500, detail="Erro ao gerar o PDF.")

    # 5. Retorna o Arquivo Binário
    return Response(
        content=pdf_buffer.getvalue(),
        media_type="application/pdf",
        headers={
            "Content-Disposition": "attachment; filename=fechamento_executivo.pdf"
        },
    )
