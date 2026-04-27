# Base image para otimização de tempo de build
FROM python:3.12-slim

# Desativar buffer nas logs do Python e proibir gravação pycache  
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Configuração do diretório de trabalho
WORKDIR /app

# Instalar dependências base de build, e depois limpar cache  
# (necessário para alguns drivers de C de bancos postgres)
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    gcc \
    pkg-config \
    libcairo2-dev \
    && rm -rf /var/lib/apt/lists/*

# Copiar apenas os requerimentos e instalar para cache
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar a aplicação inteira  
COPY . .  

# Expor porta padrāo do uvicorn 
EXPOSE 80  

# Adicioar PYTHONPATH para não termos erros de absolute/relative import
ENV PYTHONPATH=/app

# Comando de Run final do Gunicorn com Uvicorn workers 
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "80"]
