FROM public.ecr.aws/amazonlinux/amazonlinux:2022
RUN yum install python3 && \
curl -O https://bootstrap.pypa.io/get-pip.py && \
python3 get-pip.py && \
pip install --upgrade pip && \
pip install flask 

RUN alias python=python3

ENV FLASK_APP app.py
ENV PLATFORM 'Amazon ECS'
EXPOSE 8080

WORKDIR /app
COPY . /app/

CMD ["python3", "app.py"]