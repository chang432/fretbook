"""Authenticate Clerk session tokens before accessing a user's sheets."""

import base64
import binascii
import os
import re
from functools import lru_cache

import jwt
from flask import jsonify, request
from jwt import PyJWKClient


@lru_cache(maxsize=4)
def _issuer(key):
    # Clerk's publishable key encodes the instance's frontend API hostname.
    if not key.startswith(('pk_test_', 'pk_live_')):
        raise ValueError('missing Clerk publishable key')
    encoded = key.split('_', 2)[2]
    hostname = base64.b64decode(encoded + '=' * (-len(encoded) % 4), validate=True).decode()
    if not hostname.endswith('$') or not re.fullmatch(r'[A-Za-z0-9.-]+', hostname[:-1]):
        raise ValueError('invalid Clerk publishable key')
    return 'https://' + hostname[:-1]


@lru_cache(maxsize=4)
def _jwks(issuer):
    return PyJWKClient(issuer + '/.well-known/jwks.json', timeout=5)


def authenticated_user():
    """Return the signed user ID, or a fail-closed HTTP response."""
    authorization = request.headers.get('Authorization', '')
    if not authorization.startswith('Bearer ') or not authorization[7:]:
        return None, (jsonify(error='sign in required'), 401)
    try:
        issuer = _issuer(os.environ.get('VITE_CLERK_PUBLISHABLE_KEY', ''))
        signing_key = _jwks(issuer).get_signing_key_from_jwt(authorization[7:])
        claims = jwt.decode(authorization[7:], signing_key.key, algorithms=['RS256'], issuer=issuer,
                            options={'require': ['exp', 'nbf', 'iat', 'iss', 'sub'], 'verify_aud': False}, leeway=5)
        user_id = claims['sub']
        if not isinstance(user_id, str) or not re.fullmatch(r'user_[A-Za-z0-9]+', user_id):
            raise jwt.InvalidTokenError('invalid subject')
        if claims.get('sts') == 'pending':
            raise jwt.InvalidTokenError('session is pending')
        parties = [p.strip() for p in os.environ.get('CLERK_AUTHORIZED_PARTIES', '').split(',') if p.strip()]
        if not parties:
            return None, (jsonify(error='authentication is not configured'), 503)
        if claims.get('azp') not in parties:
            raise jwt.InvalidTokenError('invalid authorized party')
        return user_id, None
    except (ValueError, UnicodeError, binascii.Error, jwt.PyJWTError):
        return None, (jsonify(error='invalid or expired session'), 401)
