# -*- coding: utf-8 -*-
"""Read-only account-wallet query. Only sanitized amounts leave this process."""
import json
import hashlib
import os
import ssl
import sys
import urllib.request
from decimal import Decimal, InvalidOperation
from pathlib import Path

import yaml


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('redirect_rejected')


def wallets(value):
    if not isinstance(value, dict):
        raise ValueError('invalid_response')
    totals = {}
    for field, target in [('normal_wallets', 'toppedUp'), ('bonus_wallets', 'granted')]:
        rows = value.get(field)
        if not isinstance(rows, list):
            raise ValueError('invalid_response')
        for row in rows:
            currency = row.get('currency')
            if currency not in ('CNY', 'USD'):
                raise ValueError('invalid_currency')
            amount = Decimal(str(row.get('balance')))
            if not amount.is_finite() or amount < 0:
                raise ValueError('invalid_amount')
            item = totals.setdefault(currency, {'toppedUp': Decimal(0), 'granted': Decimal(0)})
            item[target] += amount
    return [{'currency': currency, **{key: format(amount, 'f') for key, amount in row.items()},
             'total': format(row['toppedUp'] + row['granted'], 'f')}
            for currency, row in sorted(totals.items())]


def account_grant():
    home = Path(os.environ.get('DSH_HOME') or Path.home() / '.dsh')
    document = yaml.safe_load((home / '.credentials.yaml').read_text(encoding='utf-8'))
    record = document.get('records', {}).get('deepseek-account-platform/default', {})
    grant = record.get('payload', {}) if record.get('kind') == 'grant' else {}
    # Never send a credential to a configurable URL or follow a redirect with it.
    if grant.get('issuer') != 'https://platform.deepseek.com' or not isinstance(grant.get('token'), str):
        raise ValueError('login_required')
    return home, grant


def binding(grant):
    return hashlib.sha256((grant['issuer'] + '\n' + grant['token']).encode()).hexdigest()


def query_balance():
    home, grant = account_grant()
    context = ssl.create_default_context()
    ca = home / 'kaspersky-ca.pem'
    if ca.is_file():
        context.load_verify_locations(cafile=str(ca))
        # Python 3.13 strict X.509 rejects Kaspersky's trusted root without AKI.
        # Keep certificate verification and hostname checking; match Node's non-strict validation.
        context.verify_flags &= ~ssl.VERIFY_X509_STRICT
    opener = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPSHandler(context=context))
    request = urllib.request.Request('https://platform.deepseek.com/api/v0/users/get_user_summary',
                                     headers={'x-dsh-auth-token': grant['token'], 'Accept': 'application/json'})
    with opener.open(request, timeout=12) as response:
        raw = response.read(65537)
    if len(raw) > 65536:
        raise ValueError('invalid_response')
    result = json.loads(raw)
    data = result.get('data', {})
    if result.get('code') != 0 or data.get('biz_code') != 0:
        raise ValueError('account_unavailable')
    return {'wallets': wallets(data.get('biz_data')), 'accountBinding': binding(grant)}


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    try:
        result = {'accountBinding': binding(account_grant()[1])} if '--identity' in sys.argv else query_balance()
        print(json.dumps(result, ensure_ascii=False))
    except Exception as error:
        # Neither server error bodies nor credential-bearing exceptions are reported.
        safe = str(error) if isinstance(error, ValueError) and str(error) in {
            'login_required', 'redirect_rejected', 'invalid_response', 'invalid_currency',
            'invalid_amount', 'account_unavailable'} else 'balance_unavailable'
        print(json.dumps({'error': safe}))
        sys.exit(1)
