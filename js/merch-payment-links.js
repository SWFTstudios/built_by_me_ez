/**
 * Stripe Payment Links — one per t-shirt colorway + size ($35 each).
 * Each link uses a descriptively named product:
 *   Built By Me EZ Logo T-Shirt — {Black|Brown|Blue} / {XS|S|M|L|XL}
 * Created in Stripe account Built by MeEz (acct_1RNkVDEO3guv2SPL).
 *
 * Checkout appends client_reference_id=logo-tshirt-{color}-{size} for webhooks.
 */
window.MERCH_PAYMENT_LINKS = {
  black: {
    XS: 'https://buy.stripe.com/6oU9ATffDbkh7g45PC0480p',
    S: 'https://buy.stripe.com/00w7sL4AZ2NLcAodi40480r',
    M: 'https://buy.stripe.com/cNiaEX0kJ9c90RG2Dq0480s',
    L: 'https://buy.stripe.com/9B6cN5ebzewt1VKem80480q',
    XL: 'https://buy.stripe.com/00w28r0kJ1JHasg6TG0480t',
  },
  brown: {
    XS: 'https://buy.stripe.com/9B65kD8Rf741bwk1zm0480u',
    S: 'https://buy.stripe.com/6oU5kDc3r8851VK7XK0480v',
    M: 'https://buy.stripe.com/eVq14nd7v4VT43Sfqc0480w',
    L: 'https://buy.stripe.com/28EcN5gjH4VTbwk2Dq0480x',
    XL: 'https://buy.stripe.com/7sYaEX1oN4VTcAo91O0480y',
  },
  blue: {
    XS: 'https://buy.stripe.com/8x28wPd7v2NLasgdi40480B',
    S: 'https://buy.stripe.com/aFadR9c3rgEBbwk1zm0480A',
    M: 'https://buy.stripe.com/5kQ28rffDagd0RGce00480C',
    L: 'https://buy.stripe.com/eVq9ATebz3RPcAo0vi0480z',
    XL: 'https://buy.stripe.com/3cIdR9ebzagd8k85PC0480D',
  },
};
