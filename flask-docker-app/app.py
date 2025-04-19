# from flask import Flask, escape, request, render_template
import flask
import datetime
import platform
import os
import urllib.request
import logging

app = flask.Flask(__name__)


@app.route('/')
def hello():
    name = flask.request.args.get("name", "Flask-demo")
    time = datetime.datetime.now()
    python_version = platform.python_version()
    aws_platform = os.environ.get('PLATFORM', 'Amazon Web Services')

    applicationId = os.environ['APPCONFIG_APPLICATION_ID']
    environment = os.environ['APPCONFIG_ENVIRONMENT']
    configurationId = os.environ['APPCONFIG_CONFIGURATION_ID']
    featureFlag = os.environ['FEATURE_FLAG_NAME']

    url = 'http://localhost:2772/applications/' + applicationId + '/environments/' + environment + '/configurations/' + configurationId + '?flag=' + featureFlag;

    httml_template_name = "hello-1.html"
    try:
        contents = urllib.request.urlopen(url).read()

        if (contents.data.enabled == True):
            httml_template_name = 'hello.html'
    
    except Exception as Argument: 
        logging.exception("Error occurred while calling AppConfigAgent") 

    logging.exception("Log test") 

    return flask.render_template(httml_template_name,
                                 platform=aws_platform,
                                 flask_version=flask.__version__,
                                 python_version=python_version,
                                 flask_url='https://palletsprojects.com/p/flask/',
                                 time=time,
                                 name=name)


if __name__ == '__main__':
    app.run(
        debug=os.getenv('FLASK_DEBUG',False),
        host='0.0.0.0',
        port=8080
    )

