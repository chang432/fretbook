"""Authentication and ownership checks across the full Flask API."""
import base64
import io
import json
import time
import unittest
from unittest.mock import patch

import jwt
from botocore.exceptions import ClientError
from cryptography.hazmat.primitives.asymmetric import rsa

from app import create_app

ISSUER = 'https://example.clerk.accounts.dev'
KEY = 'pk_test_' + base64.b64encode(b'example.clerk.accounts.dev$').decode().rstrip('=')
PRIVATE = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def token(user='user_alice', key=PRIVATE, **overrides):
    now = int(time.time())
    claims = {'iss': ISSUER, 'sub': user, 'sid': 'sess_abc', 'azp': 'http://localhost:5173',
              'iat': now, 'nbf': now - 1, 'exp': now + 60}
    claims.update(overrides)
    return jwt.encode(claims, key, algorithm='RS256', headers={'kid': 'test'})


def error(status):
    return ClientError({'ResponseMetadata': {'HTTPStatusCode': status}, 'Error': {'Code': str(status)}}, 'test')


class Store:
    def __init__(self):
        self.objects = {}

    def get_paginator(self, _name):
        return self

    def paginate(self, Bucket, Prefix):
        return [{'Contents': [{'Key': key} for key in self.objects if key.startswith(Prefix)]}]

    def get_object(self, Bucket, Key):
        if Key not in self.objects:
            raise error(404)
        return {'Body': io.BytesIO(self.objects[Key])}

    def head_object(self, Bucket, Key):
        if Key not in self.objects:
            raise error(404)

    def put_object(self, Bucket, Key, Body, **kwargs):
        if (kwargs.get('IfNoneMatch') == '*' and Key in self.objects) or (kwargs.get('IfMatch') == '*' and Key not in self.objects):
            raise error(412)
        self.objects[Key] = Body

    def delete_object(self, Bucket, Key):
        self.objects.pop(Key, None)


class SheetsTest(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict('os.environ', {'VITE_CLERK_PUBLISHABLE_KEY': KEY,
                              'CLERK_AUTHORIZED_PARTIES': 'http://localhost:5173',
                              'FRETBOOK_NOTES_BUCKET': 'test', 'FRETBOOK_R2_ENDPOINT': 'https://r2.example'})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.store = Store()
        self.store_patch = patch('app.notes._s3', return_value=self.store)
        self.store_patch.start()
        self.addCleanup(self.store_patch.stop)
        self.jwks = patch('app.auth._jwks')
        self.jwks_mock = self.jwks.start()
        self.addCleanup(self.jwks.stop)
        self.jwks_mock.return_value.get_signing_key_from_jwt.return_value.key = PRIVATE.public_key()
        self.client = create_app().test_client()
        self.sheet = json.dumps({'format': 'fretbook', 'version': 14, 'title': 'Song',
                                 'rows': [{'columns': []}], 'ties': [], 'marks': []})

    def request(self, method, path, user='user_alice', jwt_token=None, **kwargs):
        return self.client.open(path, method=method, headers={'Authorization': 'Bearer ' + (jwt_token or token(user))}, **kwargs)

    def test_authentication_fails_closed(self):
        self.assertEqual(self.client.get('/api/sheets').status_code, 401)
        for bad in (token(key=OTHER), token(exp=int(time.time()) - 60), token(iss='https://wrong.example'),
                    token(user='../other'), token(azp='https://other.example'), token(sts='pending')):
            self.assertEqual(self.request('GET', '/api/sheets', jwt_token=bad).status_code, 401)
        self.assertEqual(self.store.objects, {})

    def test_users_are_isolated_for_every_operation(self):
        url = '/api/sheets/song'
        self.assertEqual(self.request('PUT', url, data=self.sheet).status_code, 201)
        self.assertIn('sheets/user_alice/song.json', self.store.objects)
        self.assertEqual(self.request('GET', '/api/sheets').json, [{'slug': 'song', 'title': 'song'}])
        self.assertEqual(self.request('GET', url, jwt_token=token(sid='sess_different')).status_code, 200)
        self.assertEqual(self.request('GET', '/api/sheets', user='user_bob').json, [])
        for method in ('GET', 'POST', 'DELETE'):
            self.assertEqual(self.request(method, url, user='user_bob', data=self.sheet).status_code, 404)
        self.assertEqual(self.request('PUT', url, data=self.sheet).status_code, 409)
        self.assertEqual(self.request('PUT', url, user='user_bob', data=self.sheet).status_code, 201)
        self.assertEqual(self.request('DELETE', url).status_code, 200)
        self.assertEqual(self.request('GET', url).status_code, 404)
        response = self.request('GET', url, user='user_bob')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['Cache-Control'], 'private, no-store')
        self.assertEqual(self.request('POST', url, user='user_bob', data=self.sheet).status_code, 200)


if __name__ == '__main__':
    unittest.main()
