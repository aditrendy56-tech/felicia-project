"""
Example Python client for Felicia external runtime integration.

Usage:
  - set env FELICIA_BASE_URL (e.g. http://localhost:3000) or pass `base_url`
  - set env FELICIA_EXTERNAL_API_KEY with the shared key
  - run: python docs/examples/external_client.py

This example uses `requests` (pip install requests).
"""
import os
import sys
import json
import requests


def post_external_chat(message, thread_id=None, source='python-agent', base_url=None, api_key=None):
    base = base_url or os.environ.get('FELICIA_BASE_URL', 'http://localhost:3000')
    url = base.rstrip('/') + '/api/external/chat'

    api_key = api_key or os.environ.get('FELICIA_EXTERNAL_API_KEY')
    if not api_key:
        raise RuntimeError('FELICIA_EXTERNAL_API_KEY not set')

    payload = {
        'message': message,
        'threadId': thread_id,
        'source': source,
    }

    headers = {
        'Content-Type': 'application/json',
        'x-felicia-key': api_key,
    }

    resp = requests.post(url, headers=headers, data=json.dumps(payload), timeout=15)
    resp.raise_for_status()
    return resp.json()


def main():
    msg = 'Hello from Python voice agent — testing external chat.'
    try:
        result = post_external_chat(msg)
        print('Reply:', result.get('reply'))
        print('ThreadId:', result.get('threadId'))
        print('MemoryUsed:', result.get('memoryUsed'))
    except Exception as e:
        print('Error calling external chat:', e)
        sys.exit(1)


if __name__ == '__main__':
    main()
