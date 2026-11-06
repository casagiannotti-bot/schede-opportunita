FROM python:3.12-alpine

ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY app/ /app/

EXPOSE 8099
CMD ["python3", "/app/schede.py"]
