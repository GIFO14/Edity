"""Lossless prompt compaction and bounded, non-echoing model diagnostics."""
from copy import deepcopy
import json

CONTEXT_LIMIT = 'EDITY_AI_CONTEXT_LIMIT'
CONTEXT_MESSAGE = CONTEXT_LIMIT + ': The editing context exceeds the model input limit. No new edits were applied in this turn.'


def is_context_limit(error):
    value = str(error).lower()
    return any(term in value for term in ('edity_ai_context_limit', 'input_too_large',
                                          'input exceeds the maximum length'))


def safe_model_error(error):
    if is_context_limit(error):
        return CONTEXT_MESSAGE
    # CLI failures can echo the input document. Never persist that output in
    # chat or feed it back to the next model turn.
    return 'Codex could not answer. Check your Codex sign-in and internet connection, then try again.'


def compact_payload(context, results, max_chars=900_000):
    context = deepcopy(context)
    words = context.get('words', [])
    # Preserve all words and stable indices/times, factoring only equal fields.
    defaults = {}
    for key in ('clipId', 'confidence'):
        if words and all(key in w and w[key] == words[0].get(key) for w in words):
            defaults[key] = words[0][key]
            for word in words:
                del word[key]
    if defaults:
        context['wordDefaults'] = defaults
    context['history'] = [item for item in context.get('history', [])
                          if item.get('role') in ('user', 'assistant')]
    # The complete action schema embeds the composition types already. Only
    # remove the second copy when its definitions actually contain Element.
    capabilities = context.get('capabilities', {})
    if 'Element' in capabilities.get('actionSchema', {}).get('$defs', {}):
        capabilities.pop('compositionSchema', None)
    results = deepcopy(results)
    for result in results:
        if 'error' in result:
            result['error'] = (CONTEXT_MESSAGE if is_context_limit(result['error'])
                               else str(result['error'])[:1500])

    def encode():
        return json.dumps({'context': context, 'results': results},
                          ensure_ascii=False, separators=(',', ':'))
    prompt = encode()
    if len(prompt) > max_chars and words:
        # Row representation is lossless; no hidden truncation or reindexing.
        fields = list(dict.fromkeys(key for word in words for key in word))
        context['wordFields'] = fields
        context['wordEncoding'] = 'rows'
        context['words'] = [[word.get(key) for key in fields] for word in words]
        prompt = encode()
    if len(prompt) > max_chars:
        raise RuntimeError(CONTEXT_MESSAGE)
    return prompt
