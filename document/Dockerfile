FROM mcr.microsoft.com/playwright:v1.64.0-noble
USER root
RUN apt-get update && apt-get install -y --no-install-recommends python3-venv tesseract-ocr poppler-utils libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/document
ENV PATH="/opt/document/bin:$PATH" PIP_DISABLE_PIP_VERSION_CHECK=1 HF_HOME=/opt/models HF_HUB_DISABLE_TELEMETRY=1 DO_NOT_TRACK=1 OMP_NUM_THREADS=2
RUN python -m pip install --no-cache-dir pip==26.2.0 setuptools==84.1.0
RUN pip install --no-cache-dir torch==2.13.0 torchvision==0.28.0 --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt /tmp/requirements.txt
COPY build_compat_wheel.py /tmp/build_compat_wheel.py
RUN python /tmp/build_compat_wheel.py --output-dir /tmp/wheelhouse
RUN pip install --no-cache-dir --find-links /tmp/wheelhouse -r /tmp/requirements.txt && pip check && pip freeze > /opt/document-lock.txt
RUN python -c "from unstructured_inference.models.base import get_model; get_model('yolox')" && chmod -R a+rX /opt/models
ENV HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
USER pwuser
WORKDIR /work
