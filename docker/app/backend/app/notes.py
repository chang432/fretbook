"""Private sheets stored in R2 under sheets/<verified Clerk user ID>/."""

import json
import os
import re
from functools import wraps

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from flask import Blueprint, Response, g, jsonify, request

from .auth import authenticated_user

notes = Blueprint('notes', __name__)
MAX_UPLOAD_BYTES = 512 * 1024
NAME = re.compile(r'[a-z0-9]+(?:_[a-z0-9]+)*')
_client = None


def _s3():
    global _client
    if _client is None:
        _client = boto3.client('s3', endpoint_url=os.environ['FRETBOOK_R2_ENDPOINT'], region_name='auto',
                               config=Config(signature_version='s3v4', connect_timeout=3, read_timeout=10))
    return _client


def private(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        user, error = authenticated_user()
        if error:
            return error
        if not os.environ.get('FRETBOOK_NOTES_BUCKET') or not os.environ.get('FRETBOOK_R2_ENDPOINT'):
            return jsonify(error='the sheets bucket is not configured'), 503
        g.sheet_prefix = f'sheets/{user}/'
        return f(*args, **kwargs)
    return wrapped


def _key(slug):
    return f'{g.sheet_prefix}{slug}.json'


def _bucket():
    return os.environ['FRETBOOK_NOTES_BUCKET']


def _missing(error):
    return error.response.get('ResponseMetadata', {}).get('HTTPStatusCode') == 404 or error.response.get('Error', {}).get('Code') in ('404', 'NoSuchKey', 'NotFound')


def _body():
    body = request.get_data(cache=False)
    try:
        data = json.loads(body)
        valid = (isinstance(data, dict) and data.get('format') == 'fretbook' and data.get('version') == 14
                 and isinstance(data.get('title'), str) and isinstance(data.get('rows'), list) and data['rows']
                 and all(isinstance(row, dict) and isinstance(row.get('columns'), list) for row in data['rows'])
                 and isinstance(data.get('ties'), list) and isinstance(data.get('marks'), list))
        if valid:
            return body
    except (ValueError, UnicodeDecodeError):
        pass
    return None


@notes.after_request
def no_store(response):
    response.headers['Cache-Control'] = 'private, no-store'
    return response


@notes.get('/sheets')
@private
def index():
    try:
        paginator = _s3().get_paginator('list_objects_v2')
        result = []
        for page in paginator.paginate(Bucket=_bucket(), Prefix=g.sheet_prefix):
            for item in page.get('Contents', []):
                key = item['Key']
                name = key[len(g.sheet_prefix):]
                if name.endswith('.json') and NAME.fullmatch(name[:-5]):
                    result.append({'slug': name[:-5], 'title': name[:-5]})
        return jsonify(sorted(result, key=lambda entry: entry['slug']))
    except (BotoCoreError, ClientError):
        return jsonify(error='the sheets bucket cannot be reached'), 503


@notes.get('/sheets/<slug>')
@private
def get_sheet(slug):
    if not NAME.fullmatch(slug):
        return jsonify(error='no such sheet'), 404
    try:
        body = _s3().get_object(Bucket=_bucket(), Key=_key(slug))['Body'].read()
        json.loads(body)
        return Response(body, mimetype='application/json')
    except ClientError as error:
        if _missing(error):
            return jsonify(error='no such sheet'), 404
        return jsonify(error='the sheets bucket cannot be reached'), 503
    except (BotoCoreError, ValueError, UnicodeDecodeError):
        return jsonify(error='the sheet could not be read'), 503


@notes.route('/sheets/<slug>', methods=['PUT', 'POST', 'DELETE'])
@private
def write_sheet(slug):
    if not NAME.fullmatch(slug):
        return jsonify(error='invalid sheet name'), 400
    body = None if request.method == 'DELETE' else _body()
    if request.method != 'DELETE' and body is None:
        return jsonify(error='that is not a current Fretbook export'), 400
    try:
        key = _key(slug)
        if request.method == 'DELETE':
            _s3().head_object(Bucket=_bucket(), Key=key)
            _s3().delete_object(Bucket=_bucket(), Key=key)
        else:
            # Conditional puts avoid overwriting another request's new sheet.
            options = {'IfNoneMatch': '*'} if request.method == 'PUT' else {'IfMatch': '*'}
            _s3().put_object(Bucket=_bucket(), Key=key, Body=body, ContentType='application/json',
                             CacheControl='private, no-store', **options)
        return jsonify(slug=slug), 201 if request.method == 'PUT' else 200
    except ClientError as error:
        code = error.response.get('ResponseMetadata', {}).get('HTTPStatusCode')
        if request.method == 'PUT' and code in (409, 412):
            return jsonify(error='that name is taken'), 409
        if _missing(error) or (request.method == 'POST' and code == 412):
            return jsonify(error='no such sheet'), 404
        return jsonify(error='the sheet could not be saved'), 503
    except BotoCoreError:
        return jsonify(error='the sheets bucket cannot be reached'), 503
